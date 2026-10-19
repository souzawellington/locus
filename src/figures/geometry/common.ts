import * as k from "../../../.agents/skills/anatomy/kit/iso-kit.ts";

export type Tone = k.Tone;
export type LineTone = k.LineTone;
export type Point3 = k.Point3;
export type Flat = k.Flat;
export type Projection = k.Projection;
export type Plan = k.Plan;

export const PLATE: Plan = { x: -150, y: -78, w: 300, d: 156, r: 9 };
export const PLATE_H = 12;
export const FOOT = 5;
export const WIDTH = 680;
export const HEIGHT = 420;

export const P: Projection = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT, 0),
    ...k.boxCorners({ x: -90, y: -46, w: 180, d: 92, r: 0 }, 0, 86),
  ],
  WIDTH,
  HEIGHT,
  { pad: 36, azimuth: 40, elevation: 32 },
);

export type Item = {
  id: string;
  at: Point3;
  kind: "solid" | "line" | "dots";
  paths?: k.SolidPaths;
  d?: string;
  points?: Flat[];
  tone?: Tone | LineTone;
  lit?: boolean;
  flat?: boolean;
  halo?: boolean;
  crease?: Tone | "none";
  size?: number;
};

export type Group = {
  id: string;
  place: (t: number, apart: number) => Point3;
  items: Item[];
};

const still = (): Point3 => [0, 0, 0];

export function slab(
  id: string,
  plan: Plan,
  z: number,
  h: number,
  tone: Tone,
  options: { bevel?: number; steps?: number; flat?: boolean; lit?: boolean; halo?: boolean; crease?: Tone | "none" } = {},
): Item {
  return {
    id,
    at: [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2],
    kind: "solid",
    paths: k.slabOf(plan, z, h, P, options.steps ?? 6, options.bevel ?? 0.7),
    tone,
    lit: options.lit,
    flat: options.flat,
    halo: options.halo,
    crease: options.crease,
  };
}

export function cyl(
  id: string,
  x: number,
  y: number,
  r: number,
  z: number,
  h: number,
  tone: Tone,
  options: { lit?: boolean; steps?: number; bevel?: number; crease?: Tone | "none" } = {},
): Item {
  return {
    id,
    at: [x, y, z + h / 2],
    kind: "solid",
    paths: k.cylinder(x, y, r, z, h, P, options.steps ?? 22, options.bevel ?? 0.35),
    tone,
    lit: options.lit,
    crease: options.crease ?? "none",
  };
}

export function rule(id: string, d: string, at: Point3, tone: LineTone = "lo"): Item {
  return { id, at, kind: "line", d, tone };
}

export function screws(id: string, world: Array<[number, number, number]>, size = 0.48): Item[] {
  if (!world.length) return [];
  const rings = world.map(([x, y, z]) => k.ring(x, y, size * 4.2, z, P, 12)).join("");
  const points = world.map((point) => k.iso(point, P));
  const at = world[0] ?? [0, 0, 0];
  return [
    rule(`${id}-rings`, rings, at, "lo"),
    { id, at, kind: "dots", points, size, tone: "hi" },
  ];
}

export function baseGroup(): Group {
  const items: Item[] = [];
  for (const [index, [x, y]] of k.corners(PLATE, 26).entries()) {
    items.push(cyl(`foot-pad-${index}`, x, y, 7.4, -PLATE_H - FOOT, 1.8, "lo", { steps: 18, bevel: 0.2 }));
    items.push(cyl(`foot-stem-${index}`, x, y, 4.8, -PLATE_H - FOOT + 1.8, FOOT - 1.8, "mid", { steps: 18, bevel: 0 }));
  }
  items.push(slab("plate", PLATE, -PLATE_H, PLATE_H, "mid", { bevel: 1.3, steps: 8, halo: true }));
  items.push(rule("groove", k.planOutline(k.insetPlan(PLATE, 7), 0.08, P, 8), [0, 0, 0], "faint"));
  items.push(...screws("plate-screws", k.corners(PLATE, 14).map(([x, y]) => [x, y, 0.08])));
  const strip: Plan = { x: -124, y: PLATE.y + PLATE.d - 18, w: 248, d: 9, r: 1 };
  items.push(slab("ruler", strip, 0, 0.8, "lo", { flat: true, bevel: 0, crease: "none" }));
  const ticks = k.topTicks(strip.x + 8, strip.x + strip.w - 8, 8, 5, strip.y + 1.4, 0.85, [2.4, 4.6], P);
  items.push(rule("ticks-minor", ticks.minor, [0, 50, 1], "lo"));
  items.push(rule("ticks-major", ticks.major, [0, 50, 1], "mid"));
  const label: Plan = { x: PLATE.x + 12, y: PLATE.y + 12, w: 52, d: 18, r: 1.4 };
  items.push(slab("label", label, 0, 0.9, "lo", { flat: true, crease: "none", bevel: 0 }));
  for (let index = 0; index < 3; index += 1) {
    const y = label.y + 4.2 + index * 3.6;
    items.push(rule(`label-${index}`, k.lineOnTop([label.x + 4, y], [label.x + label.w - 4, y], 0.95, P), [label.x, y, 1], "faint"));
  }
  const rails = [-46, 28];
  rails.forEach((y, index) => {
    items.push(slab(`bed-${index}`, { x: -108, y, w: 216, d: 6, r: 1.2 }, 0, 2.4, "mid", { bevel: 0.35, steps: 4 }));
  });
  const rack: Plan = { x: 108, y: -62, w: 28, d: 22, r: 1.4 };
  items.push(slab("rack", rack, 0, 3, "lo", { bevel: 0.4 }));
  for (let index = 0; index < 6; index += 1) {
    const x = rack.x + 4 + (index % 3) * 8;
    const y = rack.y + 6 + Math.floor(index / 3) * 9;
    items.push(cyl(`bit-${index}`, x, y, 1.3, 3, 6 + (index % 2), "mid", { steps: 10, bevel: 0.15 }));
  }
  items.push(cyl("oil-cup", -128, 48, 5, 0, 4, "mid", { steps: 16 }));
  items.push(cyl("oil-lid", -128, 48, 3.2, 4, 1.2, "hi", { steps: 14 }));
  for (const [index, [x, y]] of k.corners(PLATE, 40).entries()) {
    items.push(slab(`dog-${index}`, { x: x - 4, y: y - 3, w: 8, d: 6, r: 1 }, 0, 2.2, "lo", { bevel: 0.3 }));
  }
  items.push(cyl("dowel-a", -96, -40, 1.4, 0, 5, "hi", { steps: 10, bevel: 0 }));
  items.push(cyl("dowel-b", 96, -40, 1.4, 0, 5, "hi", { steps: 10, bevel: 0 }));
  return { id: "base", place: still, items };
}

export function partCount(groups: Group[]): number {
  let count = 0;
  for (const group of groups) {
    for (const item of group.items) {
      if (item.kind === "line") continue;
      count += item.kind === "dots" ? (item.points?.length ?? 0) : 1;
    }
  }
  return count;
}

export function sorted(items: Item[]): Item[] {
  return [...items].sort((a, b) => k.depthOf(a.at, P) - k.depthOf(b.at, P));
}

export { k };
