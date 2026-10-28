import { createServerFn } from "@tanstack/react-start";
import {
  compileWithGemini,
  figureGate,
  parseFigureAsk,
  type FigureAskInput,
  type FigureAskOutcome,
} from "@/figures/idea/gemini";
import { clipAtlasLog, normalizeGeminiKey } from "./atlas.ts";

function geminiKey(): string {
  return normalizeGeminiKey(process.env["GEMINI_API_KEY"]);
}

function logFigure(message: string) {
  console.info(clipAtlasLog(message, geminiKey()));
}

function publicReason(reason: string, data: FigureAskInput): string {
  let text = clipAtlasLog(reason, geminiKey());
  const hidden = [
    data.userRequest,
    data.activeNoteTitle,
    data.activeNoteExcerpt,
    ...data.linkedNotesSummary,
  ];
  for (const bit of hidden) {
    const clean = bit.trim();
    if (clean.length >= 8) text = text.split(clean).join("");
  }
  return text.replace(/\s+/g, " ").trim() || "exception";
}

export const figureReady = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ enabled: boolean }> => {
    const enabled = Boolean(geminiKey());
    logFigure(`figure ready ${enabled ? "yes" : "no"}`);
    return { enabled };
  },
);

export const askFigure = createServerFn({ method: "POST" })
  .validator(parseFigureAsk)
  .handler(async ({ data }): Promise<FigureAskOutcome> => {
    logFigure("figure ask");
    const outcome = await compileWithGemini(data, { apiKey: geminiKey(), gate: figureGate });
    if (outcome.kind === "fallback") {
      logFigure(`figure fallback ${publicReason(outcome.reason ?? "exception", data)}`);
    } else logFigure("figure answer");
    return outcome;
  });
