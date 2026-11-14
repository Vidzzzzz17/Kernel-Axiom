import test from "node:test";
import assert from "node:assert/strict";
import { proxyApi } from "./api-proxy.ts";
const remote = "https://kernel-axiom.vercel.app";
test("streams an approved route without forwarding browser credentials", async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, remote + "/api/kernel/chat/completions");
    assert.equal(init?.credentials, "omit");
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    assert.equal(new Headers(init?.headers).has("Cookie"), false);
    assert.equal(new Headers(init?.headers).has("Origin"), false);
    assert.equal(new TextDecoder().decode(init?.body as ArrayBuffer), '{"messages":[]}');
    return new Response("data: hello\n\n", { headers: { "Content-Type": "text/event-stream" } });
  };
  const response = await proxyApi(new Request("app://kernel/api/kernel/chat/completions", { method: "POST", body: '{"messages":[]}', headers: { Authorization: "secret", Cookie: "private" } }), remote, transport);
  assert.equal(calls, 1);
  assert.equal(await response.text(), "data: hello\n\n");
});
test("rejects arbitrary routes, foreign hosts, queries and methods", async () => {
  const transport: typeof fetch = async () => { throw new Error("Must not fetch"); };
  for (const url of ["app://kernel/api/secrets", "app://evil/api/opensource/models", "app://kernel/api/opensource/models?url=http://localhost", "https://kernel/api/opensource/models", "app://kernel/api/kernel/search"]) {
    assert.equal((await proxyApi(new Request(url), remote, transport)).status, 404);
  }
});
test("blocks insecure or credential-bearing upstreams", async () => {
  const transport: typeof fetch = async () => { throw new Error("Must not fetch"); };
  for (const host of ["http://example.com", "https://user:secret@example.com"]) assert.equal((await proxyApi(new Request("app://kernel/api/opensource/models"), host, transport)).status, 503);
});
test("preserves provider errors and reports network failures", async () => {
  const request = () => new Request("app://kernel/api/opensource/models");
  assert.equal((await proxyApi(request(), remote, async () => new Response("limited", { status: 429 }))).status, 429);
  assert.equal((await proxyApi(request(), remote, async () => { throw new Error("offline"); })).status, 502);
});
