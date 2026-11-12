import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM = "https://text.pollinations.ai/openai/chat/completions";

/**
 * Open-source model bridge. The free upstream refuses browser requests
 * (it demands a bot-check token), so calls arrive here on our own origin and
 * go out server-side. Only model, messages and tools are forwarded.
 */
export const Route = createFileRoute("/api/opensource/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }

        const b = body as { messages?: unknown; tools?: unknown; model?: unknown };
        if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 400) {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }
        const model =
          typeof b.model === "string" && /^[a-z0-9._:-]{1,64}$/i.test(b.model) ? b.model : "openai-fast";

        let upstream: Response;
        try {
          upstream = await fetch(UPSTREAM, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: b.messages,
              tools: Array.isArray(b.tools) && b.tools.length ? b.tools : undefined,
              stream: true,
            }),
            signal: request.signal,
          });
        } catch (e) {
          if ((e as Error).name === "AbortError") return new Response(null, { status: 499 });
          return Response.json({ error: "Couldn't reach the open-source model." }, { status: 502 });
        }

        if (!upstream.ok) {
          const text = (await upstream.text().catch(() => "")).slice(0, 300);
          return Response.json({ error: text || `Open-source model error ${upstream.status}` }, { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
