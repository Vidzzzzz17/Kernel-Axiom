import test from "node:test";
import assert from "node:assert/strict";
import { ComputerSession, validateComputerAction } from "./computer-policy.ts";
const id = "12345678-1234-1234-1234-123456789abc";
test("rejects malformed and executable input", () => {
  for (const action of [null, { action: "shell", command: "calc" }, { action: "inspect", windowId: "1; calc" }, { action: "click", snapshotId: id, x: NaN, y: 1, count: 1, button: "left" }, { action: "type", snapshotId: id, text: "x".repeat(1001) }, { action: "type", snapshotId: id, text: "\u0000" }, { action: "key", snapshotId: id, keys: ["CTRL", "{ENTER}"] }, { action: "key", snapshotId: id, keys: ["CTRL"] }, { action: "scroll", snapshotId: id, amount: 11 }]) assert.throws(() => validateComputerAction(action));
});
test("preserves literal user text without turning it into shell source", () => {
  const text = "नमस्ते $HOME $(calc) `quotes`\nhello";
  assert.deepEqual(validateComputerAction({ action: "type", snapshotId: id, text, command: "ignored" }), { action: "type", snapshotId: id, text });
  assert.deepEqual(validateComputerAction({ action: "key", snapshotId: id, keys: ["CTRL", "A"] }), { action: "key", snapshotId: id, keys: ["CTRL", "A"] });
});
test("snapshots are single use and only valid for the observed target", () => {
  const session = new ComputerSession();
  assert.throws(() => session.observe(id, {}));
  session.enable();
  session.observe(id, { windowId: "123" }, 100);
  assert.deepEqual(session.consume(id, 101), { windowId: "123" });
  assert.throws(() => session.consume(id, 102));
});
test("stop, re-enable, mismatched IDs and expiration invalidate snapshots", () => {
  const session = new ComputerSession();
  session.enable(); session.observe(id, {}, 100);
  assert.throws(() => session.consume(id, 120101));
  session.observe(id, {}); session.stop(); session.enable();
  assert.throws(() => session.consume(id));
  session.observe(id, {});
  assert.throws(() => session.consume("different"));
  assert.throws(() => session.consume(id));
});
