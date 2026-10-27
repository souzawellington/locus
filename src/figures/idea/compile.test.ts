import assert from "node:assert/strict";
import { test } from "node:test";
import { iso } from "../../../.agents/skills/anatomy/kit/iso-kit.ts";
import { SCENE_AUDIT_T } from "../geometry/machines.ts";
import {
  calloutsCross,
  distanceToPrimitive,
  measureAudit,
  observeClearance,
  orderConverged,
  painterSort,
  posePoint,
  projectPoint,
  restCloud,
  tubeCenterline,
} from "../geometry/scene.ts";
import { compileFigureScene, validateAndRepair } from "./compile.ts";
import { benchSpec, exampleCatalog, nozzleSpec } from "./examples.ts";
import { parseFigureSpec, type FigureIdeaSpec, type FigurePart } from "./schema.ts";

test("projection matches the anatomy kit and joints rotate or slide", () => {
  const spec = benchSpec();
  const projected = projectPoint([12, -4, 9], spec.projection);
  const kit = iso([12, -4, 9], {
    origin: [0, 0],
    scale: spec.projection.scale,
    azimuth: spec.projection.azimuthDeg,
    elevation: spec.projection.elevationDeg,
  });
  assert.ok(Math.hypot(projected[0] - kit[0], projected[1] - kit[1]) < 1e-6);
  const turned = posePoint(
    [10, 0, 0],
    { type: "revolute", axis: [0, 0, 1], origin: [0, 0, 0], range: [90, 90], minClearanceMm: 1.5 },
    0,
    0,
  );
  assert.ok(Math.abs(turned[0]) < 1e-6 && Math.abs(turned[1] - 10) < 1e-6);
  const slid = posePoint(
    [0, 0, 0],
    { type: "prismatic", axis: [1, 0, 0], origin: [0, 0, 0], range: [0, 10], minClearanceMm: 1.5 },
    1,
    0,
  );
  assert.ok(Math.abs(slid[0] - 10) < 1e-6);
  const apart = posePoint(
    [0, 0, 0],
    { type: "exploded-slide", axis: [0, 0, 1], origin: [0, 0, 0], range: [0, 18], minClearanceMm: 1.5 },
    0.2,
    1,
  );
  assert.ok(Math.abs(apart[2] - 18) < 1e-6);
});

test("lathe follows axisDirection and a tube is meshed", () => {
  const along = (axis: [number, number, number]) =>
    restCloud({
      kind: "lathe",
      axisOrigin: [0, 0, 0],
      axisDirection: axis,
      profile: [
        { axial: 0, radius: 2 },
        { axial: 20, radius: 2 },
      ],
      segments: 12,
    });
  const span = (points: [number, number, number][], index: number) => {
    const values = points.map((point) => point[index] ?? 0);
    return Math.max(...values) - Math.min(...values);
  };
  const onX = along([1, 0, 0]);
  const onZ = along([0, 0, 1]);
  assert.ok(span(onX, 0) > span(onX, 2));
  assert.ok(span(onZ, 2) > span(onZ, 0));
  const cable = compileFigureScene(benchSpec(), 0.25).polygons.filter((polygon) => polygon.partId === "cabo");
  assert.ok(cable.length >= 8);
  const line = tubeCenterline(
    [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
    ],
    4,
  );
  assert.ok(line.some((point) => point[0] < 10 && point[1] > 0 && point[1] < 10));
});

test("clearance uses part geometry, not callout anchors", () => {
  const overlapping = pairSpec("fig-cruza", 0);
  const separated = pairSpec("fig-afasta", 30);
  assert.ok(observeClearance(overlapping, 0.5).minClearanceObservedMm < 1);
  assert.ok(observeClearance(separated, 0.5).minClearanceObservedMm > 20);
  assert.equal(compileFigureScene(overlapping, 0.5).audit.clearanceEnvelopeValid, false);
  assert.equal(compileFigureScene(separated, 0.5).audit.clearanceEnvelopeValid, true);
  assert.ok(
    distanceToPrimitive([0, 0, 0], { kind: "iso-prism", center: [0, 0, 0], dimensions: [10, 10, 10], chamfer: 0 }) < 0,
  );
});

test("audit invariants hold at every sample and bounds are measured", () => {
  const spec = benchSpec();
  const verdict = validateAndRepair(spec);
  assert.equal(verdict.accepted, true);
  assert.deepEqual(
    verdict.samples.map((sample) => sample.t),
    [...SCENE_AUDIT_T],
  );
  for (const sample of verdict.samples) {
    assert.equal(sample.audit.passed, true, `${sample.t} ${sample.audit.warnings.join(",")}`);
    assert.equal(sample.audit.affineBoundsValid, true);
    assert.equal(sample.audit.emptyClippingValid, true);
    assert.equal(sample.audit.orderConvergenceValid, true);
    assert.ok(sample.audit.minClearanceObservedMm >= 1.5);
  }
  const scene = compileFigureScene(spec, 0.25);
  const lied = measureAudit({
    viewBox: "0 0 1 1",
    polygons: scene.polygons,
    projection: spec.projection,
    clearance: 4,
    clearanceValid: true,
    emptyDropped: false,
  });
  assert.equal(lied.affineBoundsValid, false);
  assert.equal(scene.audit.affineBoundsValid, true);
  assert.deepEqual(
    painterSort([
      { id: "b", depthZ: 1 },
      { id: "a", depthZ: 1 },
      { id: "c", depthZ: 0 },
    ]).map((item) => item.id),
    ["c", "a", "b"],
  );
  assert.equal(orderConverged([{ id: "a", depthZ: Number.NaN }]), false);
  assert.equal(calloutsCross(scene.callouts), false);
  const moved = compileFigureScene(spec, 1).polygons.find((polygon) => polygon.partId === "carro");
  const rest = scene.polygons.find((polygon) => polygon.partId === "carro");
  assert.ok(moved && rest && moved.points2D[0]?.[0] !== rest.points2D[0]?.[0]);
  assert.ok(scene.polygons.length <= 420);
  assert.ok(scene.readouts.every((item) => item.value.length > 0));
});

test("every local example passes the audit, including the cutaway nozzle", () => {
  for (const spec of exampleCatalog()) {
    const verdict = validateAndRepair(spec);
    assert.equal(
      verdict.accepted,
      true,
      `${spec.id} ${verdict.samples.map((sample) => `${sample.t}:${sample.audit.warnings.join("|")}:${sample.audit.minClearanceObservedMm.toFixed(2)}`).join(" ; ")}`,
    );
  }
  const nozzle = nozzleSpec();
  assert.ok(compileFigureScene(nozzle, 0).polygons.some((polygon) => polygon.partId === "bico"));
  assert.equal(nozzle.parts.find((part) => part.id === "bico")?.surfaceTone, "cutaway");
  assert.equal(nozzle.parts.find((part) => part.id === "bico")?.strokeTier, "section");
});

test("a pose that only collides at the end of travel is not accepted unbroken", () => {
  const spec = pairSpec("fig-tarde", 20);
  const slider = spec.parts[1];
  if (!slider) throw new Error("missing");
  slider.joint = { ...slider.joint, type: "prismatic", axis: [-1, 0, 0], range: [0, 40] };
  assert.equal(compileFigureScene(spec, 0).audit.clearanceEnvelopeValid, true);
  assert.equal(compileFigureScene(spec, 1).audit.clearanceEnvelopeValid, false);
  const verdict = validateAndRepair(spec);
  if (verdict.accepted) {
    for (const sample of verdict.samples) assert.equal(sample.audit.passed, true);
  } else {
    assert.equal(verdict.accepted, false);
  }
});

function pairSpec(id: string, gap: number): FigureIdeaSpec {
  const block = (partId: string, x: number, moving: boolean): FigurePart => ({
    id: partId,
    label: moving ? "Bloco móvel" : "Bloco fixo",
    technicalRole: "O bloco mede 10 mm de lado.",
    strokeTier: "silhouette",
    surfaceTone: moving ? "accent" : "base",
    joint: moving
      ? { type: "prismatic", axis: [0, 1, 0], origin: [x, 0, 0], range: [0, 0], minClearanceMm: 1.5 }
      : { type: "fixed", axis: [0, 0, 1], origin: [x, 0, 0], range: [0, 0], minClearanceMm: 1.5 },
    primitives: [{ kind: "iso-prism", center: [x, 0, 0], dimensions: [10, 10, 10], chamfer: 0 }],
    calloutAnchor: moving ? [x, 80, 40] : [x, -80, 40],
  });
  return parseFigureSpec({
    id,
    title: "Dois blocos",
    subtitle: "Dois blocos numa bancada.",
    domain: "mechanism",
    projection: { type: "isometric", azimuthDeg: 45, elevationDeg: 35.264, scale: 1 },
    defaultParameterT: 0.25,
    parameterLabel: "curso",
    parts: [block("fixo", 0, false), block("movel", 10 + gap, true)],
  });
}
