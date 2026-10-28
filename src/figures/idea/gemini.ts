import {
  clipAtlasLog,
  GEMINI_MODEL,
  GEMINI_TIMEOUT_MS,
  GEMINI_URL,
  geminiHttpReason,
  normalizeGeminiKey,
  parseModelJson,
} from "../../lib/vault/atlas.ts";
import { fallbackFor } from "./examples.ts";
import { FigureModelError, repairFigureFromModel } from "./provider.ts";
import { buildFigureCompilationPrompt, type FigureRac } from "./prompt.ts";

export const FIGURE_MIN_GAP_MS = 2_000;
export const FIGURE_WINDOW_MS = 60_000;
export const FIGURE_MAX_IN_WINDOW = 15;

export type FigureAskInput = FigureRac & { userRequest: string };
export type FigureAskOutcome = {
  kind: "model" | "fallback";
  specId: string;
  spec: ReturnType<typeof fallbackFor>;
  reason?: string;
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
        domain: {
          type: "string",
          enum: ["aerospace", "metrology", "wave-physics", "computing", "mechanism"],
        },
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
      required: [
        "id",
        "title",
        "subtitle",
        "domain",
        "projection",
        "defaultParameterT",
        "parameterLabel",
        "parts",
      ],
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
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part)
        return String((part as { text?: unknown }).text ?? "");
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
  const local = (reason: string): FigureAskOutcome => ({
    kind: "fallback",
    specId: fallback.id,
    spec: fallback,
    reason,
  });
  const apiKey = normalizeGeminiKey(deps.apiKey);
  if (!apiKey) return local("missing-key");
  if (deps.gate && !deps.gate.allow(deps.now)) return local("rate-limit");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? GEMINI_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let reason = "audit-failed";
  const safeException = (error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    const label = message === "timeout" || message === "rede" ? message : "Error";
    return `exception ${clipAtlasLog(label, apiKey)}`;
  };
  try {
    const repaired = await repairFigureFromModel({
      userRequest: input.userRequest,
      rac: input,
      deadline,
      callModel: async (prompt) => {
        reason = "audit-failed";
        const left = deadline - Date.now();
        if (left < 40) {
          reason = "exception timeout";
          throw new FigureModelError("timeout");
        }
        const body = {
          ...buildFigureGeminiPayload({ ...input, userRequest: input.userRequest }),
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        };
        let response: Response;
        try {
          response = await postJson(fetchImpl, body, apiKey, left);
        } catch (error) {
          reason = safeException(error);
          throw error;
        }
        if (response.status === 400) {
          await geminiHttpReason(response, apiKey);
          const retryLeft = deadline - Date.now();
          if (retryLeft < 40) {
            reason = "exception timeout";
            throw new FigureModelError("timeout");
          }
          try {
            response = await postJson(
              fetchImpl,
              { ...body, response_format: { type: "json_object" } },
              apiKey,
              retryLeft,
            );
          } catch (error) {
            reason = safeException(error);
            throw error;
          }
        }
        if (!response.ok) {
          reason = await geminiHttpReason(response, apiKey);
          throw new FigureModelError("status");
        }
        try {
          return parseModelJson(messageText(await response.json()));
        } catch {
          reason = "bad-json";
          throw new Error("json");
        }
      },
    });
    if (repaired.fromModel) return { kind: "model", specId: repaired.spec.id, spec: repaired.spec };
    return local(reason);
  } catch (error) {
    return local(safeException(error));
  }
}
