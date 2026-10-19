import { translateAlong } from "../../.agents/skills/anatomy/kit/iso-kit.ts";
import type { Machine } from "./geometry/machines.ts";

/** Calm pose of the existing machine model. `t` runs the mechanism; apart stays down. */
export function frameTransforms(machine: Machine, t: number, apart = 0): Record<string, string> {
  const frames: Record<string, string> = {};
  for (const group of machine.groups) {
    const delta = group.place(t, apart);
    frames[group.id] = delta[0] === 0 && delta[1] === 0 && delta[2] === 0 ? "" : translateAlong(machine.projection, delta);
  }
  return frames;
}

/** One short loop of the mechanism, sampled from the same `place` function the live figure uses. */
export function loopSamples(machine: Machine, frames = 10): Array<Record<string, string>> {
  return Array.from({ length: frames }, (_, index) => {
    const turn = (index / frames) * Math.PI * 2;
    const t = 0.5 + Math.sin(turn) * 0.34;
    return frameTransforms(machine, t, 0);
  });
}
