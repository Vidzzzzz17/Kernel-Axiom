import Dexie, { type Table } from "dexie";
import { PROVIDER_PRESETS } from "./modelClient";
import type { ChatMessage, MemoryNote, Settings, Task } from "./types";

class KernelDB extends Dexie {
  tasks!: Table<Task, string>;
  messages!: Table<ChatMessage, string>;
  memory!: Table<MemoryNote, string>;
  settings!: Table<Settings, string>;
  constructor() {
    super("kernel-axiom");
    this.version(1).stores({
      tasks: "id, updatedAt",
      messages: "id, taskId, createdAt",
      memory: "id, path, updatedAt",
      settings: "id",
    });
  }
}

export const db = new KernelDB();

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  onboarded: false,
  provider: "opensource",
  baseUrl: PROVIDER_PRESETS.opensource.baseUrl,
  model: PROVIDER_PRESETS.opensource.model,
};

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("settings")) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: "settings" });
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export async function deleteTask(id: string) {
  await db.transaction("rw", [db.tasks, db.messages], async () => {
    await db.messages.where("taskId").equals(id).delete();
    await db.tasks.delete(id);
  });
}

export async function deleteAllChats() {
  await db.transaction("rw", [db.tasks, db.messages], async () => {
    await db.messages.clear();
    await db.tasks.clear();
  });
}

export async function writeMemory(path: string, content: string) {
  const existing = await db.memory.where("path").equals(path).first();
  await db.memory.put({ id: existing?.id ?? uid(), path, content, updatedAt: Date.now() });
}

/** Export everything except API keys (those never live in IndexedDB). */
export async function exportAll() {
  const [tasks, messages, memory, settings] = await Promise.all([
    db.tasks.toArray(),
    db.messages.toArray(),
    db.memory.toArray(),
    db.settings.toArray(),
  ]);
  return { app: "kernel-axiom", version: 1, exportedAt: new Date().toISOString(), tasks, messages, memory, settings };
}

export async function importAll(data: unknown) {
  const d = data as Awaited<ReturnType<typeof exportAll>>;
  if (!d || d.app !== "kernel-axiom") throw new Error("This file is not a Kernel Axiom export.");
  await db.transaction("rw", [db.tasks, db.messages, db.memory, db.settings], async () => {
    await Promise.all([db.tasks.clear(), db.messages.clear(), db.memory.clear(), db.settings.clear()]);
    await db.tasks.bulkPut(d.tasks ?? []);
    await db.messages.bulkPut(d.messages ?? []);
    await db.memory.bulkPut(d.memory ?? []);
    await db.settings.bulkPut(d.settings ?? []);
  });
}
