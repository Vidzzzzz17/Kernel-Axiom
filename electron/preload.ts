import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kernel", {
  secrets: {
    get: (name: string) => ipcRenderer.invoke("secrets:get", name),
    set: (name: string, value: string) => ipcRenderer.invoke("secrets:set", name, value),
  },
  window: {
    minimize: () => ipcRenderer.send("win:minimize"),
    toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
    close: () => ipcRenderer.send("win:close"),
  },
  workspace: {
    choose: () => ipcRenderer.invoke("ws:choose"),
    readFile: (rel: string) => ipcRenderer.invoke("ws:read", rel),
    writeFile: (rel: string, content: string) => ipcRenderer.invoke("ws:write", rel, content),
    runCode: (code: string, lang: string) => ipcRenderer.invoke("ws:run", code, lang),
  },
  onFocusCommandBar: (cb: () => void) => {
    ipcRenderer.on("kernel:focus-command-bar", () => cb());
  },
});
