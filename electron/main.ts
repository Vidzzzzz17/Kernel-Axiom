import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, net, protocol, safeStorage, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEV_URL = process.env.KERNEL_DEV_URL ?? "http://localhost:8080";
const isDev = !app.isPackaged;
const userData = () => app.getPath("userData");
const resource = (...p: string[]) => path.join(app.getAppPath(), ...p);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let workspaceRoot: string | null = null;

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showWindow());

/* ---------- window state ---------- */
type Bounds = { x?: number; y?: number; width: number; height: number; maximized?: boolean };
const stateFile = () => path.join(userData(), "window-state.json");
const loadBounds = (): Bounds => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return { width: 1280, height: 820 };
  }
};
const saveBounds = () => {
  if (!win) return;
  fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
};

/* ---------- secrets (safeStorage) ---------- */
const secretsFile = () => path.join(userData(), "secrets.json");
const readSecrets = (): Record<string, string> => {
  try {
    return JSON.parse(fs.readFileSync(secretsFile(), "utf8"));
  } catch {
    return {};
  }
};

function createWindow() {
  const b = loadBounds();
  win = new BrowserWindow({
    ...b,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: "#FFFFFF",
    icon: resource("build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (b.maximized) win.maximize();
  win.once("ready-to-show", () => win?.show());
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(DEV_URL) && !url.startsWith("app://")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadURL(isDev ? DEV_URL : "app://kernel/");
}

function showWindow(focusBar = false) {
  if (!win) return createWindow();
  win.show();
  win.focus();
  if (focusBar) win.webContents.send("kernel:focus-command-bar");
}

app.whenReady().then(() => {
  // Serve the built SPA from dist/client; unknown paths fall back to the shell.
  const root = resource("dist", "client");
  protocol.handle("app", (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    let file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "_shell.html");
    return net.fetch(pathToFileURL(file).toString());
  });

  createWindow();

  tray = new Tray(nativeImage.createFromPath(resource("build", "tray.png")));
  tray.setToolTip("Kernel Axiom");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Kernel Axiom", click: () => showWindow() },
      { type: "separator" },
      { label: "Quit", click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on("click", () => showWindow());

  globalShortcut.register("Control+Space", () => {
    if (win?.isVisible() && win.isFocused()) win.hide();
    else showWindow(true);
  });

  if (!isDev) autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
});

app.on("before-quit", () => (quitting = true));
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  /* stay in tray */
});

/* ---------- IPC ---------- */
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:toggle-maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());

ipcMain.handle("secrets:get", (_e, name: string) => {
  const enc = readSecrets()[name];
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(enc, "base64"));
});
ipcMain.handle("secrets:set", (_e, name: string, value: string) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("System encryption is unavailable.");
  const all = readSecrets();
  all[name] = safeStorage.encryptString(value).toString("base64");
  fs.writeFileSync(secretsFile(), JSON.stringify(all));
});

/** Resolve a path and refuse anything outside the user-chosen workspace folder. */
function inWorkspace(rel: string) {
  if (!workspaceRoot) throw new Error("Choose a workspace folder first.");
  const full = path.resolve(workspaceRoot, rel);
  if (full !== workspaceRoot && !full.startsWith(workspaceRoot + path.sep)) throw new Error("Path is outside the workspace.");
  return full;
}

ipcMain.handle("ws:choose", async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory", "createDirectory"] });
  workspaceRoot = r.canceled ? workspaceRoot : path.resolve(r.filePaths[0]);
  return workspaceRoot;
});
ipcMain.handle("ws:read", (_e, rel: string) => fs.promises.readFile(inWorkspace(rel), "utf8"));
ipcMain.handle("ws:write", async (_e, rel: string, content: string) => {
  const full = inWorkspace(rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, content, "utf8");
});
ipcMain.handle("ws:run", (_e, code: string, lang: string) => {
  const cwd = inWorkspace(".");
  const cmd = /py/i.test(lang) ? (process.platform === "win32" ? "python" : "python3") : "node";
  const flag = cmd === "node" ? "-e" : "-c";
  return new Promise((resolve) => {
    const p = spawn(cmd, [flag, code], { cwd, timeout: 60_000, windowsHide: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (c) => resolve({ stdout, stderr, code: c ?? -1 }));
    p.on("error", (err) => resolve({ stdout, stderr: String(err), code: -1 }));
  });
});

ipcMain.handle("ws:root", () => workspaceRoot);
ipcMain.handle("ws:list", async (_e, rel: string) => {
  const entries = await fs.promises.readdir(inWorkspace(rel || "."), { withFileTypes: true });
  return entries.slice(0, 500).map((d) => ({ name: d.name, dir: d.isDirectory() }));
});
ipcMain.handle("ws:cmd", (_e, command: string) => {
  const cwd = inWorkspace(".");
  return new Promise((resolve) => {
    const p = spawn(command, { cwd, shell: true, timeout: 120_000, windowsHide: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (c) => resolve({ stdout: stdout.slice(-20000), stderr: stderr.slice(-8000), code: c ?? -1 }));
    p.on("error", (err) => resolve({ stdout, stderr: String(err), code: -1 }));
  });
});
