import type { ProviderKind, Settings } from "./types";
import { secrets } from "./bridge";

export const PROVIDER_PRESETS: Record<ProviderKind, { label: string; baseUrl: string; model: string; needsKey: boolean }> = {
  kernel: { label: "Kernel AI (built in)", baseUrl: "/api/kernel", model: "openai/gpt-6-astra", needsKey: false },
  demo: { label: "Demo (simulated)", baseUrl: "", model: "", needsKey: false },
  openai: { label: "OpenAI-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", needsKey: true },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", needsKey: true },
  together: { label: "Together", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", needsKey: true },
  ollama: { label: "Local (Ollama)", baseUrl: "http://localhost:11434/v1", model: "llama3.1", needsKey: false },
};

/** Relative bases (the built-in provider) need the web host when running inside the desktop app. */
export function resolveBase(base: string) {
  const b = base.replace(/\/$/, "");
  if (!b.startsWith("/")) return b;
  const remote = (import.meta.env["VITE_KERNEL_REMOTE_URL"] as string | undefined) ?? "";
  return typeof window !== "undefined" && window.location.protocol === "app:" ? remote.replace(/\/$/, "") + b : b;
}

export const apiKeyName = (p: ProviderKind) => `apiKey:${p}`;

export type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] | undefined }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export class ModelError extends Error {
  constructor(message: string, public status?: number) {
    super(status === 402 ? "AI credits are used up for this workspace. Add credits to keep going." : status === 429 ? "Too many requests right now. Wait a moment and try again." : message);
  }
}

export interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
}

/** List local Ollama models (uses the native /api/tags endpoint). */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const root = baseUrl.replace(/\/v1\/?$/, "");
  const res = await fetch(`${root}/api/tags`);
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const json = (await res.json()) as { models?: { name: string }[] };
  return (json.models ?? []).map((m) => m.name);
}

/** One streaming chat-completions call against any OpenAI-compatible endpoint. */
export async function streamChat(opts: {
  settings: Settings;
  messages: WireMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  onToken: (delta: string) => void;
  onReasoning?: (delta: string) => void;
}): Promise<StreamResult> {
  const { settings } = opts;
  const preset = PROVIDER_PRESETS[settings.provider];
  const key = await secrets.get(apiKeyName(settings.provider));
  if (preset.needsKey && !key) throw new Error("No API key set for this provider. Add it in Settings.");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  if (settings.provider === "openrouter") headers["X-Title"] = "Kernel Axiom";

  const res = await fetch(`${resolveBase(settings.baseUrl || preset.baseUrl)}/chat/completions`, {
    method: "POST",
    headers,
    signal: opts.signal ?? null,
    body: JSON.stringify({
      model: settings.model || preset.model,
      messages: opts.messages,
      tools: opts.tools?.length ? opts.tools : undefined,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new ModelError(`Provider error ${res.status}: ${body.slice(0, 200)}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const calls: ToolCall[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        if (json.error) throw new ModelError(json.error.message ?? "Model error", json.error.status);
        const delta = json.choices?.[0]?.delta ?? {};
        if (delta.reasoning) opts.onReasoning?.(delta.reasoning);
        if (delta.content) {
          text += delta.content;
          opts.onToken(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const i = tc.index ?? 0;
          calls[i] ??= { id: tc.id ?? `call_${i}`, type: "function", function: { name: "", arguments: "" } };
          if (tc.id) calls[i].id = tc.id;
          if (tc.function?.name) calls[i].function.name += tc.function.name;
          if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
        }
      } catch (e) {
        if (e instanceof ModelError) throw e;
        /* partial frame; ignore */
      }
    }
  }
  return { text, toolCalls: calls.filter(Boolean) };
}
