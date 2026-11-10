/**
 * Bridge to the Electron preload (window.kernel). In the browser everything
 * falls back: secrets live in memory only, tools run against local IndexedDB.
 */
export interface KernelBridge {
  secrets: { get(name: string): Promise<string | null>; set(name: string, value: string): Promise<void> };
  window?: { minimize(): void; toggleMaximize(): void; close(): void };
  workspace?: {
    choose(): Promise<string | null>;
    readFile(rel: string): Promise<string>;
    writeFile(rel: string, content: string): Promise<void>;
    runCode(code: string, lang: string): Promise<{ stdout: string; stderr: string; code: number }>;
  };
  onFocusCommandBar?(cb: () => void): void;
}

declare global {
  interface Window {
    kernel?: KernelBridge;
  }
}

const memory = new Map<string, string>();

export const isDesktop = () => typeof window !== "undefined" && !!window.kernel;

export const secrets = {
  async get(name: string) {
    if (typeof window !== "undefined" && window.kernel) return window.kernel.secrets.get(name);
    return memory.get(name) ?? null;
  },
  async set(name: string, value: string) {
    if (typeof window !== "undefined" && window.kernel) return window.kernel.secrets.set(name, value);
    memory.set(name, value);
  },
};
