import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ComputerSession, validateComputerAction } from "./computer-policy";

export function computerApi(scriptPath: string, ownPid: number) {
  const session = new ComputerSession();
  let child: ChildProcessWithoutNullStreams | null = null;
  const status = () => ({ supported: process.platform === "win32", enabled: session.enabled, busy: !!child });
  const stop = () => { session.stop(); child?.kill(); return status(); };
  return {
    status,
    enable() {
      if (process.platform !== "win32") throw new Error("PC control currently requires Windows.");
      if (child) throw new Error("Wait for the previous action to stop.");
      session.enable();
      return status();
    },
    stop,
    async execute(value: unknown) {
      if (!session.enabled) throw new Error("Enable PC control in the setup modal first.");
      if (child) throw new Error("Another computer action is still running.");
      const action = validateComputerAction(value);
      const generation = session.generation;
      const target = action.action === "inspect" ? undefined : session.consume(action.snapshotId);
      const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        // Arguments are fixed; all user/model data travels as JSON on stdin, never shell source.
        const proc = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { windowsHide: true, stdio: "pipe" });
        child = proc;
        let stdout = "", stderr = "";
        const timer = setTimeout(() => { proc.kill(); }, 20000);
        proc.stdout.setEncoding("utf8").on("data", (data: string) => {
          stdout += data;
          if (stdout.length > 1000000) proc.kill();
        });
        proc.stderr.setEncoding("utf8").on("data", (data: string) => { stderr = (stderr + data).slice(-4000); });
        proc.on("error", reject);
        proc.stdin.on("error", () => undefined);
        proc.on("close", (code) => {
          clearTimeout(timer);
          if (child === proc) child = null;
          if (generation !== session.generation) return reject(new Error("PC control stopped."));
          if (code !== 0) return reject(new Error(stderr.trim() || "Computer action timed out or failed."));
          try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error("Invalid response from Windows automation.")); }
        });
        proc.stdin.end(JSON.stringify({ ...action, target, ownPid }));
      });
      if (generation !== session.generation || !session.enabled) throw new Error("PC control stopped.");
      if (action.action === "inspect" && result.target) {
        const snapshotId = randomUUID();
        session.observe(snapshotId, result.target as Record<string, unknown>);
        return { ...result, snapshotId };
      }
      return result;
    },
  };
}
