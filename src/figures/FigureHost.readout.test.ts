import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { compileFigureScene } from "./geometry/scene.ts";
import { benchSpec } from "./idea/examples.ts";
import { openingReadout } from "./readout.ts";

const require = createRequire(import.meta.url);

test("FigureHost's scene writes the readout on the first render", () => {
  const spec = benchSpec();
  const scene = compileFigureScene(spec, spec.defaultParameterT);
  const text = openingReadout(scene.readouts);
  assert.match(text, /mm|%/);
  const directory = mkdtempSync(join(tmpdir(), "locus-readout-"));
  try {
    symlinkSync(join(process.cwd(), "node_modules"), join(directory, "node_modules"), "dir");
    const files = [
      ["readout.ts", readFileSync(new URL("./readout.ts", import.meta.url), "utf8")],
      ["geometry/stroke.ts", readFileSync(new URL("./geometry/stroke.ts", import.meta.url), "utf8")],
      ["SceneView.tsx", readFileSync(new URL("./SceneView.tsx", import.meta.url), "utf8")],
    ] as const;
    for (const [name, source] of files) {
      const output = join(directory, name.replace(/\.tsx?$/, ".js"));
      mkdirSync(dirname(output), { recursive: true });
      const compiled = ts
        .transpileModule(source, {
          fileName: name,
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
          },
        })
        .outputText.replaceAll('.ts"', '.js"')
        .replaceAll('.tsx"', '.js"');
      writeFileSync(output, compiled);
    }
    const local = createRequire(join(directory, "SceneView.js"));
    const { SceneView } = local("./SceneView.js") as typeof import("./SceneView.tsx");
    const React = require("react") as typeof import("react");
    const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
    const props = {
      title: spec.title,
      subtitle: spec.subtitle,
      parameterLabel: spec.parameterLabel,
      t: spec.defaultParameterT,
      exploded: false,
      selected: null,
      scene,
      onT: () => undefined,
      onToggleExplode: () => undefined,
      onToggleDots: () => undefined,
      onSelect: () => undefined,
    };
    const html = renderToStaticMarkup(React.createElement(SceneView, { ...props, dots: true }));
    assert.match(html, /data-testid="figure-live-readout"/);
    assert.match(html, /data-testid="figure-dots-pattern"/);
    assert.match(html, /data-readout-target="/);
    assert.match(html, /fill-opacity="0.45"/);
    assert.match(html, /tabindex="0"/);
    assert.equal(html.includes(text), true);
    assert.equal(html.includes(">null<"), false);
    assert.equal(html.includes("audit"), false);
    const solid = renderToStaticMarkup(React.createElement(SceneView, { ...props, dots: false }));
    assert.match(solid, /data-seamless=""/);
    assert.match(solid, /data-backdrop="solid"/);
    assert.doesNotMatch(solid, /url\(#locus-dots/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
