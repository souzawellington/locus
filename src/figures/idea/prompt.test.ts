import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFigureCompilationPrompt, sanitizeFigureCopyWithHumanizer } from "./prompt.ts";

const spec = {
  id: "fig-bancada",
  title: "Bancada",
  subtitle: "O carro corre 22 mm.",
  parameterLabel: "curso",
  parts: [
    { label: "Base da bancada", technicalRole: "A base mede 80 mm por 40 mm." },
    { label: "Cabo do sensor", technicalRole: "O cabo tem 1,2 mm de raio." },
  ],
};

test("the compilation prompt carries anatomy and humanizer rules without the whole vault", () => {
  const prompt = buildFigureCompilationPrompt("um bico de ensaio", {
    activeNoteTitle: "Bancada",
    activeNoteExcerpt: `${"a".repeat(900)} SENTINELA-FORA`,
    linkedNotesSummary: ["um", "dois", "tres", "quatro", "cinco SENTINELA-LINK"],
    preferredTheme: "paper",
  });
  assert.match(prompt.system, /lathe/);
  assert.match(prompt.system, /bendRadius/);
  assert.match(prompt.system, /minClearanceMm/);
  assert.match(prompt.system, /silhouette/);
  assert.match(prompt.system, /tapeçaria/);
  assert.match(prompt.system, /não é apenas/);
  assert.equal(prompt.user.includes("SENTINELA-FORA"), false);
  assert.equal(prompt.user.includes("SENTINELA-LINK"), false);
  assert.equal(prompt.user.includes("um bico de ensaio"), true);
});

test("the humanizer leaves a plain sentence alone and softens cliches", () => {
  const same = sanitizeFigureCopyWithHumanizer(spec);
  assert.equal(same.parts[0]?.technicalRole, spec.parts[0]?.technicalRole);
  assert.equal(same.parts[0]?.label, spec.parts[0]?.label);
  const dirty = sanitizeFigureCopyWithHumanizer({
    ...spec,
    subtitle: "Isto serve como um testamento da sinergia — um — dois.",
    parts: spec.parts.map((part, index) =>
      index === 0
        ? { ...part, label: "Base da bancada de aço temperado", technicalRole: "Não é apenas um pé. O resto fica de fora." }
        : part,
    ),
  });
  assert.equal(dirty.subtitle.includes("testamento"), false);
  assert.equal(dirty.subtitle.includes("sinergia"), false);
  assert.equal((dirty.subtitle.match(/—/g) ?? []).length, 1);
  assert.ok((dirty.parts[0]?.label.split(/\s+/).length ?? 0) <= 4);
  assert.equal(dirty.parts[0]?.technicalRole, "é um pé.");
  assert.equal(dirty.parts[1]?.technicalRole, spec.parts[1]?.technicalRole);
});
