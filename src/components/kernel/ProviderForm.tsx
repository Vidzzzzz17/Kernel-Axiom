import { useEffect, useRef, useState } from "react";
import { PROVIDER_PRESETS, apiKeyName, listFreeOpenRouterModels, listOllamaModels, listOpenSourceModels, streamChat } from "@/lib/kernel/modelClient";
import { secrets, isDesktop } from "@/lib/kernel/bridge";
import type { ProviderKind, Settings } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";
import { KButton } from "./ui";
import { normalizeProviderSettings } from "@/lib/kernel/providerSettings";

const field =
  "min-h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm outline-none focus-visible:border-foreground";

export function ProviderForm({ settings, onSave, submitLabel = "Save" }: { settings: Settings; onSave: (s: Partial<Settings>) => void | Promise<void>; submitLabel?: string }) {
  const initial = normalizeProviderSettings(settings);
  const [provider, setProvider] = useState<ProviderKind>(initial.provider);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl || PROVIDER_PRESETS[initial.provider].baseUrl);
  const [model, setModel] = useState(initial.model || PROVIDER_PRESETS[initial.provider].model);
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelErr, setModelErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const testController = useRef<AbortController | null>(null);
  const preset = PROVIDER_PRESETS[provider];

  useEffect(() => {
    let live = true;
    setHasKey(false);
    secrets.get(apiKeyName(provider)).then((k) => { if (live) setHasKey(!!k); }).catch(() => { if (live) setHasKey(false); });
    return () => { live = false; };
  }, [provider]);
  useEffect(() => () => testController.current?.abort(), []);

  const pick = (p: ProviderKind) => {
    setProvider(p);
    setBaseUrl(PROVIDER_PRESETS[p].baseUrl);
    setModel(PROVIDER_PRESETS[p].model);
    setModels([]);
    setModelErr("");
    setKey("");
    setFeedback("");
  };

  const testConnection = async () => {
    setBusy(true);
    setFeedback("");
    setModelErr("");
    const ctrl = new AbortController();
    testController.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const result = await streamChat({
        settings: { ...settings, provider, baseUrl, model }, apiKey: key,
        signal: ctrl.signal, onToken: () => undefined,
        messages: [{ role: "user", content: "Connection test. Call connection_check with no arguments. Do not perform any other action." }],
        tools: [{ type: "function", function: { name: "connection_check", description: "Verify tool calling without taking any action.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false } } }],
      });
      setFeedback(result.toolCalls.some(c => c.function.name === "connection_check") ? "Connected. Chat and tool calling work." : "Chat connected. Tool calling was not confirmed for this model.");
    } catch (error) {
      setModelErr(ctrl.signal.aborted ? "Connection test timed out or was cancelled." : (error as Error).message);
    } finally { clearTimeout(timer); setBusy(false); testController.current = null; }
  };

  const loadModels = async () => {
    setModelErr("");
    try {
      const m = provider === "opensource" ? await listOpenSourceModels() : provider === "openrouterfree" ? await listFreeOpenRouterModels() : await listOllamaModels(baseUrl);
      setModels(m);
      if (m[0] && !m.includes(model)) setModel(m[0]);
    } catch {
      setModelErr(
        provider === "opensource"
          ? "Couldn't reach the open-source model list. Check your connection and try again."
          : provider === "openrouterfree" ? "Couldn't reach OpenRouter's free model list. Check your connection and try again."
          : "Couldn't reach Ollama. Is it running, with OLLAMA_ORIGINS allowing this app?",
      );
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setModelErr("");
        try {
          if (key) await secrets.set(apiKeyName(provider), key);
          await onSave({ provider, baseUrl: baseUrl.trim(), model: model.trim() });
          setFeedback("Model saved.");
        } catch (error) { setModelErr((error as Error).message); }
        finally { setBusy(false); }
      }}
    >
      <fieldset>
        <legend className="label-mono text-muted-foreground">Provider</legend>
        <select aria-label="Model provider" disabled={busy} className={cn(field, "mt-2")} value={provider} onChange={e => pick(e.target.value as ProviderKind)}>
          <option value="opensource">{PROVIDER_PRESETS.opensource.label}</option>
          <optgroup label="Other connections">
            {(Object.keys(PROVIDER_PRESETS) as ProviderKind[]).filter(p => p !== "opensource" && p !== "demo").map(p => <option key={p} value={p}>{PROVIDER_PRESETS[p].label}</option>)}
          </optgroup>
          <optgroup label="Preview only"><option value="demo">{PROVIDER_PRESETS.demo.label}</option></optgroup>
        </select>
        {provider !== "opensource" && <KButton className="mt-2" type="button" disabled={busy} onClick={() => pick("opensource")}>Use free GPT-OSS</KButton>}
      </fieldset>

      {provider === "kernel" ? (
        <p className="text-sm text-muted-foreground">
          Uses Kernel Axiom's hosted connection. Test it below to check availability and tool calling.
        </p>
      ) : provider === "demo" ? (
        <p className="text-sm text-muted-foreground">
          Runs a simulated agent so you can see every step, approval and orb state. No key needed.
        </p>
      ) : (
        <>
          {provider === "opensource" && (
            <p className="text-sm text-muted-foreground">
              GPT-OSS 20B. Free, no key or account. Chat and approved tasks use the same model. Replies may take about 45 seconds; multi-step tasks wait automatically. Requires internet.
            </p>
          )}
          {provider === "openrouterfree" && (
            <p className="text-sm text-muted-foreground">
              Google's Gemma and other free models through OpenRouter. Add your OpenRouter key, then use Find models to choose a model. Availability and rate limits vary; test tool calling before PC tasks.
            </p>
          )}
          {provider !== "opensource" && <><label className="block">
            <span className="label-mono text-muted-foreground">Base URL</span>
            <input className={cn(field, "mt-1.5 font-mono text-xs")} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label className="block">
            <span className="label-mono text-muted-foreground">Model</span>
            <div className="mt-1.5 flex gap-2">
              {models.length > 0 ? (
                <select className={cn(field, "font-mono text-xs")} value={model} onChange={(e) => setModel(e.target.value)}>
                  {models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input className={cn(field, "font-mono text-xs")} value={model} onChange={(e) => setModel(e.target.value)} />
              )}
              {(provider === "ollama" || provider === "openrouterfree") && (
                <KButton type="button" className="shrink-0 rounded-xl" onClick={loadModels}>
                  Find models
                </KButton>
              )}
            </div>
          </label></>}
          {preset.needsKey && (
            <label className="block">
              <span className="label-mono text-muted-foreground">API key {hasKey && "· saved"}</span>
              <input
                type="password"
                autoComplete="off"
                className={cn(field, "mt-1.5 font-mono text-xs")}
                placeholder={hasKey ? "Leave blank to keep the saved key" : "Paste your key"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {isDesktop()
                  ? "Encrypted with your system keychain."
                  : "In the browser, keys are kept in memory only and cleared when you close the tab."}
              </span>
            </label>
          )}
        </>
      )}
      {modelErr && <p role="alert" className="text-sm text-destructive">{modelErr}</p>}
      {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
      <div className="flex justify-end gap-2">
        {provider !== "demo" && <KButton type="button" onClick={testConnection} disabled={busy || (preset.needsKey && !hasKey && !key) || !model.trim()}>{busy ? "Connecting…" : "Test connection"}</KButton>}
        <KButton variant="primary" type="submit" disabled={busy || (provider !== "demo" && !model.trim()) || (preset.needsKey && !hasKey && !key)}>
          {submitLabel}
        </KButton>
      </div>
    </form>
  );
}

