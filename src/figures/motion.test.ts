import assert from "node:assert/strict";
import { test } from "node:test";
import { MACHINES } from "./geometry/machines.ts";
import { loopSamples } from "./motion.ts";

test("each figure's loop moves a part of its own mechanism", () => {
  for (const machine of MACHINES) {
    const samples = loopSamples(machine, 8);
    const moved = machine.groups.some((group) => new Set(samples.map((sample) => sample[group.id] ?? "")).size > 1);
    assert.ok(moved, machine.slug);
    assert.equal(samples.length, 8);
  }
});
