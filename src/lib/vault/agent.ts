import { wikilinkTitles } from "./markdown";
import { matchPattern } from "./patterns";
import { evalScratch, formatValue, isChart, runNotebook } from "./notebook";
import { composeAnswer, findNote, findNoteLoose, fold, retrieve } from "./retrieve";
import type { Citation, Note, NotebookCell } from "./types";

export const TOOLS: { name: string; readOnly: boolean; summary: string }[] = [
  { name: "vault.search", readOnly: true, summary: "Fragmenta as notas e ranqueia por cosseno e BM25." },
  { name: "vault.read", readOnly: true, summary: "Lê o texto de uma nota pelo título." },
  { name: "graph.related", readOnly: true, summary: "Lista ligações de saída e quem aponta para a nota." },
  { name: "notebook.run", readOnly: true, summary: "Avalia uma expressão no estado do caderno, sem gravar." },
  { name: "vault.create", readOnly: false, summary: "Cria uma nota. Só grava depois da aprovação." },
  { name: "vault.append", readOnly: false, summary: "Acrescenta um parágrafo. Só grava depois da aprovação." },
  { name: "canvas.place", readOnly: false, summary: "Posiciona a nota no canvas. Só move depois da aprovação." },
  { name: "fabric.capture", readOnly: false, summary: "Grava a extração da biblioteca. Só depois da aprovação." },
];

export type Plan =
  | { kind: "reply"; content: string }
  | { kind: "search"; query: string }
  | { kind: "fabric"; patternId: string; source: string }
  | { kind: "tool"; name: string; readOnly: boolean; args: Record<string, string>; preview: string };

function cleanTitle(raw: string): string {
  return raw.replace(/^["'«]|["'»]$/g, "").replace(/[.?!]$/g, "").trim();
}

function titleMentioned(text: string, notes: Note[]): Note | undefined {
  const wiki = /\[\[([^\]|]+)/.exec(text);
  if (wiki?.[1]) {
    const found = findNote(notes, wiki[1]);
    if (found) return found;
  }
  const folded = fold(text);
  const hits = notes.filter((note) => folded.includes(fold(note.title)));
  hits.sort((a, b) => b.title.length - a.title.length);
  return hits[0];
}

export function planTurn(text: string, notes: Note[], active: Note | undefined): Plan {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "reply", content: "Escreva uma pergunta ou uma ação." };

  const fabric = matchPattern(trimmed);
  if (fabric === "need-source") {
    return {
      kind: "reply",
      content: "Diga o padrão e cole a fonte. Exemplo: extract_wisdom, uma linha em branco, e o texto ou o link.",
    };
  }
  if (fabric) return { kind: "fabric", patternId: fabric.id, source: fabric.source };

  const create = /^(?:por favor[, ]+)?(?:cria|criar|crie)\s+(?:uma\s+)?nota(?:\s+sobre|\s+chamada|\s+com\s+o\s+t[ií]tulo)?\s+(.+)$/i.exec(trimmed);
  if (create?.[1]) {
    const title = cleanTitle(create[1]);
    const titled = title.charAt(0).toUpperCase() + title.slice(1);
    const body = `# ${titled}\n\n- O que ficou decidido\n- O que continua aberto\n- Ligações para revisar\n`;
    return {
      kind: "tool",
      name: "vault.create",
      readOnly: false,
      args: { title: titled, body },
      preview: `A ferramenta vault.create quer gravar a nota “${titled}”. Nada entra no cofre sem aprovação.`,
    };
  }

  const append = /^acrescent[ae]\s+(?:na|à|a)\s+nota\s+([^:]+):\s*([\s\S]+)$/i.exec(trimmed);
  if (append?.[1] && append[2]) {
    const title = cleanTitle(append[1]);
    const note = findNoteLoose(notes, title);
    if (!note) return { kind: "reply", content: `Não achei uma nota chamada “${title}”. Nada foi escrito.` };
    return {
      kind: "tool",
      name: "vault.append",
      readOnly: false,
      args: { title: note.title, text: append[2].trim() },
      preview: `A ferramenta vault.append quer acrescentar texto em “${note.title}”.`,
    };
  }

  const place = /^(?:coloca|coloque|ponha|poe|põe|mande)\s+(?:a\s+nota\s+)?(.+?)\s+no\s+canvas\.?$/i.exec(trimmed);
  if (place?.[1]) {
    const phrase = cleanTitle(place[1]);
    const note = /^(esta|essa|atual)$/i.test(phrase) ? active : findNoteLoose(notes, phrase) ?? titleMentioned(phrase, notes);
    if (!note) return { kind: "reply", content: "Diga o título da nota que deve ir para o canvas." };
    if (note.canvas) return { kind: "reply", content: `“${note.title}” já está no canvas.` };
    return {
      kind: "tool",
      name: "canvas.place",
      readOnly: false,
      args: { title: note.title },
      preview: `A ferramenta canvas.place quer posicionar “${note.title}” no canvas.`,
    };
  }

  if (/\b(liga[cç][õo]es|relacion|backlinks|vizinh)/i.test(trimmed)) {
    const note = titleMentioned(trimmed, notes) ?? active;
    if (!note) return { kind: "reply", content: "Não há nota ativa para inspecionar o grafo." };
    return {
      kind: "tool",
      name: "graph.related",
      readOnly: true,
      args: { title: note.title },
      preview: `Consultando ligações de “${note.title}”.`,
    };
  }

  const calc = /^(?:calcula|calcule|avalia|avalie)\s+([\s\S]+)$/i.exec(trimmed);
  if (calc?.[1]) {
    return {
      kind: "tool",
      name: "notebook.run",
      readOnly: true,
      args: { code: calc[1].trim() },
      preview: "Avaliação só de leitura no estado do caderno. Nenhuma célula será gravada.",
    };
  }

  const read = /^(?:l[eê]|abra|mostra|mostrar)\s+(?:a\s+nota\s+|o\s+texto\s+(?:de|da)\s+)?(.+)$/i.exec(trimmed);
  if (read?.[1] && !/[?]/.test(trimmed)) {
    const note = findNoteLoose(notes, cleanTitle(read[1].replace(/[[\]]/g, "")));
    if (note) {
      return {
        kind: "tool",
        name: "vault.read",
        readOnly: true,
        args: { title: note.title },
        preview: `Lendo “${note.title}”.`,
      };
    }
  }

  return { kind: "search", query: trimmed };
}

function relatedText(note: Note, notes: Note[]): string {
  const out = wikilinkTitles(note.body)
    .map((title) => findNote(notes, title)?.title)
    .filter((title): title is string => Boolean(title));
  const back = notes
    .filter((item) => item.id !== note.id && wikilinkTitles(item.body).some((title) => findNote(notes, title)?.id === note.id))
    .map((item) => item.title);
  return [
    `Saídas: ${out.length ? out.join(", ") : "nenhuma"}.`,
    `Entradas: ${back.length ? back.join(", ") : "nenhuma"}.`,
  ].join(" ");
}

export function runReadOnly(
  name: string,
  args: Record<string, string>,
  notes: Note[],
  cells: NotebookCell[],
): { content: string; result: string; citations?: Citation[] } {
  if (name === "vault.search") {
    const hits = retrieve(args.query ?? "", notes, 3);
    return { content: composeAnswer(hits), result: hits.length ? `${hits.length} fragmentos` : "nenhum fragmento", citations: hits };
  }
  if (name === "vault.read") {
    const note = findNote(notes, args.title ?? "");
    if (!note) return { content: "Nota não encontrada.", result: "ausente" };
    const excerpt = note.body.trim().slice(0, 900);
    const citations: Citation[] = [{ noteId: note.id, title: note.title, excerpt: excerpt.slice(0, 280), score: 1 }];
    return { content: excerpt || "Nota vazia.", result: "leitura direta", citations };
  }
  if (name === "graph.related") {
    const note = findNote(notes, args.title ?? "");
    if (!note) return { content: "Nota não encontrada.", result: "ausente" };
    const content = relatedText(note, notes);
    return { content, result: "grafo local" };
  }
  if (name === "notebook.run") {
    const { env } = runNotebook(cells);
    const evaluated = evalScratch(args.code ?? "", env);
    if (evaluated.error) return { content: evaluated.error, result: "erro de sintaxe ou de nome" };
    if (evaluated.display === null) return { content: "A expressão não produziu valor.", result: "vazio" };
    const content = isChart(evaluated.display)
      ? `Gráfico com ${evaluated.display.data.length} pontos: ${evaluated.display.data.join(", ")}`
      : formatValue(evaluated.display);
    return { content, result: "avaliado em memória" };
  }
  return { content: "Ferramenta desconhecida.", result: "ignorada" };
}

export function messageId(): string {
  return crypto.randomUUID();
}
