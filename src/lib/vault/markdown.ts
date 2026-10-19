export type BlockKind = "heading" | "paragraph" | "list" | "quote" | "code" | "rule" | "figure";

export type MdBlock = {
  id: string;
  kind: BlockKind;
  raw: string;
};

export type InlineNode =
  | { t: "text"; v: string }
  | { t: "strong"; v: InlineNode[] }
  | { t: "em"; v: InlineNode[] }
  | { t: "code"; v: string }
  | { t: "link"; label: string; href: string }
  | { t: "wiki"; title: string; label: string };

const KIND_LABEL: Record<BlockKind, string> = {
  heading: "título",
  paragraph: "texto",
  list: "lista",
  quote: "citação",
  code: "código",
  rule: "divisor",
  figure: "figura",
};

const FIGURE_RE = /^!\[\[figure:([a-z0-9-]+)(?:\|(sticker|full))?\]\]$/;

export type FigureEmbed = { slug: string; size: "sticker" | "full" };

export function parseFigureEmbed(raw: string): FigureEmbed | null {
  const match = FIGURE_RE.exec(raw.trim());
  const slug = match?.[1];
  if (!slug) return null;
  return { slug, size: match?.[2] === "sticker" ? "sticker" : "full" };
}

export function kindLabel(kind: BlockKind): string {
  return KIND_LABEL[kind];
}

function kindOf(raw: string): BlockKind {
  const trimmed = raw.trim();
  if (parseFigureEmbed(trimmed)) return "figure";
  if (trimmed.startsWith("```")) return "code";
  if (/^(-{3,}|\*{3,})$/.test(trimmed)) return "rule";
  if (/^#{1,3}\s/.test(trimmed)) return "heading";
  const lines = trimmed.split("\n");
  if (lines.every((line) => /^\s*>/.test(line))) return "quote";
  if (lines.every((line) => /^\s*([-*+]|\d+\.)\s/.test(line))) return "list";
  return "paragraph";
}

export function parseBlocks(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let buffer: string[] = [];
  let inCode = false;

  const flush = () => {
    if (buffer.some((line) => line.trim() !== "")) chunks.push(buffer.join("\n"));
    buffer = [];
  };

  for (const line of lines) {
    if (inCode) {
      buffer.push(line);
      if (line.trim().startsWith("```")) {
        chunks.push(buffer.join("\n"));
        buffer = [];
        inCode = false;
      }
      continue;
    }
    if (line.trim().startsWith("```")) {
      flush();
      inCode = true;
      buffer.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (parseFigureEmbed(line)) {
      flush();
      chunks.push(line);
      continue;
    }
    buffer.push(line);
  }

  if (buffer.length) {
    if (inCode || buffer.some((line) => line.trim() !== "")) chunks.push(buffer.join("\n"));
  }

  return chunks.map((raw, index) => ({
    id: `b${index}`,
    kind: kindOf(raw),
    raw,
  }));
}

export function serializeBlocks(blocks: MdBlock[]): string {
  return blocks
    .map((block) => block.raw.replace(/\s+$/g, ""))
    .filter((raw) => raw.trim().length > 0)
    .join("\n\n");
}

export function headingLevel(raw: string): 1 | 2 | 3 {
  const match = /^(#{1,3})\s/.exec(raw.trim());
  const count = match?.[1]?.length ?? 1;
  if (count >= 3) return 3;
  if (count === 2) return 2;
  return 1;
}

export function headingText(raw: string): string {
  return raw.trim().replace(/^#{1,3}\s+/, "");
}

export function quoteText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n");
}

export function codeParts(raw: string): { lang: string; code: string } {
  const lines = raw.replace(/\s+$/g, "").split("\n");
  const first = lines[0] ?? "";
  const lang = first.replace(/^```/, "").trim();
  const end = lines[lines.length - 1]?.trim().startsWith("```") ? lines.length - 1 : lines.length;
  return { lang, code: lines.slice(1, end).join("\n") };
}

export type ListItem = { checked: boolean | null; text: string; ordered: boolean };

export function listItems(raw: string): ListItem[] {
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const ordered = /^\s*\d+\.\s/.test(line);
      const check = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
      if (check) {
        return { checked: check[1].toLowerCase() === "x", text: check[2] ?? "", ordered: false };
      }
      return {
        checked: null,
        text: line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ""),
        ordered,
      };
    });
}

export function parseInline(input: string): InlineNode[] {
  const out: InlineNode[] = [];
  let text = "";
  let index = 0;

  const pushText = () => {
    if (text) {
      out.push({ t: "text", v: text });
      text = "";
    }
  };

  while (index < input.length) {
    if (input.startsWith("![[", index)) {
      const end = input.indexOf("]]", index + 3);
      if (end !== -1 && parseFigureEmbed(input.slice(index, end + 2))) {
        text += input.slice(index, end + 2);
        index = end + 2;
        continue;
      }
    }
    if (input.startsWith("**", index)) {
      const end = input.indexOf("**", index + 2);
      if (end !== -1) {
        pushText();
        out.push({ t: "strong", v: parseInline(input.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }
    if (input[index] === "*" && input[index + 1] !== "*") {
      const end = input.indexOf("*", index + 1);
      if (end !== -1) {
        pushText();
        out.push({ t: "em", v: parseInline(input.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }
    if (input[index] === "`") {
      const end = input.indexOf("`", index + 1);
      if (end !== -1) {
        pushText();
        out.push({ t: "code", v: input.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (input.startsWith("[[", index)) {
      const end = input.indexOf("]]", index + 2);
      if (end !== -1) {
        pushText();
        const inner = input.slice(index + 2, end).trim();
        const [titlePart, labelPart] = inner.split("|");
        const title = (titlePart ?? "").replace(/#.*$/, "").trim();
        const label = (labelPart ?? title).trim();
        if (title) out.push({ t: "wiki", title, label });
        index = end + 2;
        continue;
      }
    }
    if (input[index] === "[") {
      const match = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(input.slice(index));
      if (match?.[1] && match[2]) {
        pushText();
        out.push({ t: "link", label: match[1], href: match[2] });
        index += match[0].length;
        continue;
      }
    }
    text += input[index];
    index += 1;
  }
  pushText();
  return out;
}

export function wikilinkTitles(markdown: string): string[] {
  const found: string[] = [];
  const re = /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    const title = match[1]?.trim();
    if (title) found.push(title);
  }
  return [...new Set(found)];
}

export function rewriteWikilinks(markdown: string, from: string, to: string): string {
  const source = from.trim().toLowerCase();
  if (!source || source === to.trim().toLowerCase()) return markdown;
  return markdown.replace(/(?<!!)\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]/g, (full, title: string, hash = "", alias = "") => {
    if (title.trim().toLowerCase() !== source) return full;
    return `[[${to}${hash}${alias}]]`;
  });
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[figure:[a-z0-9-]+(?:\|(?:sticker|full))?\]\]/g, " ")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, title: string, label?: string) => label?.trim() || title.trim())
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
