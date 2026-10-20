import { inspectCell } from "./notebook";
import { fold } from "./retrieve";
import type { Note, NotebookCell, NoteDraft } from "./types";

export type PatternId =
  | "extract_wisdom"
  | "summarize"
  | "extract_insights"
  | "extract_recommendations"
  | "map_concepts"
  | "distill_numbers";

export type Pattern = {
  id: PatternId;
  label: string;
  blurb: string;
  focus: string;
};

export const PATTERNS: Pattern[] = [
  {
    id: "extract_wisdom",
    label: "Extrair sabedoria",
    blurb: "Ideias, citações literais, fatos e recomendações.",
    focus: "Extraia ideias nomeáveis, citações literais, fatos, recomendações e uma síntese curta.",
  },
  {
    id: "summarize",
    label: "Resumir",
    blurb: "Síntese curta e os conceitos que a sustentam.",
    focus: "Resuma em poucos parágrafos e nomeie só os conceitos que o texto realmente usa.",
  },
  {
    id: "extract_insights",
    label: "Extrair insights",
    blurb: "O que não é óbvio, ainda ancorado no texto.",
    focus: "Liste insights não óbvios. Cada um precisa poder ser apontado numa frase da fonte.",
  },
  {
    id: "extract_recommendations",
    label: "Extrair recomendações",
    blurb: "Ações práticas, sem conselho inventado.",
    focus: "Liste apenas recomendações ou ações que o texto formula. Não acrescente conselhos seus.",
  },
  {
    id: "map_concepts",
    label: "Mapear conceitos",
    blurb: "Frentes do assunto e a ligação para o canvas.",
    focus: "Separe as frentes do assunto em conceitos curtos e a relação entre eles.",
  },
  {
    id: "distill_numbers",
    label: "Destilar números",
    blurb: "Série numérica pronta para o caderno.",
    focus: "Recolha os números que o texto usa como dados. Não invente série, média nem contexto.",
  },
];

const ALIASES: { id: PatternId; re: RegExp }[] = [
  { id: "extract_wisdom", re: /^(?:\/)?(?:extract_wisdom|extrair\s+sabedoria|extrai\s+sabedoria)\b[:\s-]*([\s\S]*)$/i },
  { id: "summarize", re: /^(?:\/)?(?:summarize|resumir(?:\s+(?:fonte|texto|artigo))?)\b[:\s-]*([\s\S]*)$/i },
  { id: "extract_insights", re: /^(?:\/)?(?:extract_insights|extrair\s+insights|extrai\s+insights)\b[:\s-]*([\s\S]*)$/i },
  {
    id: "extract_recommendations",
    re: /^(?:\/)?(?:extract_recommendations|extrair\s+recomenda[cç][oõ]es|extrai\s+recomenda[cç][oõ]es)\b[:\s-]*([\s\S]*)$/i,
  },
  { id: "map_concepts", re: /^(?:\/)?(?:map_concepts|mapear\s+conceitos|mapeie\s+conceitos)\b[:\s-]*([\s\S]*)$/i },
  { id: "distill_numbers", re: /^(?:\/)?(?:distill_numbers|destilar\s+n[uú]meros|destile\s+n[uú]meros)\b[:\s-]*([\s\S]*)$/i },
];

export function isPatternId(value: string): value is PatternId {
  return PATTERNS.some((pattern) => pattern.id === value);
}

export function getPattern(id: string): Pattern | undefined {
  return PATTERNS.find((pattern) => pattern.id === id);
}

export function matchPattern(text: string): { id: PatternId; source: string } | "need-source" | null {
  const trimmed = text.trim();
  for (const alias of ALIASES) {
    const match = alias.re.exec(trimmed);
    if (!match) continue;
    const source = (match[1] ?? "").trim();
    if (source.length < 12) return "need-source";
    return { id: alias.id, source };
  }
  return null;
}

export type Capture = {
  patternId: PatternId;
  mode: "model" | "local";
  title: string;
  summary: string;
  ideas: { name: string; point: string }[];
  quotes: string[];
  facts: string[];
  insights: string[];
  recommendations: string[];
  numbers: number[];
  sourceLabel: string;
  warning: string;
};

function cleanLine(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export const SAMPLE_SOURCE = `extract_wisdom
Um caderno abre neste aparelho. As contas se atualizam pela dependência, não pela ordem na página. "Mais de um terço dos notebooks públicos não volta a executar." Em uma amostra de 4, 8, 15, 16 e 23, a média só faz sentido depois da série. Antes de gravar qualquer extração, a prévia pede aprovação.`;

export function ideaName(raw: string): string {
  const clean = raw
    .replace(/[[\]|#*`«»“”"]/g, "")
    .replace(/^(?:um|uma|o|a|os|as|este|esta|esse|essa)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 3 || clean.length > 64) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 36 && item.length < 360);
}

function quotesOf(text: string): string[] {
  const found: string[] = [];
  const pattern = /[«“"]([^»”"\n]{16,220})[»”"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && found.length < 5) {
    const quote = cleanLine(match[1] ?? "", 220);
    if (quote) found.push(quote);
  }
  return found;
}

function numbersOf(text: string): number[] {
  const found: number[] = [];
  const pattern = /(?<![A-Za-z])(\d{1,3}(?:[.,]\d+)?|\d{4,7})(?![A-Za-z])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && found.length < 12) {
    const raw = match[1] ?? "";
    const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw.replace(/,/g, "");
    const value = Number(normalized);
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) continue;
    if (Number.isInteger(value) && value >= 1900 && value <= 2100) continue;
    if (found.includes(value)) continue;
    found.push(value);
  }
  return found;
}

function conceptName(clause: string): string {
  const predicate =
    /^(?:n[aã]o|pede|pedem|funde|fundem|executa|executam|volta|voltam|faz|fazem|precisa|precisam|grava|gravam|permite|permitem|separa|separam|mora|moram|trata|tratam|deixa|deixam|usa|usam|abre|abrem|responde|respondem|existe|existem|depende|dependem|fica|ficam|continua|continuam|s[oó])$/i;
  const words = clause
    .replace(/[«“"].*/, "")
    .split(/\s+/)
    .map((word) => word.replace(/[.,;:!?]+$/, ""))
    .filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length >= 1 && predicate.test(word)) break;
    kept.push(word);
    if (kept.length >= 4) break;
  }
  while (kept.length > 1 && /^(?:de|da|do|das|dos|em|para|com|sem|por|e|ou|a|o|que|uma|um)$/i.test(kept[kept.length - 1] ?? "")) {
    kept.pop();
  }
  return ideaName(kept.join(" "));
}

function ideasFrom(text: string): { name: string; point: string }[] {
  const chunks = text
    .split(/\n+|(?<=[.!?])["»”']?\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 28 && !/^[«“"]/.test(item));
  const ideas: { name: string; point: string }[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const clause = chunk.split(/[,:;]/)[0]?.trim() ?? "";
    const name = conceptName(clause);
    const key = fold(name);
    if (!name || seen.has(key) || key.length < 3) continue;
    if (/\d/.test(name) || /^(?:antes|depois|quando|se|embora|em)\b/i.test(name)) continue;
    seen.add(key);
    ideas.push({ name, point: cleanLine(chunk, 240) });
    if (ideas.length >= 5) break;
  }
  return ideas;
}

export function localDistill(patternId: PatternId, text: string, sourceLabel: string, warning = ""): Capture {
  const sentences = sentencesOf(text);
  const quotes = quotesOf(text);
  const numbers = numbersOf(text);
  const ideas = ideasFrom(text);
  const facts = sentences.filter((item) => /\d/.test(item)).slice(0, 5);
  const insights = sentences.filter((item) => /porque|porém|entretanto|implica|significa|na verdade|o ponto/i.test(item)).slice(0, 5);
  const recommendations = sentences.filter((item) => /deve|preciso|recomen|convém|vale|evitar|não faça|antes de/i.test(item)).slice(0, 5);
  const summary = sentences.slice(0, patternId === "summarize" ? 4 : 2).join(" ");
  const titleSeed = ideas[0]?.name || summary.split(/\s+/).slice(0, 6).join(" ") || "Fonte sem título";
  return {
    patternId,
    mode: "local",
    title: ideaName(titleSeed) || "Fonte sem título",
    summary: cleanLine(summary, 700),
    ideas,
    quotes,
    facts,
    insights,
    recommendations,
    numbers,
    sourceLabel,
    warning:
      warning ||
      "Filtro local. Nenhum modelo leu esta fonte: só entram recortes do texto trazido. Nada foi inventado.",
  };
}

function asStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = cleanLine(item, 320);
    if (clean) out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function asIdeas(value: unknown): { name: string; point: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { name: string; point: string }[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    let name = "";
    let point = "";
    if (typeof item === "string") name = ideaName(item);
    else if (item && typeof item === "object") {
      const record = item as { name?: unknown; point?: unknown };
      name = ideaName(String(record.name ?? ""));
      point = cleanLine(String(record.point ?? ""), 280);
    }
    const key = fold(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, point });
    if (out.length >= 6) break;
  }
  return out;
}

function asNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    const number = typeof item === "number" ? item : Number(String(item).replace(",", "."));
    if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) continue;
    if (!out.includes(number)) out.push(number);
    if (out.length >= 12) break;
  }
  return out;
}

function groundedSpan(fragment: string, source: string): boolean {
  const words = fold(fragment)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  if (words.length < 4) return fold(source).includes(fold(fragment));
  const haystack = fold(source);
  for (let index = 0; index <= words.length - 4; index += 1) {
    if (haystack.includes(words.slice(index, index + 4).join(" "))) return true;
  }
  return false;
}

function numberInSource(value: number, source: string): boolean {
  const flat = source.replace(/\s/g, "");
  const forms = [String(value), String(value).replace(".", ",")];
  return forms.some((form) => flat.includes(form));
}

export function captureFromModel(patternId: PatternId, raw: unknown, sourceText: string, sourceLabel: string): Capture {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const local = localDistill(patternId, sourceText, sourceLabel, "");
  const ideas = asIdeas(record.ideas).filter((idea) => groundedSpan(idea.name, sourceText) || groundedSpan(idea.point, sourceText));
  const quotes = asStringList(record.quotes, 5).filter((quote) => groundedSpan(quote, sourceText));
  const facts = asStringList(record.facts, 5).filter((fact) => groundedSpan(fact, sourceText) && (![...fact].some((char) => char >= "0" && char <= "9") || numbersOf(fact).every((value) => numberInSource(value, sourceText))));
  const insights = asStringList(record.insights, 5).filter((item) => groundedSpan(item, sourceText));
  const recommendations = asStringList(record.recommendations, 5).filter((item) => groundedSpan(item, sourceText));
  const numbers = asNumbers(record.numbers).filter((value) => numberInSource(value, sourceText));
  const title = ideaName(String(record.title ?? "")) || local.title;
  const summary = cleanLine(String(record.summary ?? ""), 700);
  return {
    patternId,
    mode: "model",
    title,
    summary: summary || local.summary,
    ideas: ideas.length ? ideas : local.ideas,
    quotes: quotes.length ? quotes : local.quotes,
    facts: facts.length ? facts : local.facts,
    insights: insights.length ? insights : local.insights,
    recommendations: recommendations.length ? recommendations : local.recommendations,
    numbers: numbers.length ? numbers : local.numbers.filter((value) => numberInSource(value, sourceText)),
    sourceLabel,
    warning: "O modelo leu apenas a fonte colada, não as suas notas. Citações e números só permaneceram quando apareciam no texto.",
  };
}

function linkedTitle(name: string, notes: Note[]): string | undefined {
  const exact = notes.find((note) => fold(note.title) === fold(name));
  if (exact) return exact.title;
  const folded = fold(name);
  const hit = notes.find((note) => {
    const title = fold(note.title);
    return title.length >= 8 && (folded.includes(title) || title.includes(folded));
  });
  return hit?.title;
}

function section(title: string, lines: string[]): string {
  if (!lines.length) return "";
  return `## ${title}\n${lines.join("\n")}`;
}

function notebookNames(cells: NotebookCell[]): Set<string> {
  const taken = new Set<string>();
  for (const cell of cells) {
    for (const name of inspectCell(cell.code).defines) taken.add(name);
  }
  return taken;
}

function notebookCells(numbers: number[], cells: NotebookCell[]): string[] {
  if (numbers.length < 2) return [];
  const taken = notebookNames(cells);
  let base = "serie";
  let index = 2;
  while (taken.has(base) || taken.has(`${base}_media`) || taken.has(`${base}_desvio`)) {
    base = `serie_${index}`;
    index += 1;
  }
  const list = numbers
    .slice(0, 12)
    .map((value) => String(value))
    .join(", ");
  const draft = [`${base} = [${list}]`, `${base}_media = mean(${base})`, `${base}_desvio = std(${base})`];
  if (draft.some((code) => inspectCell(code).error)) return [];
  return draft;
}

export function renderCapture(capture: Capture, notes: Note[], cells: NotebookCell[]): { preview: string; draft: NoteDraft } {
  const pattern = getPattern(capture.patternId);
  const label = pattern?.label ?? capture.patternId;
  const noteTitle = `${label} · ${capture.title}`.slice(0, 80);
  const known = notes.filter((note) => {
    const name = fold(note.title);
    if (name.length < 4) return false;
    const blob = fold(`${capture.summary} ${capture.ideas.map((idea) => `${idea.name} ${idea.point}`).join(" ")} ${capture.sourceLabel}`);
    return blob.includes(name);
  });
  const titles = capture.ideas.map((idea) => linkedTitle(idea.name, notes) ?? idea.name);
  const ideaLines = titles.map((title, index) => {
    const point = capture.ideas[index]?.point;
    return point ? `- [[${title}]] — ${point}` : `- [[${title}]]`;
  });
  const fresh = capture.ideas
    .filter((idea) => !linkedTitle(idea.name, notes))
    .slice(0, 5)
    .map((idea) => ({
      title: idea.name,
      body: `Conceito extraído de [[${noteTitle}]] pelo padrão \`${capture.patternId}\`.\n\n${idea.point || "Ainda cabe desenvolver esta frente."}\n\nA ligação existe para o grafo. O texto longo continua na nota de origem.`,
    }));
  const series = notebookCells(capture.numbers, cells);
  const canvas = capture.ideas.length >= 2;
  const pairs: string[] = [];
  for (let index = 0; index < titles.length - 1 && pairs.length < 3; index += 1) {
    const left = titles[index];
    const right = titles[index + 1];
    if (left && right) pairs.push(`[[${left}]] a [[${right}]]`);
  }
  const actions = [
    "cria a nota",
    fresh.length ? `cria ${fresh.length} ${fresh.length === 1 ? "conceito que ainda não está nas notas" : "conceitos que ainda não estão nas notas"}` : "",
    series.length ? `acrescenta ${series.length} células ao caderno` : "",
    canvas ? "posiciona os cartões no canvas" : "",
  ].filter((item) => item !== "");
  const blocks = [
    capture.warning,
    `Padrão \`${capture.patternId}\` · ${capture.mode === "model" ? "modelo" : "filtro local"}.`,
    `Fonte: ${capture.sourceLabel}`,
    section("Síntese", capture.summary ? [capture.summary] : []),
    section("Ideias", ideaLines),
    section(
      "Citações",
      capture.quotes.map((quote) => `> ${quote}`),
    ),
    section(
      "Fatos",
      capture.facts.map((fact) => `- ${fact}`),
    ),
    section(
      "Insights",
      capture.insights.map((item) => `- ${item}`),
    ),
    section(
      "Recomendações",
      capture.recommendations.map((item) => `- ${item}`),
    ),
    section(
      "Já nas notas",
      known.slice(0, 4).map((note) => `- [[${note.title}]]`),
    ),
    series.length
      ? `## Caderno\nA série é definida antes da média e do desvio. O caderno executa essa cadeia pela dependência, não pela posição na página.\n\n\`\`\`\n${series.join("\n")}\n\`\`\``
      : "",
    canvas ? `## Canvas\nEstes conceitos podem ser distribuídos no Canvas ligando ${pairs.join(" e ")}.` : "",
  ].filter((block) => block !== "");
  const body = `${blocks.join("\n\n")}\n`;
  const preview = `${body}\nPré-visualização. Nada foi gravado neste dispositivo. Aprovar ${actions.join(", ")}. Recusar não escreve nada.`;
  return {
    preview,
    draft: { title: noteTitle, body, concepts: fresh, cells: series, canvas },
  };
}
