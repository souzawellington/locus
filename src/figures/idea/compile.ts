import { HEIGHT, P, WIDTH, baseGroup, cyl, screws, slab, type Group, type Item } from "../geometry/common.ts";
import { machineBySlug, type Machine } from "../geometry/machines.ts";
import type { IdeaPart, SavedIdea } from "./schema.ts";

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
