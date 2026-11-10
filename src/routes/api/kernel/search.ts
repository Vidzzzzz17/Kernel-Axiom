import { createFileRoute } from "@tanstack/react-router";

/**
 * Real web search for the agent's web_search tool, via Gemini Google Search grounding
 * on the Lovable AI Gateway. Returns a sourced summary with URLs as plain text.
 */
const SEARCH_MODEL = "google/gemini-3.8-flash";

export const Route = createFileRoute("/api/kernel/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: "Search is not configured." }, { status: 500 });
        const { query } = (await request.json()) as { query?: string };
        const q = String(query ?? "").trim().slice(0, 300);
        if (!q) return Response.json({ error: "Empty query" }, { status: 400 });

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, Authorization: `Bearer ${apiKey}`, "X-Lovable-AIG-SDK": "fetch" },
          signal: request.signal,
          body: JSON.stringify({
            model: SEARCH_MODEL,
            stream: true,
            tools: [{ type: "google_search" }],
            messages: [
              {
                role: "user",
                content: `Search the web for: ${q}\n\nReturn up to 6 results as a numbered list. For each: title, full URL on its own line, and a one-sentence factual snippet. Only include URLs you found in search.`,
              },
            ],
          }),
        });
        if (!res.ok || !res.body) {
          const msg = res.status === 402 ? "AI credits are used up." : res.status === 429 ? "Search is rate limited, try again shortly." : `Search failed (${res.status}).`;
          return Response.json({ error: msg }, { status: res.status });
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const l of lines) {
            const d = l.trim();
            if (!d.startsWith("data:") || d.includes("[DONE]")) continue;
            try {
              text += JSON.parse(d.slice(5)).choices?.[0]?.delta?.content ?? "";
            } catch {
              /* partial */
            }
          }
        }
        const urls = Array.from(new Set(text.match(/https?:\/\/[^\s)\]>"]+/g) ?? []));
        return Response.json({ query: q, text, urls });
      },
    },
  },
});
