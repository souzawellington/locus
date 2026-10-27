import { parseViewBox, compileFigureScene } from "./geometry/scene.ts";
import { strokePx } from "./geometry/stroke.ts";
import type { FigureIdeaSpec } from "./idea/schema.ts";

const TOKEN_NAMES = ["--paper", "--paper-2", "--ink", "--muted", "--line", "--copper", "--copper-soft"] as const;

export function readThemeTokens(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const style = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const name of TOKEN_NAMES) {
    const value = style.getPropertyValue(name).trim();
    if (value) tokens[name] = value;
  }
  return tokens;
}

function pointsAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`).join(" ");
}

function escapeText(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

export function printSheetSvg(spec: FigureIdeaSpec, tokens: Record<string, string> = {}): string {
  const poses = [0, 0.5, 1].map((t, index) => ({
    scene: compileFigureScene(spec, t, { explode: index === 2 ? 1 : 0 }),
    caption: index === 2 ? "aberta" : t === 0 ? "repouso" : "a meio",
  }));
  const styleVars = TOKEN_NAMES.map((name) => (tokens[name] ? `${name}:${tokens[name]}` : ""))
    .filter(Boolean)
    .join(";");
  const cells = poses
    .map((pose, index) => {
      const box = parseViewBox(pose.scene.viewBox);
      if (!box) return "";
      const cellX = 24 + index * 320;
      const scale = Math.min(280 / box.width, 220 / box.height);
      const shapes = pose.scene.polygons
        .map(
          (polygon) =>
            `<polygon data-tone="${polygon.surfaceTone}" data-stroke="${polygon.strokeTier}" stroke-width="${strokePx(polygon.strokeTier)}" points="${pointsAttr(polygon.points2D)}" />`,
        )
        .join("");
      return `<g transform="translate(${cellX} 72) scale(${scale}) translate(${-box.minX} ${-box.minY})">${shapes}</g><text x="${cellX}" y="330" class="sheet-note">${escapeText(pose.caption)}</text>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 380" class="locus-scene-sheet" style="${styleVars}">
<style>
.locus-scene-sheet { background: var(--paper, Canvas); }
.locus-scene-sheet [data-tone="base"] { fill: var(--paper, Canvas); }
.locus-scene-sheet [data-tone="elevated"] { fill: var(--paper-2, Canvas); }
.locus-scene-sheet [data-tone="accent"] { fill: var(--copper-soft, Canvas); }
.locus-scene-sheet [data-tone="cutaway"] { fill: var(--line, GrayText); }
.locus-scene-sheet polygon { stroke: var(--ink, CanvasText); stroke-linejoin: round; }
.locus-scene-sheet [data-stroke="crease"], .locus-scene-sheet [data-stroke="section"] { stroke: var(--muted, GrayText); }
.locus-scene-sheet [data-stroke="construction"] { stroke: var(--line, GrayText); stroke-dasharray: 1.8 1.4; }
.sheet-title, .sheet-note { font-family: "IBM Plex Mono", ui-monospace, monospace; fill: var(--ink, CanvasText); }
.sheet-title { font-size: 18px; }
.sheet-note { font-size: 12px; fill: var(--muted, GrayText); }
</style>
<text x="24" y="36" class="sheet-title">${escapeText(spec.title)}</text>
<text x="24" y="56" class="sheet-note">${escapeText(spec.subtitle)}</text>
${cells}
</svg>`;
}
