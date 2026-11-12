import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveInWorkspace, workspaceApi } from "./workspace";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-ws-"));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-out-"));
const ws = workspaceApi(() => root);
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });

describe("desktop safe folder", () => {
  it("writes, lists and reads files inside the folder", async () => {
    await ws.write("notes/a.txt", "hello");
    expect(await ws.read("notes/a.txt")).toBe("hello");
    expect(await ws.list("notes")).toEqual([{ name: "a.txt", dir: false }]);
  });
  it("refuses paths that climb out of the folder", async () => {
    await expect(ws.write("../escape.txt", "x")).rejects.toThrow(/outside/);
    expect(() => resolveInWorkspace(root, path.join(outside, "x"))).toThrow(/outside/);
  });
  it("refuses links that point outside the folder", async () => {
    fs.symlinkSync(outside, path.join(root, "link"), "junction");
    await expect(ws.write("link/x.txt", "x")).rejects.toThrow(/outside/);
    expect(fs.existsSync(path.join(outside, "x.txt"))).toBe(false);
  });
  it("refuses everything until a folder is chosen", () => {
    expect(() => resolveInWorkspace(null, "a")).toThrow(/Choose a workspace/);
  });
  it("runs JavaScript and shell commands inside the folder", async () => {
    const r = await ws.run("console.log(process.cwd())", "javascript");
    expect(fs.realpathSync.native(r.stdout.trim())).toBe(fs.realpathSync.native(root));
    const c = await ws.cmd("echo hi");
    expect(c.stdout.trim()).toBe("hi");
  });
});
