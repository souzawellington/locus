import { createServerFn } from "@tanstack/react-start";
import { compileWithGemini, figureGate, parseFigureAsk, type FigureAskOutcome } from "@/figures/idea/gemini";

function geminiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"];
}

export const figureReady = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ enabled: boolean }> => {
    return { enabled: Boolean(geminiKey()?.trim()) };
  },
);

export const askFigure = createServerFn({ method: "POST" })
  .validator(parseFigureAsk)
  .handler(async ({ data }): Promise<FigureAskOutcome> => {
    return compileWithGemini(data, { apiKey: geminiKey(), gate: figureGate });
  });
