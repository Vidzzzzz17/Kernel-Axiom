import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Brain, Download, FileText, Mic, Monitor, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Settings as Cog, Sparkles, Trash2, Database } from "lucide-react";
import type { Task } from "@/lib/kernel/types";
import { filterTasks } from "@/lib/kernel/library";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Orb } from "./Orb";
import { IconButton, KButton } from "./ui";

export type SidebarAction = "notes" | "prompts" | "memory" | "voice" | "computer" | "data";
export function Sidebar({ tasks, activeId, onSelect, onNew, onSettings, onDelete, onPin, onRename, onAction, library, noteCount }: {
  tasks: Task[]; activeId: string | null; onSelect: (id: string) => void; onNew: () => void;
  onSettings: () => void; onDelete: (id: string) => void; onPin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void; onAction: (action: SidebarAction) => void;
  library: "notes" | "prompts" | null; noteCount: number;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const filtered = filterTasks(tasks, query);
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const group = (label: string, list: Task[]) => list.length > 0 && (
    <div className="mt-4">
      <p className="label-mono px-2 text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {list.map(t => <li key={t.id} className={cn("group flex items-center rounded-xl hover:bg-foreground/5", t.id === activeId && !library && "bg-foreground/5")}>
          <KButton variant="ghost" onClick={() => onSelect(t.id)} className="min-w-0 flex-1 justify-start gap-2 rounded-xl px-2" aria-current={t.id === activeId && !library ? "page" : undefined}>
            {t.pinned && <Pin className="size-3 shrink-0" aria-hidden />}<span className="truncate">{t.title}</span>
          </KButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><IconButton label={`Options for ${t.title}`} className="shrink-0"><MoreHorizontal className="size-4" /></IconButton></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11" onSelect={() => onPin(t.id, !t.pinned)}>{t.pinned ? <PinOff /> : <Pin />}{t.pinned ? "Unpin" : "Pin conversation"}</DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => { setEditing(t); setTitle(t.title); }}><Pencil />Rename</DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => { if (confirm(`Delete "${t.title}"? This can't be undone.`)) onDelete(t.id); }}><Trash2 />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>)}
      </ul>
    </div>
  );
  return <aside className="glass flex h-full w-64 flex-col rounded-3xl p-3">
    <KButton variant="ghost" onClick={onNew} className="justify-start gap-2.5 px-2 text-xl"><Orb size={24} state="looking" follow />Kernel Axiom</KButton>
    <KButton variant="primary" onClick={onNew} className="mt-3 shrink-0 justify-start rounded-xl"><Plus className="size-4" />New task</KButton>
    <div className="mt-3 flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border px-3">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden /><input aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={e => setQuery(e.target.value)} className="w-full min-w-0 bg-transparent text-sm outline-none" />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <nav aria-label="Tools" className="mt-3 space-y-0.5">
        {([{ id: "prompts", label: "Task prompts", icon: Sparkles }, { id: "notes", label: "Notes", icon: FileText }, { id: "memory", label: "Memory", icon: Brain }, { id: "voice", label: "Voice", icon: Mic }, { id: "computer", label: "Computer", icon: Monitor }] as const).map(item => <KButton key={item.id} variant="ghost" onClick={() => onAction(item.id)} aria-current={library === item.id ? "page" : undefined} className={cn("w-full justify-start rounded-xl px-2", library === item.id && "bg-foreground/5")}><item.icon className="size-4" />{item.label}{item.id === "notes" && <span className="ml-auto font-mono text-xs text-muted-foreground">{noteCount}</span>}</KButton>)}
      </nav>
      <nav aria-label="Conversations" className="mt-3 border-t border-border pb-3">
        {group("Pinned", filtered.filter(t => t.pinned))}
        {group("Today", filtered.filter(t => !t.pinned && t.updatedAt >= startOfDay))}
        {group("Earlier", filtered.filter(t => !t.pinned && t.updatedAt < startOfDay))}
        {!filtered.length && <p className="px-2 py-5 text-sm text-muted-foreground">{query ? "No conversations found." : "No tasks yet."}</p>}
      </nav>
    </div>
    <div className="shrink-0 border-t border-border pt-2">
      <KButton variant="ghost" onClick={() => onAction("data")} className="w-full justify-start rounded-xl px-2"><Database className="size-4" />Backup & restore</KButton>
      <Link to="/download" className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm hover:bg-foreground/5"><Download className="size-4" />Download</Link>
      <KButton variant="ghost" onClick={onSettings} className="w-full justify-start rounded-xl px-2"><Cog className="size-4" />Settings</KButton>
    </div>
    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
      <DialogContent aria-describedby={undefined} className="max-w-[min(28rem,calc(100vw-2rem))] rounded-2xl">
        <DialogTitle className="font-normal tracking-normal">Rename conversation</DialogTitle>
        <form onSubmit={e => { e.preventDefault(); if (!editing || !title.trim()) return; onRename(editing.id, title.trim()); setEditing(null); }} className="space-y-4">
          <input autoFocus aria-label="Conversation name" value={title} onChange={e => setTitle(e.target.value)} className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3" />
          <KButton type="submit" variant="primary" disabled={!title.trim()}>Save</KButton>
        </form>
      </DialogContent>
    </Dialog>
  </aside>;
}
