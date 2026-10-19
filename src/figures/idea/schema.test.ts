import assert from "node:assert/strict";
import { test } from "node:test";
import { compileIdea } from "./compile.ts";
import { ideaSlug, IdeaParseError, parseIdeaFigure, validateIdeaFigure } from "./schema.ts";

const good = {
  name: "Ampulheta",
  title: "Ampulheta",
  blurb: "A areia muda de vaso.",
  caption: "Nada sai da bancada.",
  readRest: "vaso de cima cheio",
  readMoved: "areia a meio",
  parts: [
    { id: "prato", kind: "slab", x: -18, y: -14, z: 0, w: 36, d: 28, h: 4, r: 2, tone: "lo", lit: false, layer: "body", slide: 0, lift: 0 },
    { id: "coluna", kind: "cylinder", x: 0, y: 0, z: 4, w: 0, d: 0, h: 28, r: 2.4, tone: "mid", lit: false, layer: "body", slide: 0, lift: 0 },
    { id: "vaso", kind: "cylinder", x: 0, y: 0, z: 30, w: 0, d: 0, h: 10, r: 8, tone: "hi", lit: false, layer: "body", slide: 0, lift: 18 },
    { id: "areia", kind: "slab", x: -6, y: -5, z: 8, w: 12, d: 10, h: 6, r: 1, tone: "hi", lit: true, layer: "moving", slide: 16, lift: 10 },
    { id: "parafuso-a", kind: "screw", x: -12, y: 8, z: 4, w: 0, d: 0, h: 0, r: 0, tone: "mid", lit: false, layer: "body", slide: 0, lift: 0 },
    { id: "parafuso-b", kind: "screw", x: 12, y: 8, z: 4, w: 0, d: 0, h: 0, r: 0, tone: "mid", lit: false, layer: "body", slide: 0, lift: 0 },
  ],
};

test("a valid figure compiles into a machine that moves and lifts", () => {
  const figure = parseIdeaFigure(JSON.stringify(good));
  assert.equal(figure.parts.filter((part) => part.lit).length, 1);
  const machine = compileIdea({ ...figure, slug: "ideia-ampulheta" });
  assert.equal(machine.slug, "ideia-ampulheta");
  const moving = machine.groups.find((group) => group.id === "areia");
  assert.ok(moving);
  assert.notDeepEqual(moving?.place(0, 0), moving?.place(1, 0));
  assert.notEqual(moving?.place(0, 0)[2], moving?.place(0, 1)[2]);
  assert.match(machine.read(0, 0), /cheio/);
  assert.match(machine.read(0.8, 0), /meio/);
  assert.match(machine.read(0.2, 0.8), /desmontada/);
});

test("unsafe payloads are refused before they become parts", () => {
  for (const raw of [
    JSON.stringify({ ...good, caption: "<script>alert(1)</script>" }),
    JSON.stringify({ ...good, blurb: "<foreignObject>" }),
    JSON.stringify({ ...good, title: "veja https://evil.example" }),
    JSON.stringify({ ...good, parts: good.parts.map((part, index) => (index === 0 ? { ...part, id: "x\" onclick=alert(1)" } : part)) }),
  ]) {
    assert.throws(() => parseIdeaFigure(raw), (error: unknown) => error instanceof IdeaParseError && error.issue === "unsafe");
  }
});

test("schema rejects a figure that is not a machine", () => {
  assert.throws(() => validateIdeaFigure({ title: "Só um nome" }), (error: unknown) => error instanceof IdeaParseError && error.issue === "schema");
  assert.throws(() => parseIdeaFigure("{"), (error: unknown) => error instanceof IdeaParseError && error.issue === "json");
  const loose = validateIdeaFigure({ ...good, parts: good.parts.map((part) => ({ ...part, lit: false, slide: 0, lift: 0, layer: "body" })) });
  assert.equal(loose.parts.filter((part) => part.lit).length, 1);
  assert.ok(loose.parts.some((part) => part.layer === "moving" && part.slide !== 0));
});

test("idea slugs stay in the ideia- family and do not collide", () => {
  assert.equal(ideaSlug("Ampulheta"), "ideia-ampulheta");
  assert.equal(ideaSlug("Relógio de água"), "ideia-relogio-de-agua");
  assert.equal(ideaSlug("Ampulheta", ["ideia-ampulheta"]), "ideia-ampulheta-2");
  assert.equal(ideaSlug("!!!"), "ideia-figura");
});
