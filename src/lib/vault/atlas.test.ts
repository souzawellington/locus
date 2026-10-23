import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  acceptModel,
  answerWithGemini,
  clipAtlasLog,
  consultAtlas,
  normalizeGeminiKey,
  ATLAS_SYSTEM,
  buildGeminiPayload,
  createAtlasGate,
  FROM_NOTES,
  GEMINI_MODEL,
  GEMINI_THINKING,
  GEMINI_URL,
  parseAtlasRequest,
  resolveAtlasTurn,
  selectFragments,
  type Fragment,
} from "./atlas.ts";
import { composeAnswer, NOT_IN_NOTES, presentNotes, retrieve } from "./retrieve.ts";
import { seedNotes } from "./seed.ts";
import type { Note, NoteSeal } from "./types.ts";

const seal: NoteSeal = { salt: "aa", iv: "bb", data: "cc", hideTitle: false, iterations: 1 };
const secret = "a senha do cofre é baunilha azul e canela fina demais";

function locked(body: string): Note {
  return { id: "locked", title: "Cofre", body, createdAt: 1, updatedAt: 1, seal };
}

const howTo: Fragment = {
  noteId: "n-how",
  title: "Como usar",
  text: "A busca é instantânea. / abre um bloco. @ liga outra nota.",
  score: 0.8,
};

test("sealed notes stay out of Atlas fragments, including when the body is open", () => {
  const opened = presentNotes([locked("")], {
    locked: { title: "Cofre", body: secret, ink: [] },
  });
  assert.match(opened[0]?.body ?? "", /baunilha/);
  assert.ok(opened[0]?.seal);
  assert.equal(
    JSON.stringify(selectFragments("baunilha azul cofre", opened)).includes("baunilha"),
    false,
  );

  const stuffed = selectFragments("senha do cofre baunilha", [locked(secret), ...seedNotes()]);
  assert.equal(
    stuffed.some((fragment) => fragment.noteId === "locked"),
    false,
  );
  assert.equal(JSON.stringify(stuffed).includes("baunilha"), false);

  const readable = selectFragments("senha do cofre baunilha", [
    { ...locked(secret), seal: undefined },
  ]);
  assert.ok(readable.some((fragment) => fragment.text.includes("baunilha")));
});

test("the @ question sends the sentence that says @ liga outra nota", () => {
  const fragments = selectFragments("O que faz o @?", seedNotes());
  const hit = fragments.find((fragment) => fragment.text.includes("@ liga outra nota"));
  assert.ok(hit);
  assert.equal(hit?.noteId, "n-how");
  assert.equal(hit?.title, "Como usar");
  assert.ok(fragments.length >= 1 && fragments.length <= 5);
  for (const fragment of fragments) assert.ok(fragment.text.length <= 700);
});

test("quote verification drops invented quotes and a wrong note id", () => {
  const mixed = acceptModel(
    {
      answer: "O @ liga outra nota.",
      unknown: false,
      citations: [
        { noteId: "n-how", quote: "@ liga outra nota." },
        { noteId: "n-how", quote: "O Atlas consulta a internet e completa a resposta." },
        { noteId: "locked", quote: "@ liga outra nota." },
      ],
    },
    [howTo],
  );
  assert.equal(mixed.kind, "answer");
  if (mixed.kind !== "answer") return;
  assert.equal(mixed.citations.length, 1);
  assert.equal(mixed.citations[0]?.excerpt, "@ liga outra nota.");
  assert.equal(mixed.citations[0]?.noteId, "n-how");
  assert.match(mixed.content, /O @ liga outra nota/);
  assert.doesNotMatch(mixed.content, /internet/);
  assert.doesNotMatch(mixed.content, /Não saiu do aparelho/);

  const invented = acceptModel(
    {
      answer: "Inventei um fato.",
      unknown: false,
      citations: [{ noteId: "n-how", quote: "fato que não está no texto da nota" }],
    },
    [howTo],
  );
  assert.equal(invented.kind, "unknown");
});

test("unknown from the model becomes the same not-found line", () => {
  const outcome = acceptModel(
    {
      answer: "O @ liga outra nota.",
      unknown: true,
      citations: [{ noteId: "n-how", quote: "@ liga outra nota." }],
    },
    [howTo],
  );
  assert.equal(outcome.kind, "unknown");
  const resolved = resolveAtlasTurn(outcome, {
    content: composeAnswer(retrieve("O que faz o @?", seedNotes())),
    citations: [],
    result: "1 fragmentos",
  });
  assert.equal(resolved.content, NOT_IN_NOTES);
  assert.equal(resolved.citations, undefined);
});

test("no key, timeout, and a bad response fall back without calling out", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response("no", { status: 500 });
  };
  const fragments = [howTo];
  const missing = await answerWithGemini(
    { question: "O que faz o @?", fragments },
    { apiKey: "  ", fetchImpl },
  );
  assert.equal(missing.kind, "fallback");
  if (missing.kind === "fallback") assert.equal(missing.reason, "missing-key");
  assert.equal(calls, 0);

  const failed = await answerWithGemini(
    { question: "O que faz o @?", fragments },
    { apiKey: "test-key-secret", fetchImpl },
  );
  assert.equal(failed.kind, "fallback");
  if (failed.kind === "fallback") {
    assert.match(failed.reason, /^http-500/);
    assert.equal(failed.reason.includes("test-key-secret"), false);
  }
  assert.equal(calls, 1);

  const timedOut = await answerWithGemini(
    { question: "O que faz o @?", fragments },
    {
      apiKey: "test-key",
      timeoutMs: 30,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (!signal) {
            fail();
            return;
          }
          if (signal.aborted) {
            fail();
            return;
          }
          const pulse = setInterval(() => {
            if (signal.aborted) {
              clearInterval(pulse);
              fail();
            }
          }, 5);
          signal.addEventListener(
            "abort",
            () => {
              clearInterval(pulse);
              fail();
            },
            { once: true },
          );
        }),
    },
  );
  assert.equal(timedOut.kind, "fallback");
  if (timedOut.kind === "fallback") assert.match(timedOut.reason, /^exception /);

  const local = composeAnswer(retrieve("O que faz o @?", seedNotes()));
  const resolved = resolveAtlasTurn(timedOut, {
    content: local,
    citations: [],
    result: "1 fragmentos",
  });
  assert.equal(resolved.content, local);
  assert.match(local, /Não saiu do aparelho/);
});

test("a mocked Gemini reply cites @ liga outra nota and keeps the key out of the body", async () => {
  const fragments = selectFragments("O que faz o @?", seedNotes());
  const quote = "@ liga outra nota";
  assert.ok(fragments.some((fragment) => fragment.text.includes(quote)));
  const seen: { url: string; body: string; auth: string }[] = [];
  const outcome = await answerWithGemini(
    { question: "O que faz o @?", fragments },
    {
      apiKey: "test-key-not-real",
      gate: createAtlasGate(),
      fetchImpl: async (url, init) => {
        const headers = init?.headers as Record<string, string>;
        const body = String(init?.body ?? "");
        seen.push({ url: String(url), body, auth: headers.Authorization ?? "" });
        assert.equal(body.includes("test-key-not-real"), false);
        assert.equal(body.includes(secret), false);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "O @ liga outra nota.",
                    unknown: false,
                    citations: [{ noteId: "n-how", quote: "@ liga outra nota." }],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    },
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, GEMINI_URL);
  assert.equal(seen[0]?.auth, "Bearer test-key-not-real");
  const payload = JSON.parse(seen[0]?.body ?? "{}") as {
    model: string;
    reasoning_effort: string;
    response_format: { type: string; json_schema: { schema: { required: string[] } } };
    messages: { role: string; content: string }[];
  };
  assert.equal(payload.model, GEMINI_MODEL);
  assert.equal(payload.reasoning_effort, GEMINI_THINKING);
  assert.equal(payload.response_format.type, "json_schema");
  assert.deepEqual(payload.response_format.json_schema.schema.required, [
    "answer",
    "unknown",
    "citations",
  ]);
  assert.match(payload.messages[0]?.content ?? "", /mergulhar fundo/);
  assert.match(payload.messages[0]?.content ?? "", /tapeçaria/);
  assert.match(payload.messages[1]?.content ?? "", /@ liga outra nota/);
  assert.equal(outcome.kind, "answer");
  if (outcome.kind !== "answer") return;
  assert.equal(outcome.citations[0]?.noteId, "n-how");
  assert.match(outcome.citations[0]?.excerpt ?? "", /@ liga outra nota/);
  assert.match(outcome.content, /^Isto está nas notas\. Não acrescentei fatos de fora\./);
  assert.doesNotMatch(outcome.content, /Não saiu do aparelho/);
  assert.equal(ATLAS_SYSTEM.includes("serve como"), true);
});

test("rate limit and a 400 retry stay on the mocked fetch", async () => {
  const gate = createAtlasGate();
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("schema", { status: 400 });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "O @ liga outra nota.",
                unknown: false,
                citations: [{ noteId: "n-how", quote: "@ liga outra nota." }],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const first = await answerWithGemini(
    { question: "O que faz o @?", fragments: [howTo] },
    { apiKey: "k", fetchImpl, gate, now: 10_000 },
  );
  assert.equal(first.kind, "answer");
  assert.equal(calls, 2);
  const second = await answerWithGemini(
    { question: "O que faz o @?", fragments: [howTo] },
    { apiKey: "k", fetchImpl, gate, now: 10_500 },
  );
  assert.equal(second.kind, "fallback");
  if (second.kind === "fallback") assert.equal(second.reason, "rate-limit");
  assert.equal(calls, 2);
  assert.equal(
    clipAtlasLog("key AIzaSyDUMMYKEY1234567890 inside", "plain-secret"),
    "key [key] inside",
  );
  assert.equal(clipAtlasLog("plain-secret leaked", "plain-secret").includes("plain-secret"), false);
  assert.equal(
    normalizeGeminiKey('  "Bearer AIzaSyDUMMYKEY1234567890"  '),
    "AIzaSyDUMMYKEY1234567890",
  );
});

test("a rejected Gemini key is reported without repeating the key", async () => {
  let calls = 0;
  let auth = "";
  const outcome = await answerWithGemini(
    { question: "O que faz o @?", fragments: [howTo] },
    {
      apiKey: '"Bearer AIzaSyDUMMYKEY1234567890"',
      fetchImpl: async (_url, init) => {
        calls += 1;
        auth = (init?.headers as Record<string, string>).Authorization;
        return new Response(
          JSON.stringify([{ error: { message: "Please pass a valid API key" } }]),
          { status: 400 },
        );
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(auth, "Bearer AIzaSyDUMMYKEY1234567890");
  assert.equal(outcome.kind, "fallback");
  if (outcome.kind === "fallback") {
    assert.equal(outcome.reason, "http-400 Please pass a valid API key");
    assert.equal(outcome.reason.includes("AIza"), false);
  }
});

test("without a key the ask is not called, so note text stays put", async () => {
  let asks = 0;
  const skipped = await consultAtlas(
    { question: "senha do cofre", fragments: [howTo] },
    {
      ready: async () => false,
      ask: async () => {
        asks += 1;
        return { kind: "fallback", reason: "missing-key" };
      },
    },
  );
  assert.equal(skipped, null);
  assert.equal(asks, 0);
  const broken = await consultAtlas(
    { question: "senha do cofre", fragments: [howTo] },
    {
      ready: async () => {
        throw new Error("offline");
      },
      ask: async () => {
        asks += 1;
        return { kind: "fallback", reason: "missing-key" };
      },
    },
  );
  assert.equal(broken, null);
  assert.equal(asks, 0);
});

test("the request parser caps fragments and the local line is unchanged", () => {
  const parsed = parseAtlasRequest({
    question: "O que faz o @?",
    fragments: [{ noteId: "n-how", title: "Como usar", text: howTo.text, score: 0.4 }],
  });
  assert.equal(parsed.fragments.length, 1);
  assert.throws(() =>
    parseAtlasRequest({
      question: "x",
      fragments: Array.from({ length: 6 }, () => ({ noteId: "n", title: "t", text: howTo.text })),
    }),
  );
  const payload = buildGeminiPayload("O que faz o @?", [howTo]);
  assert.equal(JSON.stringify(payload).includes("GEMINI_API_KEY"), false);
  assert.match(
    composeAnswer([{ noteId: "n-how", title: "Como usar", excerpt: "x".repeat(40), score: 1 }]),
    /Não saiu do aparelho/,
  );
  assert.equal(FROM_NOTES.includes("aparelho"), false);
  const ask = readFileSync(new URL("./atlas-ask.ts", import.meta.url), "utf8");
  assert.match(ask, /process\.env\["GEMINI_API_KEY"\]/);
  assert.equal(ask.includes("VITE_"), false);
  const view = readFileSync(
    new URL("../../components/locus/atlas-view.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(view.includes("GEMINI"), false);
  assert.equal(view.includes("gemini"), false);
});
