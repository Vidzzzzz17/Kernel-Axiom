import { AnimatePresence, motion } from "motion/react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import type { MemoryNote, Task } from "@/lib/kernel/types";
import { spring } from "./ui";

const itemCls =
  "flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl px-3 text-sm data-[selected=true]:bg-foreground/[0.06]";
const groupCls =
  "[&_[cmdk-group-heading]]:label-mono [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-muted-foreground";

export function CommandPalette({
  open,
  onOpenChange,
  tasks,
  notes,
  onTask,
  onAction,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tasks: Task[];
  notes: MemoryNote[];
  onTask: (id: string) => void;
  onAction: (a: "new" | "settings" | "voice" | "workspace" | "memory") => void;
}) {
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-start justify-center bg-background/40 px-4 pt-[14vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onOpenChange(false)}
        >
          <motion.div
            initial={{ y: 16, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 8, scale: 0.98, opacity: 0 }}
            transition={spring}
            className="glass w-full max-w-lg overflow-hidden rounded-3xl"
            role="dialog"
            aria-label="Command palette"
          >
            <Command loop onKeyDown={(e) => e.key === "Escape" && onOpenChange(false)}>
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="size-4" aria-hidden />
                <Command.Input
                  autoFocus
                  placeholder="Search tasks, tools, memory"
                  className="min-h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground focus-visible:outline-none"
                />
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                <Command.Empty className="p-4 text-sm text-muted-foreground">Nothing found.</Command.Empty>
                <Command.Group heading="Tasks" className={groupCls}>
                  <Command.Item className={itemCls} onSelect={() => run(() => onAction("new"))}>
                    New task <span className="label-mono text-muted-foreground">Action</span>
                  </Command.Item>
                  {tasks.slice(0, 6).map((t) => (
                    <Command.Item key={t.id} value={`task ${t.title} ${t.id}`} className={itemCls} onSelect={() => run(() => onTask(t.id))}>
                      <span className="truncate">{t.title}</span>
                      <span className="label-mono text-muted-foreground">{t.updatedAt >= startOfDay ? "Today" : "Earlier"}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Tools" className={groupCls}>
                  <Command.Item className={itemCls} onSelect={() => run(() => onAction("workspace"))}>
                    Web browser <span className="label-mono text-muted-foreground">Enabled</span>
                  </Command.Item>
                  <Command.Item className={itemCls} onSelect={() => run(() => onAction("workspace"))}>
                    Code sandbox <span className="label-mono text-muted-foreground">Asks first</span>
                  </Command.Item>
                  <Command.Item className={itemCls} onSelect={() => run(() => onAction("voice"))}>
                    Voice mode <span className="label-mono text-muted-foreground">Open</span>
                  </Command.Item>
                  <Command.Item className={itemCls} onSelect={() => run(() => onAction("settings"))}>
                    Settings <span className="label-mono text-muted-foreground">Open</span>
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="Memory" className={groupCls}>
                  {notes.length === 0 && (
                    <Command.Item className={itemCls} onSelect={() => run(() => onAction("memory"))}>
                      Notes <span className="label-mono text-muted-foreground">Empty</span>
                    </Command.Item>
                  )}
                  {notes.slice(0, 5).map((n) => (
                    <Command.Item key={n.id} value={`memory ${n.path}`} className={itemCls} onSelect={() => run(() => onAction("memory"))}>
                      <span className="truncate font-mono text-xs">{n.path}</span>
                      <span className="label-mono text-muted-foreground">Open</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
              <div className="label-mono flex gap-5 border-t border-border px-4 py-3 text-muted-foreground">
                <span>↑↓ Navigate</span>
                <span>↵ Open</span>
                <span>Esc Close</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
