import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GEMINI_MODEL } from "../../lib/vault/atlas.ts";
import { benchSpec } from "./examples.ts";
import { buildFigureGeminiPayload, compileWithGemini, createFigureGate, parseFigureAsk } from "./gemini.ts";

const input = {
  userRequest: "uma bancada de prova",
  activeNoteTitle: "Hoje",
  activeNoteExcerpt: "A haste mede 40 mm.",
  linkedNotesSummary: ["Livre: o trilho mede 64 mm."],
  preferredTheme: "paper",
};

function abortingFetch(settleMs: number): typeof fetch {
  return (_url, init) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        reject(new Error("aborted"));
      };
      const signal = init?.signal;
      if (!signal || signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
      setTimeout(fail, settleMs);
    });
}

test("the gemini payload names the model and keeps the key out of the body", () => {
  const payload = buildFigureGeminiPayload(input);
  assert.equal(payload.model, GEMINI_MODEL);
  assert.equal(payload.model, "gemini-4-argon");
  const body = JSON.stringify(payload);
  assert.equal(body.includes("GEMINI_API_KEY"), false);
  assert.equal(body.includes("sk-"), false);
  assert.match(body, /A haste mede 40 mm/);
  assert.throws(() => parseFigureAsk({ ...input, activeNoteExcerpt: "x".repeat(701) }));
  assert.throws(() => parseFigureAsk({ ...input, linkedNotesSummary: ["a", "b", "c", "d", "e"] }));
});

test("a missing, refused or slow key falls back without echoing the secret", async () => {
  const missing = await compileWithGemini(input, {
    apiKey: undefined,
    fetchImpl: async () => {
      throw new Error("nope");
    },
  });
  assert.equal(missing.kind, "fallback");
  assert.equal(missing.spec.parts.length >= 2, true);
  const gate = createFigureGate();
  const now = 5_000_000;
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 401 });
  };
  const first = await compileWithGemini(input, { apiKey: "secret-key-xyz", fetchImpl, gate, now });
  const second = await compileWithGemini(input, { apiKey: "secret-key-xyz", fetchImpl, gate, now: now + 100 });
  assert.equal(first.kind, "fallback");
  assert.equal(second.kind, "fallback");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(first).includes("secret-key-xyz"), false);
  assert.equal(JSON.stringify(second).includes("secret-key-xyz"), false);
  const timed = await compileWithGemini(input, {
    apiKey: "secret-key-xyz",
    timeoutMs: 30,
    gate: createFigureGate(),
    fetchImpl: abortingFetch(200),
  });
  assert.equal(timed.kind, "fallback");
  assert.equal(JSON.stringify(timed).includes("secret-key-xyz"), false);
});

test("a valid model spec is kept and a broken one is replaced", async () => {
  const good = JSON.stringify(benchSpec());
  const accepted = await compileWithGemini(input, {
    apiKey: "secret-key-xyz",
    gate: createFigureGate(),
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: good } }] }), { status: 200 }),
  });
  assert.equal(accepted.kind, "model");
  assert.equal(accepted.spec.id, "fig-bancada");
  const broken = await compileWithGemini(input, {
    apiKey: "secret-key-xyz",
    gate: createFigureGate(),
    fetchImpl: async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{\"title\":\"nao\"}" } }] }), { status: 200 }),
  });
  assert.equal(broken.kind, "fallback");
  assert.ok(broken.spec.parts.length >= 2);
});

test("the server entry reads GEMINI_API_KEY and never a VITE key", () => {
  const source = readFileSync(new URL("../../lib/vault/figure-ask.ts", import.meta.url), "utf8");
  assert.match(source, /GEMINI_API_KEY/);
  assert.equal(source.includes("VITE_"), false);
  assert.equal(source.includes("console."), false);
});
