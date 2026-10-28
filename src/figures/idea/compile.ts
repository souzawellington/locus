import { HEIGHT, P, WIDTH, baseGroup, cyl, screws, slab, type Group, type Item } from "../geometry/common.ts";
import { SCENE_AUDIT_T, machineBySlug, type Machine } from "../geometry/machines.ts";
import {
  aabbOf,
  aabbSurfaceDistance,
  add3,
  compileFigureScene,
  observeClearance,
  tubeFrames,
  type FigureScene,
  type GeometricAuditReport,
  type V3,
} from "../geometry/scene.ts";
import { sanitizeFigureCopyWithHumanizer } from "./prompt.ts";
import {
  coerceFigureSpec,
  FigureIdeaSpecSchema,
  type FigureIdeaSpec,
  type FigurePart,
  type GeometryPrimitive,
  type IdeaPart,
  type SavedIdea,
  type Vector3,
} from "./schema.ts";

export type { FigureScene, GeometricAuditReport };
export type FigureAudit = GeometricAuditReport;

export type FigureSample = { t: number; audit: GeometricAuditReport };

export type FigureVerdict = {
  accepted: boolean;
  spec: FigureIdeaSpec | null;
  samples: FigureSample[];
};

const move = (point: Vector3, delta: V3): Vector3 => add3(point, delta);

function shiftPrimitive(primitive: GeometryPrimitive, delta: V3): GeometryPrimitive {
  if (primitive.kind === "lathe") return { ...primitive, axisOrigin: move(primitive.axisOrigin, delta) };
  if (primitive.kind === "tube") return { ...primitive, waypoints: primitive.waypoints.map((point) => move(point, delta)) };
  return { ...primitive, center: move(primitive.center, delta) };
}

function shiftPart(part: FigurePart, delta: V3): FigurePart {
  return {
    ...part,
    calloutAnchor: move(part.calloutAnchor, delta),
    joint: { ...part.joint, origin: move(part.joint.origin, delta) },
    primitives: part.primitives.map((primitive) => shiftPrimitive(primitive, delta)),
  };
}

function normalizeGeometry(spec: FigureIdeaSpec): FigureIdeaSpec {
  return {
    ...spec,
    parts: spec.parts.map((part) => ({
      ...part,
      strokeTier: part.surfaceTone === "cutaway" && part.strokeTier === "silhouette" ? "section" : part.strokeTier,
      joint: { ...part.joint, minClearanceMm: Math.max(1.5, part.joint.minClearanceMm) },
      primitives: part.primitives.map((primitive) =>
        primitive.kind === "tube"
          ? { ...primitive, bendRadius: Math.max(primitive.bendRadius, primitive.radius * 2, 4) }
          : primitive,
      ),
    })),
  };
}

function repairClearance(spec: FigureIdeaSpec): FigureIdeaSpec {
  let next = spec;
  for (const t of SCENE_AUDIT_T) {
    for (const explode of [0, 1]) {
      const report = observeClearance(next, t, explode);
      for (const pair of report.pairs) {
        const push = Math.max(0, pair.required - pair.gap + 0.4);
        const delta: V3 = [pair.direction[0] * push, pair.direction[1] * push, pair.direction[2] * push];
        next = {
          ...next,
          parts: next.parts.map((part) => (part.id === pair.moverId ? shiftPart(part, delta) : part)),
        };
      }
    }
  }
  return next;
}

function auditAt(spec: FigureIdeaSpec, t: number): GeometricAuditReport {
  const rest = compileFigureScene(spec, t, { explode: 0 }).audit;
  const apart = compileFigureScene(spec, t, { explode: 1 }).audit;
  return {
    passed: rest.passed && apart.passed,
    affineBoundsValid: rest.affineBoundsValid && apart.affineBoundsValid,
    emptyClippingValid: rest.emptyClippingValid && apart.emptyClippingValid,
    clearanceEnvelopeValid: rest.clearanceEnvelopeValid && apart.clearanceEnvelopeValid,
    orderConvergenceValid: rest.orderConvergenceValid && apart.orderConvergenceValid,
    minClearanceObservedMm: Math.min(rest.minClearanceObservedMm, apart.minClearanceObservedMm),
    warnings: [...rest.warnings, ...apart.warnings.filter((warning) => !rest.warnings.includes(warning))],
  };
}

export function auditFigureSpec(spec: FigureIdeaSpec): FigureSample[] {
  return SCENE_AUDIT_T.map((t) => ({ t, audit: auditAt(spec, t) }));
}

/** Reject or separate a spec. A broken pose is never the one we keep. */
export function validateAndRepair(input: unknown): FigureVerdict {
  const parsed = FigureIdeaSpecSchema.safeParse(coerceFigureSpec(input));
  if (!parsed.success) return { accepted: false, spec: null, samples: [] };
  let spec = normalizeGeometry(sanitizeFigureCopyWithHumanizer(parsed.data));
  let samples = auditFigureSpec(spec);
  if (samples.some((sample) => !sample.audit.passed)) {
    spec = normalizeGeometry(sanitizeFigureCopyWithHumanizer(repairClearance(spec)));
    samples = auditFigureSpec(spec);
  }
  return { accepted: samples.every((sample) => sample.audit.passed), spec, samples };
}

export { aabbOf, aabbSurfaceDistance, compileFigureScene, tubeFrames };

function partItems(part: IdeaPart): Item[] {
  if (part.kind === "screw") return screws(part.id, [[part.x, part.y, part.z]]);
  if (part.kind === "cylinder") {
    return [cyl(part.id, part.x, part.y, Math.max(1.2, part.r), part.z, part.h, part.tone, { lit: part.lit, steps: 20 })];
  }
  return [
    slab(
      part.id,
      { x: part.x, y: part.y, w: part.w, d: part.d, r: Math.min(part.r, Math.min(part.w, part.d) / 2) },
      part.z,
      part.h,
      part.tone,
      { lit: part.lit, bevel: 0.6 },
    ),
  ];
}

export function compileIdea(idea: SavedIdea): Machine {
  const still: Item[] = [];
  const groups: Group[] = [baseGroup()];
  for (const part of idea.parts) {
    const items = partItems(part);
    const moves = part.slide !== 0 || part.lift !== 0 || part.layer === "moving";
    if (!moves) {
      still.push(...items);
      continue;
    }
    groups.push({
      id: part.id,
      place: (t, apart) => [t * part.slide, 0, apart * part.lift],
      items,
    });
  }
  if (still.length) groups.splice(1, 0, { id: "corpo", place: () => [0, 0, 0], items: still });
  return {
    slug: idea.slug,
    fig: "ideia",
    title: idea.title,
    blurb: idea.blurb,
    hint: "toque para desmontar",
    caption: idea.caption,
    width: WIDTH,
    height: HEIGHT,
    projection: P,
    groups,
    read: (t, apart) => (apart > 0.45 ? "desmontada" : t > 0.55 ? idea.readMoved : idea.readRest),
  };
}

export function resolveMachine(slug: string, ideas: SavedIdea[]): Machine | undefined {
  return machineBySlug(slug) ?? (() => {
    const idea = ideas.find((item) => item.slug === slug);
    return idea ? compileIdea(idea) : undefined;
  })();
}
