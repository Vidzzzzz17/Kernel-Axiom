const routes = new Map([
  ["/api/opensource/models", "GET"],
  ["/api/opensource/chat/completions", "POST"],
  ["/api/kernel/chat/completions", "POST"],
  ["/api/kernel/search", "POST"],
  ["/api/kernel/fetch", "POST"],
]);

/** Same-origin desktop gateway. Never forwards browser cookies, keys or arbitrary URLs. */
export async function proxyApi(request: Request, remote: string, transport: (url: string, init: RequestInit) => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  const method = routes.get(url.pathname);
  if (url.protocol !== "app:" || url.host !== "kernel" || !method || url.search || request.method !== method) return new Response("Unknown API route", { status: 404 });
  // Native desktop transport has no browser Origin. Free chat needs no hosted deployment.
  if (url.pathname === "/api/opensource/models") return Response.json({ models: ["openai-fast"] });
  if (url.pathname === "/api/opensource/chat/completions") {
    const raw = await request.text();
    if (raw.length > 2 * 1024 * 1024) return new Response("Request too large", { status: 413 });
    let body: { messages?: unknown; tools?: unknown };
    try { body = JSON.parse(raw); } catch { return new Response("Invalid request", { status: 400 }); }
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 400) return new Response("Invalid messages", { status: 400 });
    try {
      const response = await transport("https://text.pollinations.ai/openai/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", redirect: "error", signal: request.signal,
        body: JSON.stringify({ model: "openai-fast", messages: body.messages, tools: Array.isArray(body.tools) && body.tools.length ? body.tools : undefined, stream: true }),
      });
      return new Response(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "Cannot reach the free model. Check your internet connection." }, { status: 502 }); }
  }
  let upstream: URL;
  try { upstream = new URL(remote); } catch { return new Response("Configure a secure backend URL", { status: 503 }); }
  if (upstream.protocol !== "https:" || upstream.username || upstream.password) return new Response("Configure a secure backend URL", { status: 503 });
  upstream.pathname = url.pathname;
  upstream.search = "";
  upstream.hash = "";
  const body = method === "POST" ? await request.arrayBuffer() : null;
  if (body && body.byteLength > 2 * 1024 * 1024) return new Response("Request too large", { status: 413 });
  try {
    const response = await transport(upstream.toString(), {
      method, body, headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      credentials: "omit", redirect: "error", signal: request.signal,
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Cannot reach the hosted model service. Check the connection or choose another model in PC setup." }, { status: 502 });
  }
}
