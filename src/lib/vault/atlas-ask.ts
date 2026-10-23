import { createServerFn } from "@tanstack/react-start";
import { answerWithGemini, atlasGate, parseAtlasRequest, type AtlasOutcome } from "./atlas.ts";

function geminiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"];
}

function logAtlas(message: string) {
  console.info(message);
}

export const atlasReady = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ enabled: boolean }> => {
    const enabled = Boolean(geminiKey()?.trim());
    logAtlas(`atlas ready ${enabled ? "yes" : "no"}`);
    return { enabled };
  },
);

export const askAtlas = createServerFn({ method: "POST" })
  .validator(parseAtlasRequest)
  .handler(async ({ data }): Promise<AtlasOutcome> => {
    logAtlas("atlas ask");
    const outcome = await answerWithGemini(data, { apiKey: geminiKey(), gate: atlasGate });
    if (outcome.kind === "fallback") logAtlas(`atlas fallback ${outcome.reason}`);
    else if (outcome.kind === "unknown") logAtlas("atlas unknown");
    else logAtlas("atlas answer");
    return outcome;
  });
