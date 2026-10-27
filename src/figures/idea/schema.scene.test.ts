import assert from "node:assert/strict";
import { test } from "node:test";
import { IdeaParseError, parseFigureSpec, sceneSlug } from "./schema.ts";

const base = {
  id: "fig-bancada",
  title: "Bancada de prova",
  subtitle: "O carro corre 22 mm.",
  domain: "mechanism",
  projection: { type: "isometric" },
  parameterLabel: "curso",
  parts: [
    {
      id: "base",
      label: "Base da bancada",
      technicalRole: "A base mede 80 mm por 40 mm.",
      strokeTier: "silhouette",
      surfaceTone: "base",
      joint: { type: "fixed", axis: [0, 0, 1], origin: [0, 0, 0], range: [0, 0] },
      primitives: [{ kind: "iso-prism", center: [0, 0, 4], dimensions: [80, 40, 8] }],
      calloutAnchor: [0, -20, 8],
    },
    {
      id: "cabo",
      label: "Cabo do sensor",
      technicalRole: "O cabo tem 1,2 mm de raio.",
      strokeTier: "crease",
      surfaceTone: "elevated",
      joint: { type: "fixed", axis: [0, 0, 1], origin: [0, 0, 0], range: [0, 0] },
      primitives: [
        {
          kind: "tube",
          waypoints: [
            [0, 0, 0],
            [10, 4, 6],
          ],
          radius: 1.2,
        },
      ],
      calloutAnchor: [10, 4, 6],
    },
  ],
};

test("a scene spec fills projection, clearance and bend defaults", () => {
  const spec = parseFigureSpec(base);
  assert.equal(spec.projection.azimuthDeg, 45);
  assert.equal(spec.projection.elevationDeg, 35.264);
  assert.equal(spec.projection.scale, 1);
  assert.equal(spec.defaultParameterT, 0.25);
  assert.equal(spec.parts[0]?.joint.minClearanceMm, 1.5);
  const prism = spec.parts[0]?.primitives[0];
  assert.equal(prism?.kind, "iso-prism");
  if (prism?.kind === "iso-prism") assert.equal(prism.chamfer, 0);
  const tube = spec.parts[1]?.primitives[0];
  assert.equal(tube?.kind, "tube");
  if (tube?.kind === "tube") assert.equal(tube.bendRadius, 4);
  assert.equal(spec.parts[0]?.label.length <= 42, true);
});

test("schema rejects a negative radius, a short profile and a single part", () => {
  assert.throws(
    () => parseFigureSpec({ ...base, parts: base.parts.slice(0, 1) }),
    (error: unknown) => error instanceof IdeaParseError && error.issue === "schema",
  );
  const negative = structuredClone(base);
  const prism = negative.parts[0]?.primitives[0];
  if (prism && prism.kind === "iso-prism") prism.dimensions = [-1, 10, 10];
  assert.throws(
    () => parseFigureSpec(negative),
    (error: unknown) => error instanceof IdeaParseError,
  );
  const short = structuredClone(base);
  short.parts[1] = {
    ...short.parts[1],
    id: "eixo",
    primitives: [
      {
        kind: "lathe",
        axisOrigin: [0, 0, 0],
        axisDirection: [0, 0, 1],
        profile: [{ axial: 0, radius: 1 }],
      },
    ],
  };
  assert.throws(
    () => parseFigureSpec(short),
    (error: unknown) => error instanceof IdeaParseError,
  );
});

test("ids are folded into the fig- family and long copy is trimmed before the schema", () => {
  assert.equal(sceneSlug("Bico do motor"), "fig-bico-do-motor");
  assert.equal(sceneSlug("fig-bancada"), "fig-bancada");
  const spec = parseFigureSpec({
    ...base,
    id: "Relógio de bancada",
    title: "T".repeat(80),
    parts: base.parts.map((part, index) =>
      index === 0 ? { ...part, label: "L".repeat(60), technicalRole: "R".repeat(200) } : part,
    ),
  });
  assert.equal(spec.id, "fig-relogio-de-bancada");
  assert.equal(spec.title.length, 60);
  assert.equal(spec.parts[0]?.label.length, 42);
  assert.equal(spec.parts[0]?.technicalRole.length, 140);
});
