import { compileFigureScene } from "../geometry/scene.ts";
import { validateAndRepair } from "./compile.ts";
import { fallbackFor } from "./examples.ts";
import { IDEA_SYSTEM, buildFigureCompilationPrompt, ideaUserMessage, type FigureRac } from "./prompt.ts";
import type { FigureIdeaSpec } from "./schema.ts";

export type IdeaProvider = "xai" | "openai" | "custom";

export type IdeaSettings = {
  provider: IdeaProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export const PROVIDER_DEFAULTS: Record<Exclude<IdeaProvider, "custom">, { baseUrl: string; model: string; label: string }> = {
  xai: { baseUrl: "https://api.x.ai/v1", model: "grok-4-fast", label: "xAI (Grok)" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", label: "OpenAI" },
};

const MODEL_RE = /^[A-Za-z0-9._:-]{1,80}$/;

export class IdeaRequestError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function endpointFor(settings: Pick<IdeaSettings, "provider" | "baseUrl">): string {
  const raw = settings.provider === "custom" ? settings.baseUrl : PROVIDER_DEFAULTS[settings.provider].baseUrl;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new IdeaRequestError("O endereço do fornecedor não é válido.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new IdeaRequestError("O endereço precisa ser https, sem senha no link.");
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions") ? path : `${path}/chat/completions`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function buildIdeaRequest(
  settings: IdeaSettings,
  input: { description: string; previous: string | null; note: string },
): { url: string; init: RequestInit } {
  const key = settings.apiKey.trim();
  if (!key) throw new IdeaRequestError("Falta a chave.");
  const model = settings.model.trim();
  if (!MODEL_RE.test(model)) throw new IdeaRequestError("O nome do modelo não serve.");
  const url = endpointFor(settings);
  const body: Record<string, unknown> = {
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: IDEA_SYSTEM },
      { role: "user", content: ideaUserMessage(input.description, input.previous, input.note) },
    ],
  };
  if (settings.provider !== "custom") body.response_format = { type: "json_object" };
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    },
  };
}

export async function requestIdea(
  settings: IdeaSettings,
  input: { description: string; previous: string | null; note: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { url, init } = buildIdeaRequest(settings, input);
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new IdeaRequestError("Não consegui chegar ao fornecedor. Nada foi guardado.");
  }
  if (!response.ok) throw new IdeaRequestError(`O fornecedor respondeu ${response.status}. Nada foi guardado.`);
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new IdeaRequestError("O fornecedor não devolveu uma figura.");
  return content;
}

export const REPAIR_SAMPLES = [0, 0.5, 1] as const;
export const MAX_REPAIR_RETRIES = 2;

/** A transport or time failure. The loop stops instead of spending another try. */
export class FigureModelError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function verifyMotion(spec: FigureIdeaSpec): { passed: boolean; warnings: string[] } {
  const warnings: string[] = [];
  for (const t of REPAIR_SAMPLES) {
    for (const explode of [0, 1]) {
      const scene = compileFigureScene(spec, t, { explode });
      if (scene.audit.passed) continue;
      const pose = explode ? "aberta" : "montada";
      for (const warning of scene.audit.warnings) warnings.push(`${pose}, t ${t}: ${warning}`);
    }
  }
  return { passed: warnings.length === 0, warnings: [...new Set(warnings)].slice(0, 8) };
}

/**
 * One model answer, then at most two repairs. Each repair sees the last warnings.
 * The caller owns the clock: a new try does not start after `deadline`.
 */
export async function repairFigureFromModel(input: {
  userRequest: string;
  rac: FigureRac;
  deadline: number;
  callModel: (prompt: { system: string; user: string }) => Promise<unknown>;
}): Promise<{ spec: FigureIdeaSpec; fromModel: boolean }> {
  const fallback = fallbackFor(input.userRequest);
  let warnings: string[] = [];
  for (let attempt = 0; attempt <= MAX_REPAIR_RETRIES; attempt += 1) {
    if (Date.now() >= input.deadline) break;
    try {
      const prompt = buildFigureCompilationPrompt(input.userRequest, input.rac, warnings);
      const raw = await input.callModel(prompt);
      const verdict = validateAndRepair(raw);
      if (!verdict.accepted || !verdict.spec) {
        warnings = ["A resposta não descrevia uma máquina que fecha. Afaste as peças que se cruzam."];
        continue;
      }
      const motion = verifyMotion(verdict.spec);
      if (motion.passed) return { spec: verdict.spec, fromModel: true };
      warnings = motion.warnings.length ? motion.warnings : ["Afaste as peças que se cruzam."];
    } catch (error) {
      if (error instanceof FigureModelError) return { spec: fallback, fromModel: false };
      warnings = ["A resposta não veio como uma figura."];
    }
  }
  return { spec: fallback, fromModel: false };
}
