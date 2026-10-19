const TONES = new Set(["lo", "mid", "hi", "faint"]);
const KINDS = new Set(["slab", "cylinder", "screw"]);
const LAYERS = new Set(["body", "moving"]);

const UNSAFE = /<\s*\/?\s*(script|iframe|object|embed|foreignobject)\b|javascript\s*:|on[a-z]+\s*=|<\s*foreignobject|https?:\/\/|href\s*=/i;

export type IdeaTone = "lo" | "mid" | "hi" | "faint";
export type IdeaKind = "slab" | "cylinder" | "screw";
export type IdeaLayer = "body" | "moving";

export type IdeaPart = {
  id: string;
  kind: IdeaKind;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  r: number;
  tone: IdeaTone;
  lit: boolean;
  layer: IdeaLayer;
  slide: number;
  lift: number;
};

export type IdeaFigure = {
  name: string;
  title: string;
  blurb: string;
  caption: string;
  readRest: string;
  readMoved: string;
  parts: IdeaPart[];
};

export type SavedIdea = IdeaFigure & { slug: string };

export type IdeaIssue = "unsafe" | "json" | "schema";

export class IdeaParseError extends Error {
  readonly issue: IdeaIssue;
  constructor(issue: IdeaIssue) {
    super(issue);
    this.issue = issue;
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cleanText(value: unknown, max = 140): string {
  const text = typeof value === "string" ? value : "";
  return text.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function ideaSlug(name: string, taken: Iterable<string> = []): string {
  const folded = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  const stem = `ideia-${folded || "figura"}`;
  const used = new Set(taken);
  if (!used.has(stem)) return stem;
  let index = 2;
  while (used.has(`${stem}-${index}`)) index += 1;
  return `${stem}-${index}`;
}

export function assertSafePayload(raw: string): void {
  if (UNSAFE.test(raw)) throw new IdeaParseError("unsafe");
}

export function parseIdeaFigure(raw: string): IdeaFigure {
  assertSafePayload(raw);
  let parsed: unknown;
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(trimmed);
  } catch {
    throw new IdeaParseError("json");
  }
  return validateIdeaFigure(parsed);
}

export function validateIdeaFigure(input: unknown): IdeaFigure {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new IdeaParseError("schema");
  const record = input as Record<string, unknown>;
  const partsIn = record.parts;
  if (!Array.isArray(partsIn) || partsIn.length < 4 || partsIn.length > 16) throw new IdeaParseError("schema");
  const seen = new Set<string>();
  const parts: IdeaPart[] = partsIn.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new IdeaParseError("schema");
    const part = entry as Record<string, unknown>;
    const kind = part.kind;
    const tone = part.tone;
    const layer = part.layer;
    if (typeof kind !== "string" || !KINDS.has(kind)) throw new IdeaParseError("schema");
    if (typeof tone !== "string" || !TONES.has(tone)) throw new IdeaParseError("schema");
    if (typeof layer !== "string" || !LAYERS.has(layer)) throw new IdeaParseError("schema");
    let id = cleanText(part.id, 24).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) id = `peca-${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    const screw = kind === "screw";
    return {
      id,
      kind: kind as IdeaKind,
      x: clamp(asNumber(part.x), -110, 110),
      y: clamp(asNumber(part.y), -40, 40),
      z: clamp(asNumber(part.z), 0, 60),
      w: clamp(asNumber(part.w, screw ? 0 : 12), screw ? 0 : 4, 90),
      d: clamp(asNumber(part.d, screw ? 0 : 12), screw ? 0 : 4, 70),
      h: clamp(asNumber(part.h, screw ? 0 : 8), screw ? 0 : 1, 48),
      r: clamp(asNumber(part.r, kind === "cylinder" ? 4 : 1.2), 0, 18),
      tone: tone as IdeaTone,
      lit: part.lit === true,
      layer: layer as IdeaLayer,
      slide: clamp(asNumber(part.slide), -48, 48),
      lift: clamp(asNumber(part.lift), 0, 40),
    };
  });
  const lit = parts.filter((part) => part.lit);
  if (lit.length === 0) {
    const moving = parts.find((part) => part.layer === "moving") ?? parts[0];
    if (moving) moving.lit = true;
  } else if (lit.length > 1) {
    for (const part of lit.slice(1)) part.lit = false;
  }
  if (!parts.some((part) => part.layer === "moving" && (part.slide !== 0 || part.lift !== 0))) {
    const subject = parts.find((part) => part.lit) ?? parts[0];
    if (subject) {
      subject.layer = "moving";
      if (subject.slide === 0) subject.slide = 22;
      if (subject.lift === 0) subject.lift = 16;
    }
  }
  const name = cleanText(record.name, 40);
  const title = cleanText(record.title, 48);
  const blurb = cleanText(record.blurb, 140);
  const caption = cleanText(record.caption, 180);
  const readRest = cleanText(record.readRest, 48);
  const readMoved = cleanText(record.readMoved, 48);
  if (!title || !blurb || !caption || !readRest || !readMoved) throw new IdeaParseError("schema");
  return { name: name || title, title, blurb, caption, readRest, readMoved, parts };
}
