import { useState } from "react";
import { motion } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
import { X } from "lucide-react";
import { db } from "@/lib/kernel/db";
import type { WorkspaceView } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";
import { IconButton, KButton, fmtTime, spring } from "./ui";

const LINES = [100, 94, 97, 90, 62, 0, 100, 88, 96, 70];

export function Workspace({
  view,
  elapsed,
  running,
  onTakeOver,
  onClose,
}: {
  view: WorkspaceView;
  elapsed: number;
  running: boolean;
  onTakeOver: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"Browser" | "Code" | "Files">("Browser");
  const notes = useLiveQuery(() => db.memory.orderBy("updatedAt").reverse().toArray(), []) ?? [];

  return (
    <motion.section
      initial={{ x: 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 60, opacity: 0 }}
      transition={spring}
      className="glass flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl"
      aria-label="Agent workspace"
    >
      <header className="flex items-center gap-1 border-b border-border p-2">
        <div role="tablist" className="flex gap-1">
          {(["Browser", "Code", "Files"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "min-h-11 rounded-xl px-4 text-sm transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "hover:bg-foreground/5",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {running && (
            <KButton variant="primary" className="rounded-xl" onClick={onTakeOver}>
              Take over
            </KButton>
          )}
          <IconButton label="Close workspace" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tab === "Browser" && (
          <>
            <div className="rounded-full bg-foreground/5 px-4 py-2.5 font-mono text-xs text-muted-foreground">
              {view.url || "about:blank"}
            </div>
            <div className="space-y-3 p-6" aria-hidden>
              <div className="h-5 w-56 rounded-md bg-foreground/[0.06]" />
              {LINES.map((w, i) =>
                w === 0 ? (
                  <div key={i} className="h-5" />
                ) : (
                  <motion.div
                    key={i}
                    className={cn("h-2.5 rounded-full bg-foreground/[0.06]", (i === view.readingLine || i === view.readingLine + 1) && "read-line")}
                    style={{ width: `${w}%` }}
                    layout
                  />
                ),
              )}
            </div>
          </>
        )}
        {tab === "Code" && (
          <pre className="whitespace-pre-wrap rounded-xl bg-foreground/5 p-4 font-mono text-xs leading-relaxed">
            {view.code || "# No code yet"}
          </pre>
        )}
        {tab === "Files" && (
          <ul className="space-y-1">
            {notes.length === 0 && <li className="text-sm text-muted-foreground">No files saved yet.</li>}
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl p-3 hover:bg-foreground/5">
                <p className="font-mono text-xs">{n.path}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full bg-foreground", !running && "opacity-30")} />
          {running ? view.status || "Working" : "Idle"}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{fmtTime(elapsed)}</span>
      </footer>
    </motion.section>
  );
}
