import { createServerFn } from "@tanstack/react-start";
import { captureFromModel, getPattern, isPatternId, localDistill, type Capture, type PatternId } from "./patterns";

export type WeaveResult = { ok: true; capture: Capture } | { ok: false; error: string };

const SYSTEM = `Você extrai estrutura de um texto para um caderno de notas. Regras:
- Use apenas o texto fornecido. Não complemente com conhecimento de fora.
- quotes só pode conter frases literais do texto. Se não houver, use lista vazia.
- numbers só pode conter números que aparecem no texto.
- facts, insights e recommendations devem poder ser apontados no texto, sem conselho novo.
- Nomes de ideias: 2 a 5 palavras, sem colchetes.
- Escreva em português.
- Responda somente JSON com as chaves title, summary, ideas, quotes, facts, insights, recommendations, numbers.
- ideas é uma lista de objetos {name, point}. numbers é uma lista de números.
- Se uma seção não estiver sustentada, use lista vazia ou string vazia.`;

let lastModelCall = 0;

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Link inválido.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Só leio links http e https.");
  if (isBlockedHost(url.hostname)) throw new Error("Esse endereço não pode ser lido daqui.");
  return url;
}

async function readResponse(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (size < limit) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    text += decoder.decode(chunk.value, { stream: true });
    if (size >= limit) {
      await reader.cancel();
      break;
    }
  }
  text += decoder.decode();
  return text;
}

async function fetchPublic(raw: string, accept: string): Promise<{ url: URL; text: string; type: string }> {
  let current = assertPublicUrl(raw);
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { accept, "user-agent": "Locus/1.0 (caderno local; leitura de fonte)" },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("O link redirecionou sem destino.");
      current = assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`A página respondeu ${response.status}. Cole o texto.`);
    const type = response.headers.get("content-type") ?? "";
    if (/pdf|octet-stream|audio|video/i.test(type)) throw new Error("Não leio esse formato. Cole o texto ou a transcrição.");
    const text = await readResponse(response, 350_000);
    return { url: current, text, type };
  }
  throw new Error("Redirecionamentos demais nesse link.");
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|h1|h2|h3|li|br|tr|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&#(\d+);/g, (_, value: string) => {
      const code = Number(value);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : " ";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i");
  return (html.match(pattern)?.[1] ?? html.match(reverse)?.[1] ?? "").replace(/"/g, '"').replace(/&/g, "&");
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const shorts = /^\/shorts\/([^/]+)/.exec(url.pathname);
    if (shorts?.[1]) return shorts[1];
  }
  return null;
}

async function resolveSource(source: string): Promise<{ text: string; label: string }> {
  const trimmed = source.trim();
  const first = trimmed.split(/\s+/)[0] ?? "";
  const rest = trimmed.slice(first.length).trim();
  if (!/^https?:\/\/\S+$/i.test(first) || rest.length > 40) {
    return { text: trimmed.slice(0, 12_000), label: "texto colado" };
  }
  const url = assertPublicUrl(first);
  const video = youtubeId(url);
  if (video) {
    const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(video)}`;
    let title = "";
    let author = "";
    let description = "";
    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, {
        signal: AbortSignal.timeout(8000),
      });
      if (oembed.ok) {
        const body = (await oembed.json()) as { title?: string; author_name?: string };
        title = body.title ?? "";
        author = body.author_name ?? "";
      }
    } catch {
      /* oEmbed é opcional */
    }
    try {
      const page = await fetchPublic(watch, "text/html");
      description = metaContent(page.text, "og:description") || metaContent(page.text, "description");
      if (!title) title = metaContent(page.text, "og:title");
    } catch {
      /* a página do vídeo pode bloquear a leitura */
    }
    const text = [title && `Título: ${title}`, author && `Canal: ${author}`, description && description].filter(Boolean).join("\n\n");
    if (text.replace(/\s/g, "").length < 280) {
      throw new Error("Desse vídeo só veio o título. Cole a transcrição depois de extract_wisdom para extrair sem inventar.");
    }
    return { text: text.slice(0, 12_000), label: title ? `YouTube · ${title}` : watch };
  }
  const page = await fetchPublic(url.toString(), "text/html, text/plain;q=0.9");
  const text = /html/i.test(page.type) ? htmlToText(page.text) : page.text.trim();
  if (text.replace(/\s/g, "").length < 280) throw new Error("A página não trouxe texto suficiente. Cole o artigo.");
  const title = /html/i.test(page.type) ? metaContent(page.text, "og:title") : "";
  return { text: text.slice(0, 12_000), label: title || url.hostname };
}

function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("json");
  }
}

async function askModel(patternId: PatternId, text: string): Promise<unknown> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) return null;
  const now = Date.now();
  if (now - lastModelCall < 4000) throw new Error("Espere um instante antes de outra extração.");
  lastModelCall = now;
  const pattern = getPattern(patternId);
  const payload = {
    model: "grok-4.5",
    temperature: 0.1,
    max_tokens: 1400,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Padrão: ${patternId}\nFoco: ${pattern?.focus ?? ""}\nTexto:\n"""\n${text.slice(0, 8000)}\n"""`,
      },
    ],
  };
  const call = (jsonMode: boolean) =>
    fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify(jsonMode ? { ...payload, response_format: { type: "json_object" } } : payload),
    });
  let response = await call(true);
  if (response.status === 400) response = await call(false);
  if (!response.ok) throw new Error(`O modelo não respondeu (${response.status}).`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return parseModelJson(body.choices?.[0]?.message?.content ?? "");
}

export const weaveSource = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Pedido inválido.");
    const data = input as { patternId?: unknown; source?: unknown };
    const patternId = String(data.patternId ?? "");
    const source = String(data.source ?? "").trim();
    if (!isPatternId(patternId)) throw new Error("Padrão desconhecido.");
    if (source.length < 12 || source.length > 20_000) throw new Error("A fonte está curta ou longa demais.");
    return { patternId, source };
  })
  .handler(async ({ data }): Promise<WeaveResult> => {
    try {
      const resolved = await resolveSource(data.source);
      let capture: Capture;
      try {
        const model = await askModel(data.patternId, resolved.text);
        capture = model
          ? captureFromModel(data.patternId, model, resolved.text, resolved.label)
          : localDistill(data.patternId, resolved.text, resolved.label);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.startsWith("Espere")) return { ok: false, error: message };
        capture = localDistill(
          data.patternId,
          resolved.text,
          resolved.label,
          "O modelo não completou a extração. Segue o filtro local, só com recortes do texto, sem invenção.",
        );
      }
      return { ok: true, capture };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Não consegui ler a fonte." };
    }
  });
