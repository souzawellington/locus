import { parseBlocks, serializeBlocks, type MdBlock } from "./markdown.ts";

export type SlashKind =
  | "figure"
  | "sticker"
  | "photo"
  | "camera"
  | "video"
  | "map"
  | "flight"
  | "note"
  | "heading"
  | "list"
  | "check"
  | "quote"
  | "code"
  | "rule";

export const SLASH_ITEMS: { id: SlashKind; label: string; hint: string }[] = [
  { id: "figure", label: "Figura", hint: "Máquina inteira" },
  { id: "sticker", label: "Figurinha", hint: "Versão pequena" },
  { id: "photo", label: "Foto", hint: "Da galeria" },
  { id: "camera", label: "Câmera", hint: "Tirar agora" },
  { id: "video", label: "Vídeo", hint: "Enviar ou gravar" },
  { id: "map", label: "Mapa", hint: "Lugar e caminho" },
  { id: "flight", label: "Voo", hint: "Acompanhar um voo" },
  { id: "note", label: "Link para nota", hint: "Ligar outra nota" },
  { id: "heading", label: "Título", hint: "Uma seção" },
  { id: "list", label: "Lista", hint: "Itens soltos" },
  { id: "check", label: "Checklist", hint: "Itens para marcar" },
  { id: "quote", label: "Citação", hint: "Um trecho" },
  { id: "code", label: "Código", hint: "Monoespaçado" },
  { id: "rule", label: "Divisor", hint: "Uma linha" },
];

export function slashQuery(raw: string): string | null {
  const match = /(?:^|\s)\/([a-zA-Z0-9áàãâéêíóôõúç]*)$/i.exec(raw);
  if (!match) return null;
  return match[1] ?? "";
}

export function mentionQuery(raw: string): string | null {
  const at = /(?:^|\s)@([^\n@]*)$/.exec(raw);
  if (at) return at[1] ?? "";
  const wiki = /\[\[([^\]\n]*)$/.exec(raw);
  if (wiki) return wiki[1] ?? "";
  return null;
}

export function stripTrigger(raw: string): string {
  return raw.replace(/(?:^|\s)\/[a-zA-Z0-9áàãâéêíóôõúç]*$/i, "").replace(/(?:^|\s)@[^\n@]*$/, "").replace(/\[\[[^\]\n]*$/, "").trim();
}

export function replaceBlock(markdown: string, index: number, raw: string): string {
  const blocks = parseBlocks(markdown);
  if (!blocks.length) return raw.trim();
  if (index < 0 || index >= blocks.length) {
    return serializeBlocks([...blocks, { id: "new", kind: "paragraph", raw }]);
  }
  const next = blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, raw } : block));
  return serializeBlocks(next.filter((block) => block.raw.trim().length > 0));
}

export function insertAfter(markdown: string, index: number, raw: string): string {
  const blocks = parseBlocks(markdown);
  const next: MdBlock[] = [...blocks];
  next.splice(index + 1, 0, { id: "new", kind: "paragraph", raw });
  return serializeBlocks(next);
}

export function removeBlock(markdown: string, index: number): string {
  const blocks = parseBlocks(markdown);
  return serializeBlocks(blocks.filter((_, blockIndex) => blockIndex !== index));
}

export function roundTripMarkdown(markdown: string): string {
  return serializeBlocks(parseBlocks(markdown));
}
