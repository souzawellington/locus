import { depthOf, iso, type Flat, type Projection } from "../../../.agents/skills/anatomy/kit/iso-kit.ts";
import type {
  FigureIdeaSpec,
  FigurePart,
  GeometryPrimitive,
  KinematicJoint,
  StrokeTier,
  SurfaceTone,
  Vector3,
} from "../idea/schema.ts";
import { strokePx } from "./stroke.ts";

export { strokePx };

export type V3 = Vector3;

export type FigurePolygon = {
  id: string;
  partId: string;
  points2D: Flat[];
  depthZ: number;
  strokeTier: StrokeTier;
  surfaceTone: SurfaceTone;
};

export type FigureCallout = {
  partId: string;
  anchor2D: Flat;
  elbow2D: Flat;
  label2D: Flat;
  align: "left" | "right";
  text: string;
};

export type FigureReadout = {
  partId: string;
  label: string;
  value: string;
  role: string;
};

export type FigureAudit = {
  passed: boolean;
  affineBoundsValid: boolean;
  emptyClippingValid: boolean;
  clearanceEnvelopeValid: boolean;
  orderConvergenceValid: boolean;
  minClearanceObservedMm: number;
  warnings: string[];
};

export type FigureScene = {
  viewBox: string;
  polygons: FigurePolygon[];
  callouts: FigureCallout[];
  readouts: FigureReadout[];
  audit: FigureAudit;
};

export const MAX_POLYGONS = 420;
const SUNK_MM = -0.5;
const sceneCache = new Map<string, FigureScene>();

type Frame = { o: V3; a: V3; u: V3; v: V3 };

export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function unit3(vector: V3, fallback: V3 = [0, 0, 1]): V3 {
  const length = len3(vector);
  if (length < 1e-8) return fallback;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function rodrigues(point: V3, axis: V3, origin: V3, radians: number): V3 {
  const k = unit3(axis);
  const v = sub3(point, origin);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const along = dot3(k, v);
  const rotated = add3(add3(mul3(v, cos), mul3(cross3(k, v), sin)), mul3(k, along * (1 - cos)));
  return add3(origin, rotated);
}

type Delta = { kind: "rot"; radians: number } | { kind: "slide"; distance: number };

export function jointDelta(joint: KinematicJoint, t: number, explode: number): Delta {
  const clamped = Math.min(1, Math.max(0, t));
  const span = joint.range[1] - joint.range[0];
  if (joint.type === "revolute") return { kind: "rot", radians: ((joint.range[0] + span * clamped) * Math.PI) / 180 };
  if (joint.type === "prismatic") return { kind: "slide", distance: joint.range[0] + span * clamped };
  if (joint.type === "exploded-slide") {
    const opened = Math.min(1, Math.max(0, explode));
    return { kind: "slide", distance: joint.range[0] + span * opened };
  }
  return { kind: "slide", distance: 0 };
}

export function posePoint(point: V3, joint: KinematicJoint, t: number, explode: number): V3 {
  const delta = jointDelta(joint, t, explode);
  if (delta.kind === "rot") return rodrigues(point, joint.axis, joint.origin, delta.radians);
  return add3(point, mul3(unit3(joint.axis), delta.distance));
}

export function unposePoint(point: V3, joint: KinematicJoint, t: number, explode: number): V3 {
  const delta = jointDelta(joint, t, explode);
  if (delta.kind === "rot") return rodrigues(point, joint.axis, joint.origin, -delta.radians);
  return add3(point, mul3(unit3(joint.axis), -delta.distance));
}

function frameAlong(origin: V3, axisIn: V3): Frame {
  const axis = unit3(axisIn);
  const helper: V3 = Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u = unit3(cross3(helper, axis));
  return { o: origin, a: axis, u, v: cross3(axis, u) };
}

function pointOn(frame: Frame, axial: number, radius: number, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add3(add3(frame.o, mul3(frame.a, axial)), mul3(add3(mul3(frame.u, c), mul3(frame.v, s)), radius));
}

function centroid(points: V3[]): V3 {
  const total = points.reduce((sum, point) => add3(sum, point), [0, 0, 0] as V3);
  return mul3(total, 1 / Math.max(1, points.length));
}

export function filletCenterline(waypoints: V3[], bendRadius: number): V3[] {
  if (waypoints.length < 3) return waypoints.map((point) => [...point] as V3);
  const out: V3[] = [[...waypoints[0]] as V3];
  for (let index = 1; index < waypoints.length - 1; index += 1) {
    const prev = waypoints[index - 1] ?? waypoints[index];
    const at = waypoints[index] ?? prev;
    const next = waypoints[index + 1] ?? at;
    if (!prev || !at || !next) continue;
    const incoming = unit3(sub3(prev, at), [1, 0, 0]);
    const outgoing = unit3(sub3(next, at), [0, 1, 0]);
    const turn = Math.acos(Math.min(1, Math.max(-1, dot3(incoming, outgoing))));
    if (turn < 0.12 || Math.abs(Math.PI - turn) < 0.12) {
      out.push([...at] as V3);
      continue;
    }
    const half = turn / 2;
    const cut = Math.min(bendRadius * Math.tan(half), len3(sub3(at, prev)) * 0.45, len3(sub3(next, at)) * 0.45);
    if (cut < 0.2) {
      out.push([...at] as V3);
      continue;
    }
    const radius = cut / Math.tan(half);
    const start = add3(at, mul3(incoming, cut));
    const end = add3(at, mul3(outgoing, cut));
    const center = add3(at, mul3(unit3(add3(incoming, outgoing)), radius / Math.sin(half)));
    const axis = unit3(cross3(sub3(start, center), sub3(end, center)));
    const span = Math.acos(Math.min(1, Math.max(-1, dot3(unit3(sub3(start, center)), unit3(sub3(end, center))))));
    for (let step = 0; step <= 5; step += 1) out.push(rodrigues(start, axis, center, span * (step / 5)));
  }
  const last = waypoints[waypoints.length - 1];
  if (last) out.push([...last] as V3);
  return out;
}

export function tubeCenterline(waypoints: V3[], bendRadius: number): V3[] {
  return filletCenterline(waypoints, bendRadius);
}

function framesAlong(points: V3[]): Frame[] {
  let previous: V3 | null = null;
  return points.map((origin, index) => {
    const before = points[Math.max(0, index - 1)] ?? origin;
    const after = points[Math.min(points.length - 1, index + 1)] ?? origin;
    const axis = unit3(sub3(after, before));
    let u: V3;
    if (!previous) u = frameAlong(origin, axis).u;
    else {
      const projected = sub3(previous, mul3(axis, dot3(previous, axis)));
      u = len3(projected) > 1e-6 ? unit3(projected) : frameAlong(origin, axis).u;
    }
    previous = u;
    return { o: origin, a: axis, u, v: cross3(axis, u) };
  });
}

function polygonArea(points: Flat[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(sum) / 2;
}

function latheQuads(primitive: Extract<GeometryPrimitive, { kind: "lathe" }>, segments: number): V3[][] {
  const frame = frameAlong(primitive.axisOrigin, primitive.axisDirection);
  const cut = primitive.cutawayAngleDeg;
  const hidden = (angle: number) => {
    if (cut == null || cut <= 0) return false;
    const turns = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return turns < (cut * Math.PI) / 180;
  };
  const faces: V3[][] = [];
  for (let band = 0; band < primitive.profile.length - 1; band += 1) {
    const a0 = primitive.profile[band];
    const a1 = primitive.profile[band + 1];
    if (!a0 || !a1) continue;
    for (let step = 0; step < segments; step += 1) {
      const t0 = (step / segments) * Math.PI * 2;
      const t1 = ((step + 1) / segments) * Math.PI * 2;
      if (hidden(t0) && hidden(t1)) continue;
      faces.push([
        pointOn(frame, a0.axial, a0.radius, t0),
        pointOn(frame, a0.axial, a0.radius, t1),
        pointOn(frame, a1.axial, a1.radius, t1),
        pointOn(frame, a1.axial, a1.radius, t0),
      ]);
    }
  }
  for (const end of [primitive.profile[0], primitive.profile[primitive.profile.length - 1]]) {
    if (!end || end.radius <= 0.2) continue;
    const cap: V3[] = [];
    for (let step = 0; step < segments; step += 1) {
      const angle = (step / segments) * Math.PI * 2;
      if (hidden(angle)) continue;
      cap.push(pointOn(frame, end.axial, end.radius, angle));
    }
    if (cap.length >= 3) faces.push(cap);
  }
  return faces;
}

function tubeQuads(waypoints: V3[], radius: number, bendRadius: number): V3[][] {
  const line = filletCenterline(waypoints, Math.max(bendRadius, radius * 2));
  if (line.length < 2) return [];
  const sides = 8;
  const rings = framesAlong(line).map((frame) =>
    Array.from({ length: sides }, (_, index) => pointOn(frame, 0, radius, (index / sides) * Math.PI * 2)),
  );
  const faces: V3[][] = [];
  for (let index = 0; index < rings.length - 1; index += 1) {
    const a = rings[index];
    const b = rings[index + 1];
    if (!a || !b) continue;
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const a0 = a[side];
      const a1 = a[next];
      const b0 = b[side];
      const b1 = b[next];
      if (!a0 || !a1 || !b0 || !b1) continue;
      faces.push([a0, a1, b1, b0]);
    }
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  if (first) faces.push(first);
  if (last) faces.push([...last].reverse());
  return faces;
}

function prismFaces(center: V3, dimensions: V3, chamfer: number): V3[][] {
  const hx = dimensions[0] / 2;
  const hy = dimensions[1] / 2;
  const hz = dimensions[2] / 2;
  const c = Math.max(0, Math.min(chamfer, hx * 0.45, hy * 0.45, hz * 0.45));
  const at = (x: number, y: number, z: number): V3 => [center[0] + x, center[1] + y, center[2] + z];
  if (c < 0.05) {
    return [
      [at(-hx, -hy, hz), at(hx, -hy, hz), at(hx, hy, hz), at(-hx, hy, hz)],
      [at(-hx, hy, -hz), at(hx, hy, -hz), at(hx, -hy, -hz), at(-hx, -hy, -hz)],
      [at(-hx, -hy, -hz), at(hx, -hy, -hz), at(hx, -hy, hz), at(-hx, -hy, hz)],
      [at(hx, hy, -hz), at(-hx, hy, -hz), at(-hx, hy, hz), at(hx, hy, hz)],
      [at(-hx, hy, -hz), at(-hx, -hy, -hz), at(-hx, -hy, hz), at(-hx, hy, hz)],
      [at(hx, -hy, -hz), at(hx, hy, -hz), at(hx, hy, hz), at(hx, -hy, hz)],
    ];
  }
  const faces: V3[][] = [
    [at(-hx + c, -hy + c, hz), at(hx - c, -hy + c, hz), at(hx - c, hy - c, hz), at(-hx + c, hy - c, hz)],
    [at(-hx + c, hy - c, -hz), at(hx - c, hy - c, -hz), at(hx - c, -hy + c, -hz), at(-hx + c, -hy + c, -hz)],
    [at(-hx + c, -hy, -hz + c), at(hx - c, -hy, -hz + c), at(hx - c, -hy, hz - c), at(-hx + c, -hy, hz - c)],
    [at(hx - c, hy, -hz + c), at(-hx + c, hy, -hz + c), at(-hx + c, hy, hz - c), at(hx - c, hy, hz - c)],
    [at(-hx, hy - c, -hz + c), at(-hx, -hy + c, -hz + c), at(-hx, -hy + c, hz - c), at(-hx, hy - c, hz - c)],
    [at(hx, -hy + c, -hz + c), at(hx, hy - c, -hz + c), at(hx, hy - c, hz - c), at(hx, -hy + c, hz - c)],
  ];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        faces.push([
          at(sx * hx, sy * (hy - c), sz * (hz - c)),
          at(sx * (hx - c), sy * hy, sz * (hz - c)),
          at(sx * (hx - c), sy * (hy - c), sz * hz),
        ]);
      }
    }
  }
  return faces;
}

export function primitiveFaces(primitive: GeometryPrimitive, segmentScale = 1): V3[][] {
  if (primitive.kind === "lathe") {
    const scaled = Math.max(12, Math.min(primitive.segments, Math.round(primitive.segments * segmentScale) || 12));
    return latheQuads(primitive, scaled);
  }
  if (primitive.kind === "tube") return tubeQuads(primitive.waypoints, primitive.radius, primitive.bendRadius);
  return prismFaces(primitive.center, primitive.dimensions, primitive.chamfer);
}

export function restCloud(primitive: GeometryPrimitive): V3[] {
  const cloud: V3[] = [];
  for (const face of primitiveFaces(primitive, 0.5)) {
    for (const point of face) cloud.push(point);
    if (face.length) cloud.push(centroid(face));
    if (cloud.length > 96) break;
  }
  return cloud;
}

function profileRadius(profile: { axial: number; radius: number }[], axial: number): number {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return 0;
  if (axial <= first.axial) return first.radius;
  if (axial >= last.axial) return last.radius;
  for (let index = 0; index < profile.length - 1; index += 1) {
    const a = profile[index];
    const b = profile[index + 1];
    if (!a || !b || axial > b.axial) continue;
    const span = b.axial - a.axial || 1;
    return a.radius + (b.radius - a.radius) * ((axial - a.axial) / span);
  }
  return last.radius;
}

export function distanceToPrimitive(point: V3, primitive: GeometryPrimitive): number {
  if (primitive.kind === "iso-prism") {
    const q: V3 = [
      Math.abs(point[0] - primitive.center[0]) - primitive.dimensions[0] / 2,
      Math.abs(point[1] - primitive.center[1]) - primitive.dimensions[1] / 2,
      Math.abs(point[2] - primitive.center[2]) - primitive.dimensions[2] / 2,
    ];
    const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
    const inside = Math.min(Math.max(q[0], q[1], q[2]), 0);
    return outside + inside;
  }
  if (primitive.kind === "lathe") {
    const axis = unit3(primitive.axisDirection);
    const relative = sub3(point, primitive.axisOrigin);
    const axial = dot3(relative, axis);
    const radial = len3(sub3(relative, mul3(axis, axial)));
    const first = primitive.profile[0];
    const last = primitive.profile[primitive.profile.length - 1];
    if (!first || !last) return radial;
    if (axial < first.axial) return Math.hypot(first.axial - axial, Math.max(0, radial - first.radius));
    if (axial > last.axial) return Math.hypot(axial - last.axial, Math.max(0, radial - last.radius));
    const side = radial - profileRadius(primitive.profile, axial);
    if (side >= 0) return side;
    const cap = Math.min(axial - first.axial, last.axial - axial);
    return -Math.min(-side, cap);
  }
  const line = filletCenterline(primitive.waypoints, Math.max(primitive.bendRadius, primitive.radius * 2));
  let best = Infinity;
  for (let index = 0; index < line.length - 1; index += 1) {
    const a = line[index];
    const b = line[index + 1];
    if (!a || !b) continue;
    const ab = sub3(b, a);
    const mix = Math.min(1, Math.max(0, dot3(sub3(point, a), ab) / (dot3(ab, ab) || 1)));
    best = Math.min(best, len3(sub3(point, add3(a, mul3(ab, mix)))));
  }
  return best - primitive.radius;
}

function distanceToPart(point: V3, part: FigurePart, t: number, explode: number): number {
  const local = unposePoint(point, part.joint, t, explode);
  let best = Infinity;
  for (const primitive of part.primitives) best = Math.min(best, distanceToPrimitive(local, primitive));
  return best;
}

function partSamples(part: FigurePart, t: number, explode: number): V3[] {
  const cloud: V3[] = [];
  for (const primitive of part.primitives) {
    for (const point of restCloud(primitive)) cloud.push(posePoint(point, part.joint, t, explode));
  }
  return cloud.slice(0, 80);
}

function sameMotion(a: KinematicJoint, b: KinematicJoint): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "fixed") return true;
  const aligned = Math.abs(dot3(unit3(a.axis), unit3(b.axis))) > 0.999;
  const range = Math.abs(a.range[0] - b.range[0]) < 1e-6 && Math.abs(a.range[1] - b.range[1]) < 1e-6;
  if (!aligned || !range) return false;
  if (a.type === "revolute") return len3(sub3(a.origin, b.origin)) < 0.25;
  return true;
}

export type ClearanceReport = {
  minClearanceObservedMm: number;
  clearanceEnvelopeValid: boolean;
  pairs: { moverId: string; gap: number; required: number; direction: V3 }[];
};

export function observeClearance(spec: FigureIdeaSpec, t: number, explode = 0): ClearanceReport {
  const samples = spec.parts.map((part) => {
    const points = partSamples(part, t, explode);
    return { part, points, center: centroid(points.slice(0, 12)) };
  });
  let strictObserved = Infinity;
  let anyObserved = Infinity;
  let valid = true;
  const pairs: ClearanceReport["pairs"] = [];
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      const a = samples[i];
      const b = samples[j];
      if (!a || !b) continue;
      let gap = Infinity;
      for (const point of a.points) gap = Math.min(gap, distanceToPart(point, b.part, t, explode));
      for (const point of b.points) gap = Math.min(gap, distanceToPart(point, a.part, t, explode));
      anyObserved = Math.min(anyObserved, gap);
      const together = sameMotion(a.part.joint, b.part.joint);
      if (!together) {
        strictObserved = Math.min(strictObserved, gap);
        const required = Math.max(a.part.joint.minClearanceMm, b.part.joint.minClearanceMm, 1.5);
        if (gap < required - 1e-3) {
          valid = false;
          const mover = a.part.joint.type !== "fixed" ? a : b;
          const other = mover === a ? b : a;
          const delta = sub3(mover.center, other.center);
          pairs.push({
            moverId: mover.part.id,
            gap,
            required,
            direction: len3(delta) > 0.2 ? unit3(delta) : unit3(mover.part.joint.axis),
          });
        }
      } else if (gap < SUNK_MM) {
        valid = false;
      }
    }
  }
  const observed = Number.isFinite(strictObserved) ? strictObserved : Number.isFinite(anyObserved) ? anyObserved : 0;
  return { minClearanceObservedMm: observed, clearanceEnvelopeValid: valid, pairs };
}

function projectionOf(spec: FigureIdeaSpec["projection"]): Projection {
  return { origin: [0, 0], scale: spec.scale, azimuth: spec.azimuthDeg, elevation: spec.elevationDeg };
}

export function projectPoint(point: V3, spec: FigureIdeaSpec["projection"]): Flat {
  return iso(point, projectionOf(spec));
}

export function projectionIsAffine(projection: FigureIdeaSpec["projection"]): boolean {
  const camera = projectionOf(projection);
  const a = iso([0, 0, 0], camera);
  const b = iso([10, 0, 0], camera);
  const c = iso([10, 10, 0], camera);
  const d = iso([0, 10, 0], camera);
  const mid = (p: Flat, q: Flat): Flat => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const left = mid(a, c);
  const right = mid(b, d);
  return (
    [a, b, c, d].every((point) => Number.isFinite(point[0]) && Number.isFinite(point[1])) &&
    Math.hypot(left[0] - right[0], left[1] - right[1]) < 1e-4
  );
}

export function parseViewBox(viewBox: string): { minX: number; minY: number; width: number; height: number } | null {
  const [minX, minY, width, height] = viewBox.split(/[\s,]+/).map(Number);
  if (![minX, minY, width, height].every((value) => Number.isFinite(value)) || !width || !height || width <= 0 || height <= 0) {
    return null;
  }
  return { minX, minY, width, height };
}

export function pointsInsideViewBox(viewBox: string, points: Flat[]): boolean {
  const box = parseViewBox(viewBox);
  if (!box) return false;
  return points.every(
    ([x, y]) =>
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= box.minX - 0.75 &&
      y >= box.minY - 0.75 &&
      x <= box.minX + box.width + 0.75 &&
      y <= box.minY + box.height + 0.75,
  );
}

export function painterSort<T extends { id: string; depthZ: number }>(polygons: T[]): T[] {
  return [...polygons].sort((a, b) => a.depthZ - b.depthZ || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function orderConverged(polygons: { id: string; depthZ: number }[]): boolean {
  if (polygons.some((polygon) => !Number.isFinite(polygon.depthZ))) return false;
  const forward = painterSort(polygons).map((polygon) => polygon.id).join("|");
  const backward = painterSort([...polygons].reverse()).map((polygon) => polygon.id).join("|");
  return forward === backward;
}

function layoutCallouts(
  items: { partId: string; anchor: Flat; text: string }[],
  bounds: { minX: number; maxX: number; minY: number },
): FigureCallout[] {
  const mid = (bounds.minX + bounds.maxX) / 2;
  const place = (list: typeof items, align: "left" | "right"): FigureCallout[] => {
    const ordered = [...list].sort((a, b) => a.anchor[1] - b.anchor[1] || (a.partId < b.partId ? -1 : 1));
    const marginX = align === "left" ? bounds.minX - 36 : bounds.maxX + 36;
    let cursor = bounds.minY;
    return ordered.map((item) => {
      const labelY = Math.max(item.anchor[1], cursor);
      cursor = labelY + 22;
      return {
        partId: item.partId,
        anchor2D: item.anchor,
        elbow2D: [marginX, item.anchor[1]],
        label2D: [align === "left" ? marginX - 6 : marginX + 6, labelY],
        align,
        text: item.text,
      };
    });
  };
  return [
    ...place(items.filter((item) => item.anchor[0] <= mid), "left"),
    ...place(items.filter((item) => item.anchor[0] > mid), "right"),
  ];
}

export function calloutsCross(callouts: FigureCallout[]): boolean {
  const segments = callouts.flatMap((callout) => [
    [callout.anchor2D, callout.elbow2D],
    [callout.elbow2D, [callout.elbow2D[0], callout.label2D[1]] as Flat],
  ]);
  const orient = (a: Flat, b: Flat, c: Flat) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const hit = (a: Flat, b: Flat, c: Flat, d: Flat) =>
    orient(a, b, c) * orient(a, b, d) < -1e-6 && orient(c, d, a) * orient(c, d, b) < -1e-6;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const left = segments[i];
      const right = segments[j];
      if (!left || !right) continue;
      const [a, b] = left;
      const [c, d] = right;
      if (a && b && c && d && hit(a, b, c, d)) return true;
    }
  }
  return false;
}

function readoutValue(part: FigurePart, t: number): string {
  const formula = part.telemetryFormula;
  if (!formula) return `${Math.round(t * 100)}%`;
  const shown = (formula.base + formula.slope * t).toFixed(formula.precision);
  return part.telemetryUnit ? `${shown} ${part.telemetryUnit}` : shown;
}

function viewBoxFrom(points: Flat[]): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return "0 0 320 200";
  const pad = 28;
  const round = (value: number) => Math.round(value * 10) / 10;
  return `${round(minX - pad)} ${round(minY - pad)} ${round(maxX - minX + pad * 2)} ${round(maxY - minY + pad * 2)}`;
}

export function measureAudit(input: {
  viewBox: string;
  polygons: { id: string; partId: string; points2D: Flat[]; depthZ: number }[];
  projection: FigureIdeaSpec["projection"];
  clearance: number;
  clearanceValid: boolean;
  emptyDropped: boolean;
}): FigureAudit {
  const flat = input.polygons.flatMap((polygon) => polygon.points2D);
  const warnings: string[] = [];
  const affineBoundsValid = projectionIsAffine(input.projection) && pointsInsideViewBox(input.viewBox, flat);
  const emptyClippingValid =
    !input.emptyDropped && input.polygons.every((polygon) => polygon.points2D.length >= 3 && polygonArea(polygon.points2D) > 1e-4);
  const orderConvergenceValid = orderConverged(input.polygons);
  if (!affineBoundsValid) warnings.push("limites");
  if (!emptyClippingValid) warnings.push("vazio");
  if (!input.clearanceValid) warnings.push("folga");
  if (!orderConvergenceValid) warnings.push("ordem");
  return {
    passed: affineBoundsValid && emptyClippingValid && input.clearanceValid && orderConvergenceValid,
    affineBoundsValid,
    emptyClippingValid,
    clearanceEnvelopeValid: input.clearanceValid,
    orderConvergenceValid,
    minClearanceObservedMm: input.clearance,
    warnings,
  };
}

export function compileFigureScene(spec: FigureIdeaSpec, t: number, options?: { explode?: number }): FigureScene {
  const explode = options?.explode ?? 0;
  const key = `${t.toFixed(4)}|${explode.toFixed(3)}|${JSON.stringify(spec)}`;
  const cached = sceneCache.get(key);
  if (cached) return cached;
  const parameter = Math.min(1, Math.max(0, t));
  const estimate = spec.parts.reduce((sum, part) => sum + part.primitives.length * 64, 0);
  const segmentScale = estimate > MAX_POLYGONS ? MAX_POLYGONS / estimate : 1;
  const camera = projectionOf(spec.projection);
  const raw: FigurePolygon[] = [];
  const partIds = new Set<string>();
  let emptyDropped = false;
  for (const part of spec.parts) {
    let kept = 0;
    part.primitives.forEach((primitive, primitiveIndex) => {
      primitiveFaces(primitive, segmentScale).forEach((face, faceIndex) => {
        const world = face.map((point) => posePoint(point, part.joint, parameter, explode));
        const points2D = world.map((point) => iso(point, camera));
        if (points2D.length < 3 || polygonArea(points2D) <= 1e-4) return;
        raw.push({
          id: `${part.id}-${primitiveIndex}-${faceIndex}`,
          partId: part.id,
          points2D,
          depthZ: depthOf(centroid(world), camera),
          strokeTier: part.strokeTier,
          surfaceTone: part.surfaceTone,
        });
        kept += 1;
      });
    });
    if (kept) partIds.add(part.id);
  }
  if (partIds.size !== spec.parts.length) emptyDropped = true;
  let polygons = raw;
  if (polygons.length > MAX_POLYGONS) {
    const important = polygons.filter((polygon) => polygon.strokeTier === "silhouette" || polygon.surfaceTone === "cutaway");
    const rest = polygons.filter((polygon) => polygon.strokeTier !== "silhouette" && polygon.surfaceTone !== "cutaway");
    polygons = [...important, ...rest.slice(0, Math.max(0, MAX_POLYGONS - important.length))].slice(0, MAX_POLYGONS);
    if (new Set(polygons.map((polygon) => polygon.partId)).size !== spec.parts.length) emptyDropped = true;
  }
  polygons = painterSort(polygons);
  const bounds = polygons.reduce(
    (box, polygon) => {
      for (const [x, y] of polygon.points2D) {
        box.minX = Math.min(box.minX, x);
        box.maxX = Math.max(box.maxX, x);
        box.minY = Math.min(box.minY, y);
      }
      return box;
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity },
  );
  const callouts = layoutCallouts(
    spec.parts.map((part) => ({
      partId: part.id,
      text: part.label,
      anchor: iso(posePoint(part.calloutAnchor, part.joint, parameter, explode), camera),
    })),
    {
      minX: Number.isFinite(bounds.minX) ? bounds.minX : 0,
      maxX: Number.isFinite(bounds.maxX) ? bounds.maxX : 0,
      minY: Number.isFinite(bounds.minY) ? bounds.minY : 0,
    },
  );
  const ink: Flat[] = polygons.flatMap((polygon) => polygon.points2D);
  for (const callout of callouts) {
    const textWidth = Math.min(120, 7 * callout.text.length);
    const direction = callout.align === "left" ? -1 : 1;
    ink.push(callout.anchor2D, callout.elbow2D, callout.label2D, [callout.label2D[0] + direction * textWidth, callout.label2D[1] - 8]);
  }
  const viewBox = viewBoxFrom(ink);
  const clearance = observeClearance(spec, parameter, explode);
  const scene: FigureScene = {
    viewBox,
    polygons,
    callouts,
    readouts: spec.parts.map((part) => ({
      partId: part.id,
      label: part.label,
      value: readoutValue(part, parameter),
      role: part.technicalRole,
    })),
    audit: measureAudit({
      viewBox,
      polygons,
      projection: spec.projection,
      clearance: clearance.minClearanceObservedMm,
      clearanceValid: clearance.clearanceEnvelopeValid,
      emptyDropped,
    }),
  };
  sceneCache.set(key, scene);
  if (sceneCache.size > 48) {
    const oldest = sceneCache.keys().next().value;
    if (oldest) sceneCache.delete(oldest);
  }
  return scene;
}
