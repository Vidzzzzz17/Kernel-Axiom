import { motion } from "motion/react";
import { Plus, Settings as Cog } from "lucide-react";
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
}: {
  tasks: Task[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
}) {
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const today = tasks.filter((t) => t.updatedAt >= startOfDay);
  const earlier = tasks.filter((t) => t.updatedAt < startOfDay);
  const group = (label: string, list: Task[]) =>
    list.length > 0 && (
      <div className="mt-5">
        <p className="label-mono px-2 text-muted-foreground">{label}</p>
        <ul className="mt-2 space-y-0.5">
          {list.map((t) => (
            <motion.li key={t.id} layout>
              <button
                onClick={() => onSelect(t.id)}
                aria-current={t.id === activeId}
                className={cn(
                  "min-h-11 w-full truncate rounded-xl px-2 text-left text-sm transition-colors hover:bg-foreground/5",
                  t.id === activeId && "bg-foreground/5",
                )}
              >
                {t.title}
              </button>
            </motion.li>
          ))}
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
      <KButton variant="ghost" onClick={onSettings} className="justify-start rounded-xl">
        <Cog className="size-4" aria-hidden /> Settings
      </KButton>
    </aside>
  );
}
