import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, net, protocol, safeStorage, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { workspaceApi } from "./workspace";
import { desktopAction, validateAction } from "./desktop";

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

  tray = new Tray(nativeImage.createFromPath(resource("build", "tray.png")).resize({ width: 16, height: 16 }));
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

const wsFile = () => path.join(userData(), "workspace.json");
try {
  const saved = JSON.parse(fs.readFileSync(wsFile(), "utf8")).root;
  if (saved && fs.existsSync(saved)) workspaceRoot = saved;
} catch {
  /* none saved */
}
const ws = workspaceApi(() => workspaceRoot);

ipcMain.handle("ws:choose", async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory", "createDirectory"] });
  if (!r.canceled) {
    workspaceRoot = path.resolve(r.filePaths[0]);
    fs.writeFileSync(wsFile(), JSON.stringify({ root: workspaceRoot }));
  }
  return workspaceRoot;
});
ipcMain.handle("ws:root", () => workspaceRoot);
ipcMain.handle("ws:read", (_e, rel: string) => ws.read(rel));
ipcMain.handle("ws:write", (_e, rel: string, content: string) => ws.write(rel, content));
ipcMain.handle("ws:list", (_e, rel: string) => ws.list(rel));
ipcMain.handle("ws:run", (_e, code: string, lang: string) => ws.run(code, lang));
ipcMain.handle("ws:cmd", (_e, command: string) => ws.cmd(command));

/** Validate the caller and confirm desktop mutations at the privileged boundary. */
ipcMain.handle("desktop:action", async (event, value: unknown) => {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error("Untrusted desktop caller.");
  const action = validateAction(value);
  if (action.action !== "inspect") {
    const result = await dialog.showMessageBox(win, {
      type: "question", title: "Allow computer action?",
      message: "Kernel Axiom wants to control a Windows app",
      detail: JSON.stringify(action, null, 2),
      buttons: ["Cancel", "Allow once"], defaultId: 0, cancelId: 0,
    });
    if (result.response !== 1) return "The user denied this desktop action.";
  }
  return desktopAction(action);
});
