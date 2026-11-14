import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../lib/kernel/agent";
import type { Settings } from "../lib/kernel/types";

const mocks = vi.hoisted(() => ({ streamChat: vi.fn(), execute: vi.fn(), stop: vi.fn(), status: vi.fn() }));
vi.mock("../lib/kernel/modelClient", () => ({ streamChat: mocks.streamChat, resolveBase: (s: string) => s }));
vi.mock("../lib/kernel/db", () => ({
  uid: () => "test-id", writeMemory: vi.fn(),
  db: { memory: { where: () => ({ startsWith: () => ({ toArray: async () => [] }) }) } },
}));
vi.mock("../lib/kernel/bridge", () => ({ isDesktop: () => true }));
const settings: Settings = { id: "settings", onboarded: true, provider: "openai", baseUrl: "https://example.invalid/v1", model: "test" };
const call = { id: "call-1", type: "function", function: { name: "computer_inspect", arguments: JSON.stringify({ windowId: "123" }) } };
function input(signal = new AbortController().signal, requestApproval = vi.fn(async () => true)) {
  return { settings, signal, requestApproval, prompt: "Inspect Notepad", history: [], emit: vi.fn(), takeSteer: () => [] };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue({ supported: true, enabled: true, busy: false });
  mocks.stop.mockResolvedValue({ supported: true, enabled: false, busy: false });
  mocks.execute.mockResolvedValue({ target: { title: "Notepad" }, controls: [] });
  mocks.streamChat.mockReset().mockResolvedValueOnce({ text: "", toolCalls: [call] }).mockResolvedValue({ text: "Finished", toolCalls: [] });
  Object.defineProperty(window, "kernel", { configurable: true, value: { workspace: {}, computer: { status: mocks.status, stop: mocks.stop, execute: mocks.execute } } });
});
describe("computer tool approval boundaries", () => {
  it("does not inspect when permission is denied", async () => {
    const request = input(undefined, vi.fn(async () => false));
    await runAgent(request);
    expect(request.requestApproval).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("checks abort again after approval and revokes native access", async () => {
    const controller = new AbortController();
    const request = input(controller.signal, vi.fn(async () => { controller.abort(); return true; }));
    await expect(runAgent(request)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("executes an approved inspection and returns results to the model", async () => {
    await runAgent(input());
    expect(mocks.execute).toHaveBeenCalledWith({ action: "inspect", windowId: "123" });
    expect(mocks.streamChat.mock.calls[1]![0].messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: "tool", content: expect.stringContaining("Notepad") })]));
  });
  it("does not offer or execute computer tools when control is disabled", async () => {
    mocks.status.mockResolvedValue({ supported: true, enabled: false, busy: false });
    await runAgent(input());
    expect(mocks.streamChat.mock.calls[0]![0].tools.some((t: { function: { name: string } }) => t.function.name.startsWith("computer_"))).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
