import assert from "node:assert/strict";
import { test } from "node:test";
import { partCount } from "./common.ts";
import { FIGURES, MACHINES, machineBySlug } from "./machines.ts";

test("the starter pack is eight local figures", () => {
  assert.deepEqual(
    FIGURES.map((figure) => figure.slug),
    ["wikilinks", "crdt", "embeddings", "notebook", "atlas", "canvas", "approval", "local-vault"],
  );
  assert.equal(new Set(FIGURES.map((figure) => figure.slug)).size, FIGURES.length);
});

test("each figure is a Figure-sized machine and its readout stays on the model", () => {
  for (const machine of MACHINES) {
    const count = partCount(machine.groups);
    assert.ok(count >= 40, `${machine.slug} has ${count} parts`);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const text = machine.read(t, t > 0.8 ? 1 : 0);
      assert.equal(typeof text, "string");
      assert.ok(text.trim().length > 0, machine.slug);
    }
    assert.equal(machineBySlug(machine.slug)?.slug, machine.slug);
  }
  assert.equal(machineBySlug("missing"), undefined);
});
