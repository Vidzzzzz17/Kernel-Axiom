import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
import { X } from "lucide-react";
import { db, exportAll, importAll, saveSettings } from "@/lib/kernel/db";
import { ORB_STATES, type Settings } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";
import { Orb } from "./Orb";
import { ProviderForm } from "./ProviderForm";
import { IconButton, KButton, spring } from "./ui";

type Tab = "Model" | "Memory" | "Data" | "Orb";

export function SettingsPanel({ settings, onClose, initialTab = "Model" }: { settings: Settings; onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const notes = useLiveQuery(() => db.memory.orderBy("updatedAt").reverse().toArray(), []) ?? [];

  const doExport = async () => {
    const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kernel-axiom-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("Exported. API keys are never included.");
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-background/40 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <motion.div
        role="dialog"
        aria-label="Settings"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={spring}
        className="glass flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-border p-3 pl-5">
          <h2 className="text-xl">Settings</h2>
          <IconButton label="Close settings" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </header>
        <div role="tablist" className="flex gap-1 px-3 pt-3">
          {(["Model", "Memory", "Data", "Orb"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("min-h-11 rounded-xl px-4 text-sm", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-foreground/5")}
            >
              {t === "Orb" ? "Orb states" : t}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "Model" && (
            <ProviderForm
              settings={settings}
              onSave={async (s) => {
                await saveSettings(s);
                setMsg("Saved.");
              }}
            />
          )}
          {tab === "Memory" && (
            <ul className="space-y-2">
              {notes.length === 0 && <li className="text-sm text-muted-foreground">Nothing saved yet. Notes the agent writes land here.</li>}
              {notes.map((n) => (
                <li key={n.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs">{n.path}</p>
                    <KButton variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => db.memory.delete(n.id)}>
                      Delete
                    </KButton>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-muted-foreground">{n.content}</pre>
                </li>
              ))}
            </ul>
          )}
          {tab === "Data" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Everything lives on this device. Export a JSON backup of tasks, chats, memory and settings, or restore one.
              </p>
              <div className="flex flex-wrap gap-2">
                <KButton variant="primary" onClick={doExport}>
                  Export data
                </KButton>
                <KButton onClick={() => fileRef.current?.click()}>Import data</KButton>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      await importAll(JSON.parse(await f.text()));
                      setMsg("Imported.");
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : "Import failed.");
                    }
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}
          {tab === "Orb" && (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {ORB_STATES.map((s) => (
                <li key={s} className="flex flex-col items-center gap-2 rounded-2xl border border-border p-3">
                  <Orb size={44} state={s} />
                  <span className="label-mono text-center text-[10px] text-muted-foreground">{s}</span>
                </li>
              ))}
            </ul>
          )}
          {msg && (
            <p className="mt-4 text-sm" role="status">
              {msg}
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
