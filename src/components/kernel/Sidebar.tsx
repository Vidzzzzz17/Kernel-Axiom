import { AnimatePresence, motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { Download, Plus, Settings as Cog, Trash2 } from "lucide-react";
import type { Task } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";
import { Orb } from "./Orb";
import { KButton } from "./ui";

export function Sidebar({
  tasks,
  activeId,
  onSelect,
  onNew,
  onSettings,
  onDelete,
}: {
  tasks: Task[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
  onDelete: (id: string) => void;
}) {
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const today = tasks.filter((t) => t.updatedAt >= startOfDay);
  const earlier = tasks.filter((t) => t.updatedAt < startOfDay);
  const group = (label: string, list: Task[]) =>
    list.length > 0 && (
      <div className="mt-5">
        <p className="label-mono px-2 text-muted-foreground">{label}</p>
        <ul className="mt-2 space-y-0.5">
          <AnimatePresence initial={false}>
          {list.map((t) => (
            <motion.li
              key={t.id}
              layout
              exit={{ opacity: 0, x: -12 }}
              className={cn("group flex items-center rounded-xl transition-colors hover:bg-foreground/5", t.id === activeId && "bg-foreground/5")}
            >
              <button
                onClick={() => onSelect(t.id)}
                aria-current={t.id === activeId}
                className="min-h-11 min-w-0 flex-1 truncate px-2 text-left text-sm"
              >
                {t.title}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${t.title}"? This can't be undone.`)) onDelete(t.id);
                }}
                aria-label={`Delete ${t.title}`}
                className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground opacity-100 transition-opacity hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </motion.li>
          ))}
          </AnimatePresence>
        </ul>
      </div>
    );
  return (
    <aside className="glass flex h-full w-64 flex-col rounded-3xl p-3">
      <button onClick={onNew} className="flex min-h-11 items-center gap-2.5 px-2 text-xl tracking-tight">
        <Orb size={24} state="idle" />
        Kernel Axiom
      </button>
      <KButton onClick={onNew} className="mt-3 justify-start rounded-xl">
        <Plus className="size-4" aria-hidden /> New task
      </KButton>
      <nav className="-mx-1 flex-1 overflow-y-auto px-1" aria-label="Tasks">
        {group("Today", today)}
        {group("Earlier", earlier)}
        {tasks.length === 0 && <p className="mt-6 px-2 text-sm text-muted-foreground">No tasks yet.</p>}
      </nav>
      <Link to="/download" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm hover:bg-foreground/5">
        <Download className="size-4" aria-hidden /> Download
      </Link>
      <KButton variant="ghost" onClick={onSettings} className="justify-start rounded-xl">
        <Cog className="size-4" aria-hidden /> Settings
      </KButton>
    </aside>
  );
}
