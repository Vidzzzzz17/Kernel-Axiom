import { createFileRoute } from "@tanstack/react-router";

/** Read-only web fetch for the agent's fetch_url tool. Returns page text, capped. */
export const Route = createFileRoute("/api/kernel/fetch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { url } = (await request.json()) as { url?: string };
        let target: URL;
        try {
          target = new URL(String(url));
        } catch {
          return Response.json({ error: "Invalid URL" }, { status: 400 });
        }
        if (!/^https?:$/.test(target.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(target.hostname)) {
          return Response.json({ error: "Only public http(s) URLs are allowed." }, { status: 400 });
        }
        const res = await fetch(target, { headers: { "User-Agent": "KernelAxiom/1.0" }, redirect: "follow" });
        const html = await res.text();
        const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
        const text = html
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 12000);
        return Response.json({ status: res.status, url: res.url, title, text });
      },
    },
  },
});
