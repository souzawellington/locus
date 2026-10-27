import assert from "node:assert/strict";
import { test } from "node:test";
import { benchSpec } from "./examples.ts";
import { buildIdeaRequest, repairFigureFromModel, requestIdea, type IdeaSettings } from "./provider.ts";

const settings: IdeaSettings = {
  provider: "xai",
  baseUrl: "https://api.x.ai/v1",
  model: "grok-4-fast",
  apiKey: "sk-test-not-a-real-key",
};

test("the chat request goes only to the provider and keeps the key out of the url and body", () => {
  const { url, init } = buildIdeaRequest(settings, { description: "uma prensa", previous: null, note: "" });
  assert.equal(url, "https://api.x.ai/v1/chat/completions");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer sk-test-not-a-real-key");
  const body = String(init.body);
  assert.equal(body.includes(settings.apiKey), false);
  assert.equal(url.includes(settings.apiKey), false);
  const parsed = JSON.parse(body) as { model: string; response_format?: { type: string }; messages: { role: string }[] };
  assert.equal(parsed.model, "grok-4-fast");
  assert.equal(parsed.response_format?.type, "json_object");
  assert.deepEqual(parsed.messages.map((message) => message.role), ["system", "user"]);
});

test("openai and a custom https endpoint are built without calling the network", () => {
  const openai = buildIdeaRequest(
    { provider: "openai", baseUrl: "ignored", model: "gpt-4o-mini", apiKey: "sk-openai-test" },
    { description: "uma gaveta", previous: null, note: "" },
  );
  assert.equal(openai.url, "https://api.openai.com/v1/chat/completions");
  const custom = buildIdeaRequest(
    { provider: "custom", baseUrl: "https://example.com/v1/", model: "local-model", apiKey: "local-key" },
    { description: "um relógio", previous: "{\"name\":\"x\"}", note: "mais parafusos" },
  );
  assert.equal(custom.url, "https://example.com/v1/chat/completions");
  const body = JSON.parse(String(custom.init.body)) as { response_format?: unknown; messages: { content: string }[] };
  assert.equal(body.response_format, undefined);
  assert.match(body.messages[1]?.content ?? "", /mais parafusos/);
  assert.throws(() => buildIdeaRequest({ ...settings, baseUrl: "http://insecure.example/v1", provider: "custom" }, { description: "x", previous: null, note: "" }));
});

test("requestIdea uses the injected fetch and does not keep going on a bad status", async () => {
  const calls: string[] = [];
  const content = await requestIdea(settings, { description: "uma balança", previous: null, note: "" }, async (url, init) => {
    calls.push(String(url));
    assert.equal(String(init?.body).includes(settings.apiKey), false);
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), { status: 200 });
  });
  assert.equal(content, "{\"ok\":true}");
  assert.deepEqual(calls, ["https://api.x.ai/v1/chat/completions"]);
  await assert.rejects(
    () => requestIdea(settings, { description: "x", previous: null, note: "" }, async () => new Response("no", { status: 401 })),
    /401/,
  );
});

const rac = {
  activeNoteTitle: "",
  activeNoteExcerpt: "",
  linkedNotesSummary: [] as string[],
  preferredTheme: "paper",
};

test("a bad figure is sent back at most twice, then the local machine is used", async () => {
  let calls = 0;
  const repaired = await repairFigureFromModel({
    userRequest: "uma bancada",
    rac,
    deadline: Date.now() + 2_000,
    callModel: async (prompt) => {
      calls += 1;
      if (calls > 1) assert.match(prompt.user, /não serviu|não descrevia|não veio/);
      return { title: "não" };
    },
  });
  assert.equal(calls, 3);
  assert.equal(repaired.fromModel, false);
  assert.ok(repaired.spec.parts.length >= 2);
});

test("the second answer is kept when the first one does not close", async () => {
  let calls = 0;
  const repaired = await repairFigureFromModel({
    userRequest: "uma bancada",
    rac,
    deadline: Date.now() + 2_000,
    callModel: async () => {
      calls += 1;
      return calls === 1 ? { title: "não" } : benchSpec();
    },
  });
  assert.equal(calls, 2);
  assert.equal(repaired.fromModel, true);
  assert.equal(repaired.spec.id, "fig-bancada");
});

test("a deadline that already passed does not call the model", async () => {
  let calls = 0;
  const repaired = await repairFigureFromModel({
    userRequest: "um relógio comparador",
    rac,
    deadline: Date.now() - 5,
    callModel: async () => {
      calls += 1;
      return benchSpec();
    },
  });
  assert.equal(calls, 0);
  assert.equal(repaired.fromModel, false);
  assert.match(repaired.spec.id, /relogio|bancada|bico|tanque|placa/);
});
