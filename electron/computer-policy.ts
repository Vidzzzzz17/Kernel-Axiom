export type ComputerAction =
  | { action: "inspect"; windowId?: string }
  | { action: "click"; snapshotId: string; x: number; y: number; button: "left" | "right"; count: number }
  | { action: "type"; snapshotId: string; text: string }
  | { action: "key"; snapshotId: string; keys: string[] }
  | { action: "scroll"; snapshotId: string; amount: number };

const keys = new Set(["CTRL", "ALT", "SHIFT", "WIN", "ENTER", "TAB", "ESC", "BACKSPACE", "DELETE", "SPACE", "UP", "DOWN", "LEFT", "RIGHT", "HOME", "END", "PAGEUP", "PAGEDOWN", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""), ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)]);
export function validateComputerAction(value: unknown): ComputerAction {
  if (!value || typeof value !== "object") throw new Error("Invalid computer action.");
  const a = value as Record<string, unknown>;
  if (a.action === "inspect") {
    if (a.windowId !== undefined && (typeof a.windowId !== "string" || !/^\d{1,16}$/.test(a.windowId))) throw new Error("Invalid window ID.");
    return { action: "inspect", ...(a.windowId ? { windowId: a.windowId as string } : {}) };
  }
  if (typeof a.snapshotId !== "string" || !/^[a-f0-9-]{36}$/.test(a.snapshotId)) throw new Error("Inspect the target app before acting.");
  const snapshotId = a.snapshotId;
  switch (a.action) {
    case "click":
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || Math.abs(a.x as number) > 100000 || Math.abs(a.y as number) > 100000 || !["left", "right"].includes(a.button as string) || ![1, 2].includes(a.count as number)) throw new Error("Invalid click.");
      return { action: "click", snapshotId, x: a.x as number, y: a.y as number, button: a.button as "left" | "right", count: a.count as number };
    case "type":
      if (typeof a.text !== "string" || !a.text.length || a.text.length > 1000 || /[\x00-\x08\x0b-\x1f\x7f]/.test(a.text)) throw new Error("Text must be 1–1000 printable characters (tabs/newlines allowed).");
      return { action: "type", snapshotId, text: a.text };
    case "key": {
      if (!Array.isArray(a.keys) || !a.keys.length || a.keys.length > 4 || !a.keys.every(k => typeof k === "string" && keys.has(k))) throw new Error("Unsupported keyboard shortcut.");
      const combo = a.keys as string[];
      if (new Set(combo).size !== combo.length || combo.filter(k => !["CTRL", "ALT", "SHIFT", "WIN"].includes(k)).length !== 1) throw new Error("Use modifiers and exactly one key.");
      return { action: "key", snapshotId, keys: combo };
    }
    case "scroll":
      if (!Number.isInteger(a.amount) || !a.amount || Math.abs(a.amount as number) > 10) throw new Error("Scroll amount must be between -10 and 10, excluding zero.");
      return { action: "scroll", snapshotId, amount: a.amount as number };
    default: throw new Error("Unsupported computer action.");
  }
}

/** A revoked or expired observation can never authorize a later action. */
export class ComputerSession {
  enabled = false;
  generation = 0;
  private snapshot: { id: string; time: number; target: Record<string, unknown> } | null = null;
  enable() { this.generation++; this.enabled = true; this.snapshot = null; }
  stop() { this.generation++; this.enabled = false; this.snapshot = null; }
  observe(id: string, target: Record<string, unknown>, now = Date.now()) {
    if (!this.enabled) throw new Error("PC control is disabled.");
    this.snapshot = { id, target, time: now };
  }
  consume(id: string, now = Date.now()) {
    const snapshot = this.snapshot;
    this.snapshot = null;
    if (!this.enabled || !snapshot || snapshot.id !== id || now - snapshot.time > 120000) throw new Error("Inspect the app again; the observation is missing, expired or already used.");
    return snapshot.target;
  }
}
