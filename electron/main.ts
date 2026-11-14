import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, net, protocol, safeStorage, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { workspaceApi } from "./workspace";
import { computerApi } from "./computer";
import { proxyApi } from "./api-proxy";

const DEV_URL = process.env.KERNEL_DEV_URL ?? "http://localhost:8080";
const isDev = !app.isPackaged;
const userData = () => app.getPath("userData");
const resource = (...p: string[]) => path.join(app.getAppPath(), ...p);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let workspaceRoot: string | null = null;
const computer = computerApi(path.join(__dirname.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked"), "computer.ps1"), process.pid);
let controlEpoch = 0;
function stopComputer() {
  controlEpoch++;
  const status = computer.stop();
  win?.webContents.send("computer:stopped");
  return status;
}
function trustedUrl(value: string) {
  try {
    const url = new URL(value);
    return isDev ? url.origin === new URL(DEV_URL).origin : url.protocol === "app:" && url.host === "kernel";
  } catch { return false; }
}
function assertSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !trustedUrl(event.senderFrame.url)) throw new Error("Untrusted desktop request.");
}
function openExternal(url: string) {
  if (/^(https?:|mailto:|tel:|sms:|geo:)/i.test(url)) void shell.openExternal(url);
}

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
    stopComputer();
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!trustedUrl(url)) {
      e.preventDefault();
      openExternal(url);
    }
  });
  win.webContents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) stopComputer(); });
  win.webContents.on("render-process-gone", stopComputer);
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
    const url = new URL(req.url);
    if (url.host !== "kernel") return new Response("Not found", { status: 404 });
    if (url.pathname.startsWith("/api/")) return proxyApi(req, process.env.KERNEL_REMOTE_URL || "https://kernel-axiom.vercel.app", net.fetch);
    const rel = decodeURIComponent(new URL(req.url).pathname);
    let file = path.join(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "_shell.html");
    return net.fetch(pathToFileURL(file).toString());
  });

  createWindow();

  tray = new Tray(nativeImage.createFromPath(resource("build", "tray.png")));
  tray.setToolTip("Kernel Axiom");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Kernel Axiom", click: () => showWindow() },
      { label: "Stop PC control", click: () => { stopComputer(); showWindow(); } },
      { type: "separator" },
      { label: "Quit", click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on("click", () => showWindow());

  globalShortcut.register("Control+Space", () => {
    if (win?.isVisible() && win.isFocused()) win.hide();
    else showWindow(true);
  });

  globalShortcut.register("Control+Alt+Escape", () => { stopComputer(); showWindow(); });
  if (!isDev) autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
});

app.on("before-quit", () => { quitting = true; stopComputer(); });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  /* stay in tray */
});

/* ---------- IPC ---------- */
const handle = (channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) =>
  ipcMain.handle(channel, (event, ...args) => { assertSender(event); return listener(event, ...args); });
handle("computer:status", () => computer.status());
handle("computer:enable", async () => {
  if (!globalShortcut.isRegistered("Control+Alt+Escape")) throw new Error("Ctrl+Alt+Escape is unavailable. Close the app using that shortcut and restart Axiom.");
  const epoch = controlEpoch;
  const answer = await dialog.showMessageBox(win!, {
    type: "question", buttons: ["Cancel", "Enable for this session"], defaultId: 0, cancelId: 0,
    title: "Enable PC control?",
    message: "Allow Kernel Axiom to inspect and control Windows apps?",
    detail: "Visible app text can be sent to your selected AI provider after approval. Clicks, typing and shortcuts ask first. Press Ctrl+Alt+Escape to stop. Access resets when you close or reload Axiom.",
  });
  if (answer.response !== 1 || epoch !== controlEpoch) return computer.status();
  return computer.enable();
});
handle("computer:stop", () => stopComputer());
handle("computer:execute", async (_event, action: unknown) => {
  if (!computer.status().enabled) throw new Error("Enable PC control first.");
  if (computer.status().busy) throw new Error("A computer action is already running.");
  const visible = !!win?.isVisible();
  win?.hide();
  try { return await computer.execute(action); }
  finally { if (visible && !quitting) showWindow(); }
});
ipcMain.on("win:minimize", (e) => { assertSender(e); win?.minimize(); });
ipcMain.on("win:toggle-maximize", (e) => { assertSender(e); win?.isMaximized() ? win.unmaximize() : win?.maximize(); });
ipcMain.on("win:close", (e) => { assertSender(e); win?.close(); });

handle("secrets:get", (_e, name: string) => {
  const enc = readSecrets()[name];
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(enc, "base64"));
});
handle("secrets:set", (_e, name: string, value: string) => {
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

handle("ws:choose", async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory", "createDirectory"] });
  if (!r.canceled) {
    workspaceRoot = path.resolve(r.filePaths[0]);
    fs.writeFileSync(wsFile(), JSON.stringify({ root: workspaceRoot }));
  }
  return workspaceRoot;
});
handle("ws:root", () => workspaceRoot);
handle("ws:read", (_e, rel: string) => ws.read(rel));
handle("ws:write", (_e, rel: string, content: string) => ws.write(rel, content));
handle("ws:list", (_e, rel: string) => ws.list(rel));
handle("ws:run", (_e, code: string, lang: string) => ws.run(code, lang));
handle("ws:cmd", (_e, command: string) => ws.cmd(command));

