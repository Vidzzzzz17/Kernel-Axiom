import { useEffect, useState } from "react";
import { PROVIDER_PRESETS, apiKeyName, listOllamaModels, listOpenSourceModels } from "@/lib/kernel/modelClient";
import { secrets, isDesktop } from "@/lib/kernel/bridge";
import type { ProviderKind, Settings } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";
import { KButton } from "./ui";

const field =
  "min-h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm outline-none focus-visible:border-foreground";

export function ProviderForm({ settings, onSave, submitLabel = "Save" }: { settings: Settings; onSave: (s: Partial<Settings>) => void; submitLabel?: string }) {
  const [provider, setProvider] = useState<ProviderKind>(settings.provider);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || PROVIDER_PRESETS[settings.provider].baseUrl);
  const [model, setModel] = useState(settings.model || PROVIDER_PRESETS[settings.provider].model);
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelErr, setModelErr] = useState("");
  const preset = PROVIDER_PRESETS[provider];

  useEffect(() => {
    secrets.get(apiKeyName(provider)).then((k) => setHasKey(!!k));
  }, [provider]);

  const pick = (p: ProviderKind) => {
    setProvider(p);
    setBaseUrl(PROVIDER_PRESETS[p].baseUrl);
    setModel(PROVIDER_PRESETS[p].model);
    setModels([]);
    setModelErr("");
  };

  const loadModels = async () => {
    setModelErr("");
    try {
      const m = provider === "opensource" ? await listOpenSourceModels() : await listOllamaModels(baseUrl);
      setModels(m);
      if (m[0] && !m.includes(model)) setModel(m[0]);
    } catch {
      setModelErr(
        provider === "opensource"
          ? "Couldn't reach the open-source model list. Check your connection and try again."
          : "Couldn't reach Ollama. Is it running, with OLLAMA_ORIGINS allowing this app?",
      );
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (key) await secrets.set(apiKeyName(provider), key);
        onSave({ provider, baseUrl, model });
      }}
    >
      <fieldset>
        <legend className="label-mono text-muted-foreground">Provider</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(PROVIDER_PRESETS) as ProviderKind[]).map((p) => (
            <button
              type="button"
              key={p}
              aria-pressed={provider === p}
              onClick={() => pick(p)}
              className={cn(
                "min-h-11 rounded-xl border border-border px-3 text-left text-sm transition-colors",
                provider === p ? "bg-primary text-primary-foreground" : "hover:bg-foreground/5",
              )}
            >
              {PROVIDER_PRESETS[p].label}
            </button>
          ))}
        </div>
      </fieldset>

      {provider === "opensource" ? (
        <p className="text-sm text-muted-foreground">
          An open-source model (GPT-OSS), free, no key and no account. The free tier allows roughly one reply every
          45 seconds, so longer tasks take longer.
        </p>
      ) : provider === "kernel" ? (
        <p className="text-sm text-muted-foreground">
          A real model, ready to use. No key to paste: it runs through Kernel Axiom's own connection.
        </p>
      ) : provider === "demo" ? (
        <p className="text-sm text-muted-foreground">
          Runs a simulated agent so you can see every step, approval and orb state. No key needed.
        </p>
      ) : (
        <>
          <label className="block">
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
              {(provider === "ollama" || provider === "opensource") && (
                <KButton type="button" className="shrink-0 rounded-xl" onClick={loadModels}>
                  Find models
                </KButton>
              )}
            </div>
            {modelErr && <span className="mt-1 block text-xs text-destructive">{modelErr}</span>}
          </label>
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
      <div className="flex justify-end">
        <KButton variant="primary" type="submit" disabled={preset.needsKey && !hasKey && !key}>
          {submitLabel}
        </KButton>
      </div>
    </form>
  );
}
