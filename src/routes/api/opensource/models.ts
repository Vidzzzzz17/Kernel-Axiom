import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM = "https://text.pollinations.ai/models";

/** Names of the free open-source models, served from our own origin. */
export const Route = createFileRoute("/api/opensource/models")({
  server: {
    handlers: {
      GET: async () => {
        let res: Response;
        try {
          res = await fetch(UPSTREAM, { headers: { Accept: "application/json" } });
        } catch {
          return Response.json({ error: "Couldn't reach the open-source model list." }, { status: 502 });
        }
        if (!res.ok) return Response.json({ error: `Open-source model list error ${res.status}` }, { status: res.status });
        const list = (await res.json()) as { name: string; tier?: string }[];
        const models = list.filter((m) => !m.tier || m.tier === "anonymous").map((m) => m.name);
        return Response.json({ models });
      },
    },
  },
});
