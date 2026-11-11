// Cross-platform helper for the desktop app.
//   node scripts/electron.mjs compile   -> bundle electron/*.ts into dist-electron/*.cjs
//   node scripts/electron.mjs dev       -> compile, then launch Electron against the running dev server
//   node scripts/electron.mjs build     -> SPA web build + compile + electron-builder (win x64)
import { build } from "esbuild";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] ?? "compile";
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
});

if (mode === "dev") run("npx", ["electron", "."]);
if (mode === "build") {
  run("npx", ["vite", "build"], { KERNEL_ELECTRON: "1" });
  run("npx", ["electron-builder", "--win", "--x64", "--publish", process.env.CI ? "always" : "never"]);
}
