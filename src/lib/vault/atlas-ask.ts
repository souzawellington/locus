import { createServerFn } from "@tanstack/react-start";
import { answerWithGemini, atlasGate, parseAtlasRequest, type AtlasOutcome } from "./atlas.ts";

function geminiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"];
}

export const atlasReady = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ enabled: boolean }> => {
    return { enabled: Boolean(geminiKey()?.trim()) };
  },
);

export const askAtlas = createServerFn({ method: "POST" })
  .validator(parseAtlasRequest)
  .handler(async ({ data }): Promise<AtlasOutcome> => {
    return answerWithGemini(data, { apiKey: geminiKey(), gate: atlasGate });
  });
