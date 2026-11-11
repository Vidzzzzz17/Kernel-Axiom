import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const norm = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
const inside = (root: string, full: string) => {
  const r = norm(root), f = norm(full);
  return f === r || f.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
};

/** Resolve a path and refuse anything outside the workspace, including via symlinks/junctions. */
export function resolveInWorkspace(root: string | null, rel: string) {
  if (!root) throw new Error("Choose a workspace folder first.");
  if (typeof rel !== "string") throw new Error("Invalid path.");
  const realRoot = fs.realpathSync.native(root);
  const full = path.resolve(realRoot, rel || ".");
  if (!inside(realRoot, full)) throw new Error("Path is outside the workspace.");
  // Walk up to the nearest existing ancestor and check its real location.
  let probe = full;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  if (!inside(realRoot, fs.realpathSync.native(probe))) throw new Error("Path is outside the workspace.");
  return full;
}

export type RunResult = { stdout: string; stderr: string; code: number };
export function runProcess(cmd: string, args: string[] | null, cwd: string, timeout: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = args ? spawn(cmd, args, { cwd, timeout, windowsHide: true }) : spawn(cmd, { cwd, shell: true, timeout, windowsHide: true });
    let stdout = "", stderr = "";
    p.stdout?.on("data", (d) => (stdout += d));
    p.stderr?.on("data", (d) => (stderr += d));
    p.on("close", (c) => resolve({ stdout: stdout.slice(-20000), stderr: stderr.slice(-8000), code: c ?? -1 }));
    p.on("error", (err) => resolve({ stdout, stderr: String(err), code: -1 }));
  });
}

export const workspaceApi = (getRoot: () => string | null) => ({
  read: (rel: string) => fs.promises.readFile(resolveInWorkspace(getRoot(), rel), "utf8"),
  write: async (rel: string, content: string) => {
    const full = resolveInWorkspace(getRoot(), rel);
    if (full === resolveInWorkspace(getRoot(), ".")) throw new Error("Give a file name.");
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, String(content ?? ""), "utf8");
  },
  list: async (rel: string) => {
    const entries = await fs.promises.readdir(resolveInWorkspace(getRoot(), rel || "."), { withFileTypes: true });
    return entries.slice(0, 500).map((d) => ({ name: d.name, dir: d.isDirectory() }));
  },
  run: (code: string, lang: string) => {
    const py = /py/i.test(lang);
    const cmd = py ? (process.platform === "win32" ? "python" : "python3") : process.execPath;
    const env = py ? undefined : "node";
    void env;
    return runProcess(cmd, [py ? "-c" : "-e", code], resolveInWorkspace(getRoot(), "."), 60_000);
  },
  cmd: (command: string) => runProcess(command, null, resolveInWorkspace(getRoot(), "."), 120_000),
});
