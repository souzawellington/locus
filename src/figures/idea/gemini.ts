import { GEMINI_MODEL, GEMINI_TIMEOUT_MS, GEMINI_URL, parseModelJson } from "../../lib/vault/atlas.ts";
import { validateAndRepair } from "./compile.ts";
import { fallbackFor } from "./examples.ts";
import { buildFigureCompilationPrompt, type FigureRac } from "./prompt.ts";

export const FIGURE_MIN_GAP_MS = 2_000;
export const FIGURE_WINDOW_MS = 60_000;
export const FIGURE_MAX_IN_WINDOW = 15;

export type FigureAskInput = FigureRac & { userRequest: string };
export type FigureAskOutcome = {
  kind: "model" | "fallback";
  specId: string;
  spec: ReturnType<typeof fallbackFor>;
};
export type FigureGate = { allow(at?: number): boolean };

export function createFigureGate(): FigureGate {
  const hits: number[] = [];
  return {
    allow(at = Date.now()): boolean {
      const recent = hits.filter((time) => at - time < FIGURE_WINDOW_MS);
      hits.length = 0;
      hits.push(...recent);
      const last = hits.at(-1) ?? Number.NEGATIVE_INFINITY;
      if (hits.length >= FIGURE_MAX_IN_WINDOW || at - last < FIGURE_MIN_GAP_MS) return false;
      hits.push(at);
      return true;
    },
  };
}

export const figureGate = createFigureGate();

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "figure_idea_spec",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        domain: { type: "string", enum: ["aerospace", "metrology", "wave-physics", "computing", "mechanism"] },
        projection: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["isometric", "trimetric", "dimetric"] },
            azimuthDeg: { type: "number" },
            elevationDeg: { type: "number" },
            scale: { type: "number" },
          },
          required: ["type", "azimuthDeg", "elevationDeg", "scale"],
        },
        defaultParameterT: { type: "number" },
        parameterLabel: { type: "string" },
        parts: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["id", "title", "subtitle", "domain", "projection", "defaultParameterT", "parameterLabel", "parts"],
    },
  },
} as const;

export function parseFigureAsk(input: unknown): FigureAskInput {
  if (!input || typeof input !== "object") throw new Error("Pedido inválido.");
  const data = input as Record<string, unknown>;
  const userRequest = String(data.userRequest ?? "").trim();
  const activeNoteTitle = String(data.activeNoteTitle ?? "").trim();
  const activeNoteExcerpt = String(data.activeNoteExcerpt ?? "");
  const preferredTheme = String(data.preferredTheme ?? "paper").trim();
  if (userRequest.length < 1 || userRequest.length > 500) throw new Error("Pedido inválido.");
  if (activeNoteTitle.length > 80 || activeNoteExcerpt.length > 700 || preferredTheme.length > 32) {
    throw new Error("Pedido inválido.");
  }
  if (!Array.isArray(data.linkedNotesSummary) || data.linkedNotesSummary.length > 4) {
    throw new Error("Pedido inválido.");
  }
  const linkedNotesSummary = data.linkedNotesSummary.map((item) => {
    const text = String(item ?? "").trim();
    if (text.length > 280) throw new Error("Pedido inválido.");
    return text;
  });
  return { userRequest, activeNoteTitle, activeNoteExcerpt, linkedNotesSummary, preferredTheme };
}

export function buildFigureGeminiPayload(input: FigureAskInput) {
  const prompt = buildFigureCompilationPrompt(input.userRequest, input);
  return {
    model: GEMINI_MODEL,
    reasoning_effort: "low",
    max_tokens: 8192,
    temperature: 0.2,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    response_format: RESPONSE_FORMAT,
  };
}

function messageText(body: unknown): string {
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
      return "";
    })
    .join("");
}

function postJson(
  fetchImpl: typeof fetch,
  body: unknown,
  apiKey: string,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const work = fetchImpl(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, response?: Response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (response) resolve(response);
    };
    const onAbort = () => finish(new Error("timeout"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (response) => finish(undefined, response),
      (error: unknown) => finish(error instanceof Error ? error : new Error("rede")),
    );
  });
}

async function discard(response: Response): Promise<void> {
  const body = response.body;
  if (!body) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 30);
    body.cancel().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export async function compileWithGemini(
  input: FigureAskInput,
  deps: {
    apiKey: string | undefined;
    fetchImpl?: typeof fetch;
    gate?: FigureGate;
    now?: number;
    timeoutMs?: number;
  },
): Promise<FigureAskOutcome> {
  const fallback = fallbackFor(input.userRequest);
  const local = { kind: "fallback" as const, specId: fallback.id, spec: fallback };
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return local;
  if (deps.gate && !deps.gate.allow(deps.now)) return local;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? GEMINI_TIMEOUT_MS;
  const payload = buildFigureGeminiPayload(input);
  try {
    let response = await postJson(fetchImpl, payload, apiKey, timeoutMs);
    if (response.status === 400) {
      await discard(response);
      response = await postJson(
        fetchImpl,
        { ...payload, response_format: { type: "json_object" } },
        apiKey,
        timeoutMs,
      );
    }
    if (!response.ok) {
      await discard(response);
      return local;
    }
    const raw = parseModelJson(messageText(await response.json()));
    const verdict = validateAndRepair(raw);
    if (!verdict.accepted || !verdict.spec) return local;
    return { kind: "model", specId: verdict.spec.id, spec: verdict.spec };
  } catch {
    return local;
  }
}
