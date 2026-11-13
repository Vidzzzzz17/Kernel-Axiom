import { useEffect, useRef, useState } from "react";
import { FolderOpen, Monitor, ShieldCheck, X } from "lucide-react";
import type { Settings } from "@/lib/kernel/types";
import { saveSettings } from "@/lib/kernel/db";
import kernelLogo from "@/assets/kernel-logo.png";
import { ProviderForm } from "./ProviderForm";
import { IconButton, KButton } from "./ui";

export function ComputerSetup({ settings, onClose, onStatus }: { settings: Settings; onClose: () => void; onStatus: (enabled: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const desktop = typeof window !== "undefined" && !!window.kernel?.computer;
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    let live = true;
    void window.kernel?.computer?.status().then(s => { if (live) { setEnabled(s.enabled); setSupported(s.supported); } }).catch(e => { if (live) setError(e.message); });
    void window.kernel?.workspace?.root().then(root => { if (live) setFolder(root); }).catch(e => { if (live) setError(e.message); });
    const unsubscribe = window.kernel?.computer?.onStopped(() => { setEnabled(false); onStatus(false); });
    return () => { live = false; unsubscribe?.(); };
  }, [onStatus]);
  const toggle = async () => {
    setBusy(true); setError("");
    try {
      const api = window.kernel?.computer;
      if (!api) return;
      const status = enabled ? await api.stop() : await api.enable();
      setEnabled(status.enabled); onStatus(status.enabled);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <dialog ref={dialog} aria-labelledby="pc-setup-title" onCancel={e => { e.preventDefault(); onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/25">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background p-5">
        <img src={kernelLogo} alt="" className="size-11 rounded-xl" />
        <div className="flex-1"><h2 className="text-xl" id="pc-setup-title">Set up your assistant</h2><p className="mt-1 text-xs text-muted-foreground">Your model. Your workspace. Your control.</p></div>
        <IconButton label="Close PC setup" onClick={onClose}><X className="size-4" /></IconButton>
      </header>
      <div className="space-y-6 p-5 sm:p-6">
        <section className="rounded-2xl border border-border p-4">
          <h3 className="mb-4 flex items-center gap-2 text-lg"><Monitor className="size-5" /> PC control <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-xs">{enabled ? "Enabled" : "Off"}</span></h3>
          <p className="text-sm text-muted-foreground">Inspect visible app controls, click, type, scroll and use keyboard shortcuts. Every action asks first. App text is shared with your selected model only after approval.</p>
          {!desktop ? <p className="mt-3 text-sm">PC control requires the Windows desktop app. <a className="underline" href="https://github.com/Vidzzzzz17/Kernel-Axiom/releases" target="_blank" rel="noreferrer">Windows releases</a></p> : !supported ? <p className="mt-3 text-sm">PC control is available on Windows only.</p> : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <KButton variant="primary" disabled={busy || (!enabled && settings.provider === "demo")} onClick={toggle}>{enabled ? "Disable PC control" : "Enable PC control"}</KButton>
              <span className="text-xs text-muted-foreground">Emergency stop: <kbd>Ctrl + Alt + Esc</kbd></span>
            </div>
          )}
          {settings.provider === "demo" && <p className="mt-3 text-sm">Save a real model below before enabling PC control.</p>}
          <p className="mt-3 flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" /> Access resets when Axiom closes or reloads. Password fields and elevated apps need your input.</p>
        </section>
        {desktop && <section className="rounded-2xl border border-border p-4">
          <h3 className="flex items-center gap-2 text-lg"><FolderOpen className="size-5" /> Workspace folder</h3>
          <p className="my-3 break-all text-sm text-muted-foreground">{folder ?? "Choose where Axiom reads and writes files. Commands start here; they are not sandboxed to this folder."}</p>
          <KButton onClick={async () => { try { setFolder(await window.kernel!.workspace!.choose()); } catch (e) { setError((e as Error).message); } }}>Choose folder</KButton>
        </section>}
        <section><h3 className="mb-4 text-lg">AI model</h3><ProviderForm settings={settings} onSave={saveSettings} /></section>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </dialog>
  );
}
