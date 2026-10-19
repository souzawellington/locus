import { PROVIDER_DEFAULTS, type IdeaProvider, type IdeaSettings } from "./provider";

const STORAGE_KEY = "locus-idea-provider";

export const EMPTY_SETTINGS: IdeaSettings = {
  provider: "xai",
  baseUrl: PROVIDER_DEFAULTS.xai.baseUrl,
  model: PROVIDER_DEFAULTS.xai.model,
  apiKey: "",
};

export function loadIdeaSettings(): IdeaSettings {
  if (typeof localStorage === "undefined") return { ...EMPTY_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<IdeaSettings>;
    const provider: IdeaProvider = parsed.provider === "openai" || parsed.provider === "custom" ? parsed.provider : "xai";
    return {
      provider,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : EMPTY_SETTINGS.baseUrl,
      model: typeof parsed.model === "string" ? parsed.model : EMPTY_SETTINGS.model,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function saveIdeaSettings(settings: IdeaSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearIdeaKey() {
  const current = loadIdeaSettings();
  saveIdeaSettings({ ...current, apiKey: "" });
}

export function hasIdeaKey(settings: IdeaSettings = loadIdeaSettings()): boolean {
  return settings.apiKey.trim().length > 0;
}
