import type { InkStroke, Note, NoteColor, NoteFont, NotebookCell } from "./types";
import { slugify } from "./format";

export const NOTE_COLORS: { id: NoteColor; label: string; hex: string; ink: string }[] = [
  { id: "white", label: "Branco", hex: "#ffffff", ink: "#1a1714" },
  { id: "sand", label: "Areia", hex: "#f6f0e6", ink: "#1a1714" },
  { id: "sky", label: "Céu", hex: "#eef3f8", ink: "#1a1714" },
  { id: "leaf", label: "Folha", hex: "#eef5ef", ink: "#1a1714" },
  { id: "rose", label: "Rosa", hex: "#f8f0f2", ink: "#1a1714" },
  { id: "lilac", label: "Lilás", hex: "#f3f0f8", ink: "#1a1714" },
  { id: "peach", label: "Pêssego", hex: "#f8f1ea", ink: "#1a1714" },
  { id: "night", label: "Noite", hex: "#1c1916", ink: "#f4f1ea" },
];

export const NOTE_FONTS: { id: NoteFont; label: string; css: string }[] = [
  { id: "plex", label: "IBM Plex Sans", css: '"IBM Plex Sans", ui-sans-serif, sans-serif' },
  { id: "roboto", label: "Roboto", css: "Roboto, ui-sans-serif, sans-serif" },
  { id: "newsreader", label: "Newsreader", css: "Newsreader, ui-serif, serif" },
  { id: "plex-mono", label: "IBM Plex Mono", css: '"IBM Plex Mono", ui-monospace, monospace' },
  { id: "roboto-mono", label: "Roboto Mono", css: '"Roboto Mono", ui-monospace, monospace' },
];

export function noteColor(id: NoteColor | undefined) {
  return NOTE_COLORS.find((item) => item.id === id) ?? NOTE_COLORS[0];
}

export function noteFont(id: NoteFont | undefined) {
  return NOTE_FONTS.find((item) => item.id === id) ?? NOTE_FONTS[0];
}

export function readInk(value: unknown): InkStroke[] {
  if (!Array.isArray(value)) return [];
  const strokes: InkStroke[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const stroke = item as InkStroke;
    if (
      typeof stroke.color !== "string" ||
      typeof stroke.size !== "number" ||
      !Array.isArray(stroke.points)
    )
      continue;
    const points = stroke.points.filter(
      (point) => point && typeof point.x === "number" && typeof point.y === "number",
    );
    if (points.length < 2) continue;
    strokes.push({
      color: stroke.color.slice(0, 32),
      size: Math.min(12, Math.max(0.5, stroke.size)),
      points: points
        .slice(0, 4000)
        .map((point) => ({
          x: point.x,
          y: point.y,
          p: typeof point.p === "number" ? point.p : 0.5,
        })),
    });
  }
  return strokes.slice(0, 400);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function exportMarkdown(note: Note): { filename: string; text: string } {
  const color = note.color ?? "white";
  const font = note.font ?? "plex";
  const text = `---\ncolor: ${color}\nfont: ${font}\n---\n\n# ${note.title}\n\n${note.body.trim()}\n`;
  return { filename: `${slugify(note.title)}.md`, text };
}

export function exportPlain(note: Note): { filename: string; text: string } {
  return { filename: `${slugify(note.title)}.txt`, text: `${note.title}\n\n${note.body.trim()}\n` };
}

export function exportJson(note: Note): { filename: string; text: string } {
  const payload = {
    title: note.title,
    body: note.body,
    color: note.color ?? "white",
    font: note.font ?? "plex",
    updatedAt: new Date(note.updatedAt).toISOString(),
    links: [...note.body.matchAll(/\[\[([^\]|]+)/g)]
      .map((match) => match[1]?.trim())
      .filter(Boolean),
  };
  return { filename: `${slugify(note.title)}.json`, text: `${JSON.stringify(payload, null, 2)}\n` };
}

export function exportHtml(note: Note): { filename: string; text: string } {
  const color = noteColor(note.color);
  const font = noteFont(note.font);
  const body = escapeHtml(note.body.trim() || "").replace(/\n/g, "<br />");
  const text = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(note.title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans&family=Newsreader&family=Roboto&family=Roboto+Mono&display=swap" />
  <style>
    body { margin: 0; background: #f4f4f2; color: ${color.ink}; font-family: ${font.css}; }
    main { max-width: 42rem; margin: 2rem auto; padding: 3rem 2.5rem; background: ${color.hex}; min-height: 70vh; }
    h1 { font-weight: 500; font-size: 2.2rem; margin: 0 0 1.5rem; }
    .body { font-size: 1.05rem; line-height: 1.7; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(note.title)}</h1>
    <div class="body">${body}</div>
  </main>
</body>
</html>
`;
  return { filename: `${slugify(note.title)}.html`, text };
}

export function exportSvg(note: Note): { filename: string; text: string } {
  const color = noteColor(note.color);
  const font = noteFont(note.font);
  const lines = (note.body.trim() || "").split("\n").slice(0, 28);
  const textNodes = lines
    .map(
      (line, index) =>
        `<text x="48" y="${150 + index * 28}" font-size="18" fill="${color.ink}">${escapeHtml(line.slice(0, 72)) || " "}</text>`,
    )
    .join("\n");
  const paths = (note.ink ?? [])
    .map((stroke) => {
      if (stroke.points.length < 2) return "";
      const d = stroke.points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${escapeAttr(stroke.color)}" stroke-width="${stroke.size}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("\n");
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100">
  <rect width="800" height="1100" fill="${color.hex}" />
  <text x="48" y="88" font-size="36" font-family="${escapeAttr(font.css)}" fill="${color.ink}">${escapeHtml(note.title)}</text>
  <g font-family="${escapeAttr(font.css)}">${textNodes}</g>
  <g>${paths}</g>
</svg>
`;
  return { filename: `${slugify(note.title)}.svg`, text };
}

export function exportNotebook(cells: NotebookCell[]): { filename: string; text: string } {
  const payload = cells.map((cell, index) => ({ index: index + 1, code: cell.code }));
  return { filename: "caderno.json", text: `${JSON.stringify(payload, null, 2)}\n` };
}

export function strokePath(stroke: InkStroke): string {
  return stroke.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}
