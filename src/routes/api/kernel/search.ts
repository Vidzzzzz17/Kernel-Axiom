import { createFileRoute } from "@tanstack/react-router";

/** Real web search for the agent's web_search tool (DuckDuckGo HTML results, no key). */
export const Route = createFileRoute("/api/kernel/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { query } = (await request.json()) as { query?: string };
        const q = String(query ?? "").trim().slice(0, 300);
        if (!q) return Response.json({ error: "Empty query" }, { status: 400 });
        const res = await fetch("https://html.duckduckgo.com/html/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (KernelAxiom)" },
          body: new URLSearchParams({ q }).toString(),
        });
        const html = await res.text();
        const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
        const results: { title: string; url: string; snippet: string }[] = [];
        const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) && results.length < 8) {
          let url = m[1] ?? "";
          const uddg = /uddg=([^&]+)/.exec(url)?.[1];
          if (uddg) url = decodeURIComponent(uddg);
          results.push({ title: strip(m[2] ?? ""), url, snippet: strip(m[3] ?? "") });
        }
        return Response.json({ query: q, results });
      },
    },
  },
});
