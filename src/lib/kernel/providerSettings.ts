import type { Settings } from "./types";

/** Built-in providers are fixed endpoints; custom providers retain their configuration. */
export function normalizeProviderSettings(settings: Settings): Settings {
  if (settings.provider === "opensource") return { ...settings, baseUrl: "/api/opensource", model: "openai-fast" };
  return settings;
}