import { NOT_IN_NOTES, rankPassages, type RankedPassage } from "./retrieve.ts";
import type { Citation, Note } from "./types.ts";

export const GEMINI_MODEL = "gemini-4-argon";
export const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const GEMINI_THINKING = "low";
export const GEMINI_TIMEOUT_MS = 12_000;
export const ATLAS_MIN_GAP_MS = 2_000;
export const ATLAS_WINDOW_MS = 60_000;
export const ATLAS_MAX_IN_WINDOW = 15;
export const FRAGMENT_LIMIT = 5;
export const FRAGMENT_CHARS = 700;

/** Shown when the model wrote the reply. Fragments left the browser, so this line does not say they didn't. */
export const FROM_NOTES = "Isto está nas notas. Não acrescentei fatos de fora.";

export const ATLAS_SYSTEM = `Você responde perguntas usando só os fragmentos de notas que vieram na mensagem. Regras:
- Responda no idioma da pergunta. Curto e direto.
- Não use conhecimento de fora. Não complete buracos. Se os fragmentos não respondem, unknown fica true, answer fica vazio e citations fica vazio.
- citations só pode trazer quote copiado letra por letra de um fragmento, e o noteId desse fragmento. Sem paráfrase.
- Escrita simples: sem inflar a importância, sem clichê. Não escreva "mergulhar fundo" nem "tapeçaria". Não use a fórmula "não é apenas X, mas Y". Não abuse de travessões. Prefira "é" e "tem" a "serve como".
- answer tem uma ou duas frases e não fala de modelo, API, privacidade ou aparelho.`;

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "atlas_answer",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        unknown: { type: "boolean" },
        citations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              noteId: { type: "string" },
              quote: { type: "string" },
            },
            required: ["noteId", "quote"],
          },
        },
      },
      required: ["answer", "unknown", "citations"],
    },
  },
} as const;

export type Fragment = { noteId: string; title: string; text: string; score: number };

export type AtlasOutcome =
  | { kind: "answer"; content: string; citations: Citation[] }
  | { kind: "unknown" }
  | { kind: "fallback"; reason: string };

export type AtlasGate = { allow(at?: number): boolean };

export function createAtlasGate(): AtlasGate {
  const hits: number[] = [];
  return {
    allow(at = Date.now()): boolean {
      const recent = hits.filter((time) => at - time < ATLAS_WINDOW_MS);
      hits.length = 0;
      hits.push(...recent);
      const last = hits.at(-1) ?? Number.NEGATIVE_INFINITY;
      if (hits.length >= ATLAS_MAX_IN_WINDOW || at - last < ATLAS_MIN_GAP_MS) return false;
      hits.push(at);
      return true;
    },
  };
}

export const atlasGate = createAtlasGate();

function literalNeedles(query: string): string[] {
  return query.includes("@") ? ["@"] : [];
}

/**
 * Passages that may be sent to the model. Sealed notes are dropped even when
 * the opened body is sitting on the note (presentNotes keeps the seal).
 * The local tokenizer throws "@" away, so a question that uses it still
 * keeps the passage that actually contains the character.
 */
export function selectFragments(query: string, notes: Note[]): Fragment[] {
  const open = notes.filter((note) => !note.seal);
  const ranked = rankPassages(query, open);
  const needles = literalNeedles(query);
  const picked: Fragment[] = [];
  const seen = new Set<string>();
  const push = (item: RankedPassage) => {
    if (picked.length >= FRAGMENT_LIMIT) return;
    const text = item.text.slice(0, FRAGMENT_CHARS);
    const key = `${item.noteId}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    picked.push({ noteId: item.noteId, title: item.title, text, score: item.score });
  };
  if (needles.length) {
    for (const item of ranked) {
      if (needles.every((needle) => item.text.includes(needle))) push(item);
    }
  }
  const top = ranked[0]?.score ?? 0;
  const floor = Math.max(0.3, top * 0.58);
  for (const item of ranked) {
    if (item.score < floor) break;
    push(item);
  }
  return picked;
}

export function parseAtlasRequest(input: unknown): { question: string; fragments: Fragment[] } {
  if (!input || typeof input !== "object") throw new Error("Pedido inválido.");
  const data = input as { question?: unknown; fragments?: unknown };
  const question = String(data.question ?? "").trim();
  if (question.length < 1 || question.length > 500) throw new Error("Pedido inválido.");
  if (!Array.isArray(data.fragments) || data.fragments.length > FRAGMENT_LIMIT) {
    throw new Error("Pedido inválido.");
  }
  const fragments: Fragment[] = [];
  for (const item of data.fragments) {
    if (!item || typeof item !== "object") throw new Error("Pedido inválido.");
    const row = item as { noteId?: unknown; title?: unknown; text?: unknown; score?: unknown };
    const noteId = String(row.noteId ?? "").trim();
    const title = String(row.title ?? "").trim();
    const text = String(row.text ?? "").trim();
    const score = Number(row.score);
    if (
      !noteId ||
      noteId.length > 80 ||
      title.length > 160 ||
      text.length < 24 ||
      text.length > FRAGMENT_CHARS
    ) {
      throw new Error("Pedido inválido.");
    }
    fragments.push({
      noteId,
      title: title || "Nota",
      text,
      score: Number.isFinite(score) ? score : 1,
    });
  }
  return { question, fragments };
}

function userContent(question: string, fragments: Fragment[]): string {
  const blocks = fragments.map(
    (fragment) => `[${fragment.noteId}] ${fragment.title}\n${fragment.text}`,
  );
  return `Pergunta:\n${question}\n\nFragmentos:\n${blocks.join("\n\n")}`;
}

export function buildGeminiPayload(question: string, fragments: Fragment[]) {
  return {
    model: GEMINI_MODEL,
    reasoning_effort: GEMINI_THINKING,
    max_tokens: 2048,
    messages: [
      { role: "system", content: ATLAS_SYSTEM },
      { role: "user", content: userContent(question, fragments) },
    ],
    response_format: RESPONSE_FORMAT,
  };
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function unwrap(quote: string): string {
  const trimmed = quote.trim();
  const pairs = [
    ['"', '"'],
    ["«", "»"],
    ["“", "”"],
    ["'", "'"],
  ];
  for (const [open, close] of pairs) {
    if (
      trimmed.startsWith(open) &&
      trimmed.endsWith(close) &&
      trimmed.length > open.length + close.length
    ) {
      return trimmed.slice(open.length, trimmed.length - close.length).trim();
    }
  }
  return trimmed;
}

function confirmedQuote(quote: string, text: string): string | null {
  const raw = unwrap(quote);
  if (raw.length < 8) return null;
  if (text.includes(raw)) return raw;
  const collapsed = squash(raw);
  if (collapsed.length < 8) return null;
  if (squash(text).includes(collapsed)) return collapsed;
  return null;
}

export function verifyCitations(raw: unknown, fragments: Fragment[]): Citation[] {
  if (!Array.isArray(raw)) return [];
  const citations: Citation[] = [];
  const used = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const noteId = String((item as { noteId?: unknown }).noteId ?? "").trim();
    const quote = String((item as { quote?: unknown }).quote ?? "");
    if (!noteId) continue;
    let confirmed: { title: string; excerpt: string; score: number } | null = null;
    for (const fragment of fragments) {
      if (fragment.noteId !== noteId) continue;
      const excerpt = confirmedQuote(quote, fragment.text);
      if (!excerpt) continue;
      confirmed = { title: fragment.title, excerpt, score: fragment.score };
      break;
    }
    if (!confirmed) continue;
    const key = `${noteId}:${confirmed.excerpt}`;
    if (used.has(key)) continue;
    used.add(key);
    citations.push({
      noteId,
      title: confirmed.title,
      excerpt: confirmed.excerpt,
      score: confirmed.score,
    });
    if (citations.length >= FRAGMENT_LIMIT) break;
  }
  return citations;
}

export function acceptModel(raw: unknown, fragments: Fragment[]): AtlasOutcome {
  if (!raw || typeof raw !== "object") return { kind: "fallback", reason: "bad-shape" };
  const data = raw as { answer?: unknown; unknown?: unknown; citations?: unknown };
  if (data.unknown === true) return { kind: "unknown" };
  const citations = verifyCitations(data.citations, fragments);
  if (!citations.length) return { kind: "unknown" };
  const answer = typeof data.answer === "string" ? data.answer.trim().slice(0, 600) : "";
  const prose =
    answer ||
    citations.map((item, index) => `(${index + 1}) ${item.title} — ${item.excerpt}`).join("\n");
  return { kind: "answer", content: `${FROM_NOTES}\n\n${prose}`, citations };
}

export function parseModelJson(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("json");
  }
}

export function clipAtlasLog(text: string, secret = ""): string {
  const hidden = secret ? text.split(secret).join("") : text;
  return hidden
    .replace(/AIza[\w-]{8,}/g, "[key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function messageText(body: unknown): string {
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part)
        return String((part as { text?: unknown }).text ?? "");
      return "";
    })
    .join("");
}

/** Ask whether a key is configured before posting any note text. */
export async function consultAtlas(
  input: { question: string; fragments: Fragment[] },
  deps: {
    ready: () => Promise<boolean>;
    ask: (input: { question: string; fragments: Fragment[] }) => Promise<AtlasOutcome>;
  },
): Promise<AtlasOutcome | null> {
  try {
    if (!(await deps.ready())) return null;
    return await deps.ask(input);
  } catch {
    return null;
  }
}

async function geminiFailure(response: Response, apiKey: string): Promise<string> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  const detail = clipAtlasLog(body, apiKey);
  return detail ? `http-${response.status} ${detail}` : `http-${response.status}`;
}

export async function answerWithGemini(
  input: { question: string; fragments: Fragment[] },
  deps: {
    apiKey: string | undefined;
    fetchImpl?: typeof fetch;
    gate?: AtlasGate;
    now?: number;
    timeoutMs?: number;
  },
): Promise<AtlasOutcome> {
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return { kind: "fallback", reason: "missing-key" };
  if (!input.fragments.length) return { kind: "fallback", reason: "no-fragments" };
  if (deps.gate && !deps.gate.allow(deps.now)) return { kind: "fallback", reason: "rate-limit" };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const payload = buildGeminiPayload(input.question, input.fragments);
  const send = (body: unknown, signal: AbortSignal) =>
    fetchImpl(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  try {
    const signal = AbortSignal.timeout(deps.timeoutMs ?? GEMINI_TIMEOUT_MS);
    let response = await send(payload, signal);
    if (response.status === 400) {
      const first = await geminiFailure(response, apiKey);
      response = await send({ ...payload, response_format: { type: "json_object" } }, signal);
      if (!response.ok) {
        const second = await geminiFailure(response, apiKey);
        return { kind: "fallback", reason: second === first ? first : `${first} | ${second}` };
      }
    } else if (!response.ok) {
      return { kind: "fallback", reason: await geminiFailure(response, apiKey) };
    }
    let parsed: unknown;
    try {
      parsed = parseModelJson(messageText(await response.json()));
    } catch {
      return { kind: "fallback", reason: "bad-json" };
    }
    const accepted = acceptModel(parsed, input.fragments);
    if (accepted.kind === "fallback") return { kind: "fallback", reason: accepted.reason };
    return accepted;
  } catch (error) {
    const message = error instanceof Error ? error.name : "error";
    return { kind: "fallback", reason: `exception ${clipAtlasLog(message, apiKey)}` };
  }
}

export function resolveAtlasTurn(
  outcome: AtlasOutcome | null,
  local: { content: string; citations?: Citation[]; result: string },
): { content: string; citations?: Citation[]; result: string } {
  if (!outcome || outcome.kind === "fallback") {
    return { content: local.content, citations: local.citations, result: local.result };
  }
  if (outcome.kind === "unknown") {
    return { content: NOT_IN_NOTES, citations: undefined, result: "nenhum fragmento" };
  }
  return {
    content: outcome.content,
    citations: outcome.citations,
    result: `${outcome.citations.length} fragmentos`,
  };
}
