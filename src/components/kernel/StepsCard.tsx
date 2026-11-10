import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronUp, X } from "lucide-react";
import type { Step } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";
import { fmtTime, spring } from "./ui";

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function StepsCard({ steps, startedAt, live, compact }: { steps: Step[]; startedAt?: number | undefined; live?: boolean | undefined; compact?: boolean }) {
  const [open, setOpen] = useState(true);
  const now = useNow(!!live);
  const done = steps.filter((s) => s.status === "done").length;
  const total = Math.max(steps.length, live ? done + 1 : steps.length);
  const end = live ? now : Math.max(...steps.map((s) => s.endedAt ?? 0), startedAt ?? 0);

  return (
    <motion.div layout transition={spring} className="glass overflow-hidden rounded-2xl">
      {!compact && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-12 w-full items-center justify-between px-4 text-left text-sm"
        >
          <span>
            {done} of {total} steps
          </span>
          <span className="flex items-center gap-2 font-mono text-sm">
            {startedAt ? fmtTime(end - startedAt) : null}
            <ChevronUp className={cn("size-4 transition-transform", !open && "rotate-180")} aria-hidden />
          </span>
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className={cn("space-y-1 px-2 pb-2", !compact && "border-t border-border pt-2")}
          >
            <AnimatePresence initial={false}>
              {steps.map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2 py-2",
                    s.status === "running" && "progress-sweep bg-foreground/5",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full",
                      s.status === "done" && "bg-primary text-primary-foreground",
                      s.status === "failed" && "bg-destructive text-destructive-foreground",
                      s.status === "running" && "border border-medium-gray",
                    )}
                  >
                    {s.status === "done" && <Check className="size-3.5" aria-hidden />}
                    {s.status === "failed" && <X className="size-3.5" aria-hidden />}
                    {s.status === "running" && <span className="size-1.5 rounded-full bg-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{s.title}</span>
                    {s.detail && (
                      <span className={cn("block truncate text-xs text-muted-foreground", s.status === "running" && /\.\w+$/.test(s.detail) && "font-mono")}>
                        {s.detail}
                      </span>
                    )}
                  </span>
                  {s.startedAt && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {fmtTime((s.endedAt ?? now) - s.startedAt)}
                    </span>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ol>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
