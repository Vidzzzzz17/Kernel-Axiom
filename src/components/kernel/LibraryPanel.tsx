import { useState } from "react";
import { FileText, Plus, Search, Trash2, X, ArrowUpRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid } from "@/lib/kernel/db";
import { PROMPT_PREFIX, TASK_TEMPLATES } from "@/lib/kernel/library";
import type { MemoryNote } from "@/lib/kernel/types";
import { IconButton, KButton } from "./ui";

export function LibraryPanel({ kind, onClose, onUse }: { kind: "notes" | "prompts"; onClose: () => void; onUse: (text: string) => void }) {
  const rows = useLiveQuery(() => db.memory.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string; content: string } | null>(null);
  const [error, setError] = useState("");
  const prompts = kind === "prompts";
  const notes = rows.filter(n => n.path.startsWith(PROMPT_PREFIX) === prompts && `${n.path} ${n.content}`.toLowerCase().includes(query.toLowerCase()));
  const edit = (note?: MemoryNote) => { setError(""); setEditing({ id: note?.id ?? uid(), title: note ? note.path.replace(prompts ? PROMPT_PREFIX : /^notes\//, "") : "", content: note?.content ?? "" }); };
  return <section className="flex min-h-0 flex-1 flex-col" aria-label={prompts ? "Task prompts" : "Notes"}>
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-4">
      <h2 className="mr-auto text-2xl">{prompts ? "Task prompts" : "Notes"}</h2>
      <KButton variant="primary" onClick={() => edit()}><Plus className="size-4" />{prompts ? "New prompt" : "New note"}</KButton>
      <IconButton label="Close library" onClick={onClose}><X className="size-4" /></IconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      {editing ? <form className="mx-auto max-w-2xl space-y-4" onSubmit={async e => {
        e.preventDefault();
        const path = `${prompts ? PROMPT_PREFIX : "notes/"}${editing.title.trim()}`;
        try {
          const existing = await db.memory.where("path").equals(path).first();
          if (existing && existing.id !== editing.id) { setError("That name is already in use."); return; }
          await db.memory.put({ id: editing.id, path, content: editing.content.trim(), updatedAt: Date.now() }); setEditing(null);
        } catch { setError("Couldn't save. Please try again."); }
      }}>
        <label className="block text-sm">Name<input autoFocus required value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3" /></label>
        <label className="block text-sm">{prompts ? "Prompt" : "Note"}<textarea required rows={12} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} className="mt-2 w-full resize-y rounded-lg border border-input bg-background p-3" /></label>
        {error && <p role="alert" className="text-sm">{error}</p>}
        <div className="flex gap-2"><KButton variant="primary" type="submit" disabled={!editing.title.trim() || !editing.content.trim()}>Save</KButton><KButton type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</KButton></div>
      </form> : <>
        <div className="mb-6 flex max-w-lg items-center gap-2 border-b border-border pb-2"><Search className="size-4 text-muted-foreground" /><input aria-label={prompts ? "Search prompts" : "Search notes"} placeholder={prompts ? "Search prompts" : "Search notes"} value={query} onChange={e => setQuery(e.target.value)} className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none" /></div>
        {prompts && <><p className="label-mono mb-3 text-muted-foreground">Ready to start</p><ul className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{TASK_TEMPLATES.filter(t => `${t.title} ${t.prompt}`.toLowerCase().includes(query.toLowerCase())).map(t => <li key={t.title} className="flex flex-col rounded-lg border border-border p-4"><h3 className="text-lg">{t.title}</h3><p className="mt-3 flex-1 text-sm text-muted-foreground">{t.prompt}</p><KButton variant="ghost" className="mt-3 self-start px-0" onClick={() => onUse(t.prompt)}>Use prompt<ArrowUpRight className="size-4" /></KButton></li>)}</ul><p className="label-mono mb-3 text-muted-foreground">Your prompts</p></>}
        {!notes.length && <div className="py-8 text-center text-muted-foreground"><FileText className="mx-auto mb-3 size-6" /><p className="text-sm">{query ? "No matches found." : prompts ? "No saved prompts yet." : "No notes yet."}</p></div>}
        <ul className="divide-y divide-border">{notes.map(n => <li key={n.id} className="py-4">
          <div className="flex items-center gap-2"><KButton variant="ghost" onClick={() => edit(n)} className="min-w-0 flex-1 justify-start px-0 text-base"><span className="truncate">{n.path.replace(prompts ? PROMPT_PREFIX : /^notes\//, "")}</span></KButton><IconButton label={`Delete ${n.path}`} onClick={async () => { if (confirm(`Delete "${n.path}"?`)) await db.memory.delete(n.id); }}><Trash2 className="size-4" /></IconButton></div>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{n.content}</p>
          <KButton variant="ghost" className="mt-2 px-0" onClick={() => onUse(prompts ? n.content : `Use this note as context:\n\n${n.path}\n${n.content}\n\nMy request: `)}>{prompts ? "Use prompt" : "Ask about note"}<ArrowUpRight className="size-4" /></KButton>
        </li>)}</ul>
      </>}
    </div>
  </section>;
}
