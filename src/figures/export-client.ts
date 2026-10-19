import isoCss from "../../.agents/skills/anatomy/kit/iso.css?raw";
import { useVault } from "@/lib/vault/store";
import { resolveMachine } from "./idea/compile";
import { loopSamples } from "./motion";

const PALETTE = `.iso[data-theme="light"]{
  --anatomy-page:transparent;--anatomy-card:transparent;--anatomy-text:#6d655c;--anatomy-strong:#1a1714;--anatomy-muted:#6d655c;
  --anatomy-paper:#faf7f1;--anatomy-face:#f3efe6;--anatomy-top:#f3efe6;
  --anatomy-shade-0:#e2d9c9;--anatomy-shade-1:#e8e0d2;--anatomy-shade-2:#efe7db;--anatomy-shade-3:#f6f1e8;
  --anatomy-lit-top:#f3e4d4;--anatomy-lit-shade:#e7cdb8;
  --anatomy-hi:#1a1714;--anatomy-mid:#5c554c;--anatomy-lo:#8a8176;--anatomy-faint:#c9bfb0;--anatomy-lit:#9c4520;
  --anatomy-halo:#c4b8a4;--anatomy-halo-opacity:.28;--anatomy-dot:#1a1714;--anatomy-weight:.9px;
  background:none;
}`;

export type ExportKind = "svg" | "png-512" | "png-1024" | "svg-animated";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function styledClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("class", "iso");
  clone.setAttribute("data-theme", "light");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `${PALETTE}\n${isoCss}`;
  clone.insertBefore(style, clone.firstChild);
  return clone;
}

function serialize(svg: SVGSVGElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

function parseTranslate(value: string): [number, number] {
  const match = /translate\(\s*([-\d.]+)(?:\s+|,)\s*([-\d.]+)\s*\)/.exec(value);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

/** Animated SVG, not GIF or WebP: the loop is the same model as the live sticker, and it needs no encoder. */
function withLoop(svg: SVGSVGElement, slug: string): SVGSVGElement {
  const machine = resolveMachine(slug, useVault.getState().ideas ?? []);
  if (!machine) return svg;
  const samples = loopSamples(machine, 10);
  svg.querySelectorAll<SVGGElement>("[data-group]").forEach((node) => {
    const id = node.getAttribute("data-group") ?? "";
    const values = samples.map((sample) => {
      const [x, y] = parseTranslate(sample[id] ?? "");
      return `${x} ${y}`;
    });
    if (new Set(values).size < 2) return;
    const motion = document.createElementNS("http://www.w3.org/2000/svg", "animateTransform");
    motion.setAttribute("attributeName", "transform");
    motion.setAttribute("type", "translate");
    motion.setAttribute("dur", "2.8s");
    motion.setAttribute("repeatCount", "indefinite");
    motion.setAttribute("calcMode", "spline");
    motion.setAttribute("values", [...values, values[0]].join(";"));
    const times = values.map((_, index) => (index / values.length).toFixed(4));
    times.push("1");
    motion.setAttribute("keyTimes", times.join(";"));
    motion.setAttribute("keySplines", Array(values.length).fill("0.45 0 0.2 1").join(";"));
    node.appendChild(motion);
    node.removeAttribute("transform");
  });
  return svg;
}

async function rasterize(svg: string, width: number): Promise<Blob> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("svg"));
    });
    image.src = url;
    await loaded;
    const height = Math.max(1, Math.round(width * (image.naturalHeight / Math.max(1, image.naturalWidth))));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportFigure(root: HTMLElement, slug: string, kind: ExportKind) {
  const svg = root.querySelector("svg.iso-svg");
  if (!(svg instanceof SVGSVGElement)) return;
  const clone = styledClone(svg);
  if (kind === "svg-animated") withLoop(clone, slug);
  const text = serialize(clone);
  const safe = slug.replace(/[^a-z0-9-]/g, "") || "figura";
  if (kind === "svg" || kind === "svg-animated") {
    download(new Blob([text], { type: "image/svg+xml" }), `locus-${safe}${kind === "svg-animated" ? "-animado" : ""}.svg`);
    return;
  }
  const size = kind === "png-1024" ? 1024 : 512;
  download(await rasterize(text, size), `locus-${safe}-${size}.png`);
}
