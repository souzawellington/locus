import { z } from "zod";

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

export const Vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export type Vector3 = z.infer<typeof Vector3Schema>;

export const StrokeTierSchema = z.enum(["silhouette", "crease", "section", "construction"]);
export type StrokeTier = z.infer<typeof StrokeTierSchema>;

export const SurfaceToneSchema = z.enum(["base", "elevated", "accent", "cutaway"]);
export type SurfaceTone = z.infer<typeof SurfaceToneSchema>;

const LatheSchema = z.object({
  kind: z.literal("lathe"),
  axisOrigin: Vector3Schema,
  axisDirection: Vector3Schema,
  profile: z
    .array(z.object({ axial: z.number().finite(), radius: z.number().finite().min(0) }))
    .min(2)
    .max(24),
  segments: z.number().int().min(12).max(96).default(32),
  cutawayAngleDeg: z.number().finite().min(0).max(360).optional(),
});

const TubeSchema = z.object({
  kind: z.literal("tube"),
  waypoints: z.array(Vector3Schema).min(2).max(16),
  radius: z.number().finite().positive().max(80),
  bendRadius: z.number().finite().positive().max(200).default(4),
});

const IsoPrismSchema = z.object({
  kind: z.literal("iso-prism"),
  center: Vector3Schema,
  dimensions: z.tuple([
    z.number().finite().positive().max(400),
    z.number().finite().positive().max(400),
    z.number().finite().positive().max(400),
  ]),
  chamfer: z.number().finite().min(0).max(40).default(0),
});

export const GeometryPrimitiveSchema = z.discriminatedUnion("kind", [LatheSchema, TubeSchema, IsoPrismSchema]);
export type GeometryPrimitive = z.infer<typeof GeometryPrimitiveSchema>;

export const KinematicJointSchema = z.object({
  type: z.enum(["fixed", "revolute", "prismatic", "exploded-slide"]),
  axis: Vector3Schema,
  origin: Vector3Schema,
  range: z.tuple([z.number().finite(), z.number().finite()]),
  minClearanceMm: z.number().finite().min(0).max(40).default(1.5),
});
export type KinematicJoint = z.infer<typeof KinematicJointSchema>;

export const FigurePartSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,32}$/),
  label: z.string().min(1).max(42),
  technicalRole: z.string().min(1).max(140),
  telemetryUnit: z.string().max(12).optional(),
  telemetryFormula: z
    .object({
      base: z.number().finite(),
      slope: z.number().finite(),
      precision: z.number().int().min(0).max(4),
    })
    .optional(),
  strokeTier: StrokeTierSchema,
  surfaceTone: SurfaceToneSchema,
  joint: KinematicJointSchema,
  primitives: z.array(GeometryPrimitiveSchema).min(1).max(6),
  calloutAnchor: Vector3Schema,
});
export type FigurePart = z.infer<typeof FigurePartSchema>;

export const FigureIdeaSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,48}$/),
    title: z.string().min(1).max(60),
    subtitle: z.string().min(1).max(110),
    domain: z.enum(["aerospace", "metrology", "wave-physics", "computing", "mechanism"]),
    projection: z.object({
      type: z.enum(["isometric", "trimetric", "dimetric"]),
      azimuthDeg: z.number().finite().min(-180).max(180).default(45),
      elevationDeg: z.number().finite().min(-80).max(80).default(35.264),
      scale: z.number().finite().positive().max(8).default(1),
    }),
    defaultParameterT: z.number().finite().min(0).max(1).default(0.25),
    parameterLabel: z.string().min(1).max(40),
    parts: z.array(FigurePartSchema).min(2).max(24),
    vaultSourceNoteId: z.string().max(80).optional(),
  })
  .superRefine((spec, ctx) => {
    const ids = new Set<string>();
    for (const part of spec.parts) {
      if (ids.has(part.id)) ctx.addIssue({ code: "custom", message: "id repetido", path: ["parts"] });
      ids.add(part.id);
    }
  });
export type FigureIdeaSpec = z.infer<typeof FigureIdeaSpecSchema>;

export function sceneSlug(id: string): string {
  const folded = id
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  const stem = folded.replace(/^fig-/, "") || "figura";
  return `fig-${stem}`.slice(0, 48);
}

function slugPart(id: string, index: number): string {
  const folded = id
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return folded || `peca-${index + 1}`;
}

/** Truncates copy and slugs ids so a slightly messy model payload can still be checked. */
export function coerceFigureSpec(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const spec = { ...(input as Record<string, unknown>) };
  if (typeof spec.id === "string") spec.id = sceneSlug(spec.id);
  if (typeof spec.title === "string") spec.title = spec.title.trim().slice(0, 60);
  if (typeof spec.subtitle === "string") spec.subtitle = spec.subtitle.trim().slice(0, 110);
  if (typeof spec.parameterLabel === "string") spec.parameterLabel = spec.parameterLabel.trim().slice(0, 40);
  if (!Array.isArray(spec.parts)) return spec;
  const seen = new Set<string>();
  spec.parts = spec.parts.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const part = { ...(entry as Record<string, unknown>) };
    let id = slugPart(typeof part.id === "string" ? part.id : "", index);
    while (seen.has(id)) id = `${id}-${index + 1}`.slice(0, 32);
    seen.add(id);
    part.id = id;
    if (typeof part.label === "string") part.label = part.label.trim().slice(0, 42);
    if (typeof part.technicalRole === "string") part.technicalRole = part.technicalRole.trim().slice(0, 140);
    if (typeof part.telemetryUnit === "string") part.telemetryUnit = part.telemetryUnit.trim().slice(0, 12);
    return part;
  });
  return spec;
}

export function parseFigureSpec(input: unknown): FigureIdeaSpec {
  const parsed = FigureIdeaSpecSchema.safeParse(coerceFigureSpec(input));
  if (!parsed.success) throw new IdeaParseError("schema");
  return parsed.data;
}
