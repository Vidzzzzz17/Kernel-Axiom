import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, streamText, tool, type ModelMessage, type ToolSet } from "ai";

/**
 * Built-in "Kernel AI" provider. Accepts an OpenAI chat-completions request from the app,
 * runs it on the Lovable AI Gateway (Responses API) server-side, and streams back
 * chat-completions SSE so the client's modelClient needs no special casing.
 * The gateway key stays on the server.
 */
const MODEL = "openai/gpt-6-astra";

type Wire =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

function toModelMessages(wire: Wire[]): { system: string; messages: ModelMessage[] } {
  const names = new Map<string, string>();
  let system = "";
  const out: ModelMessage[] = [];
  for (const m of wire) {
    if (m.role === "system") system += (system ? "\n\n" : "") + m.content;
    else if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const parts: Extract<ModelMessage, { role: "assistant" }>["content"] & unknown[] = [];
      if (m.content) parts.push({ type: "text", text: m.content });
      for (const c of m.tool_calls ?? []) {
        names.set(c.id, c.function.name);
        let input: unknown = {};
        try {
          input = JSON.parse(c.function.arguments || "{}");
        } catch {
          /* keep empty */
        }
        parts.push({ type: "tool-call", toolCallId: c.id, toolName: c.function.name, input });
      }
      out.push({ role: "assistant", content: parts });
    } else if (m.role === "tool") {
      out.push({
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: m.tool_call_id, toolName: names.get(m.tool_call_id) ?? "tool", output: { type: "text", value: m.content } },
        ],
      });
    }
  }
  return { system, messages: out };
}

export const Route = createFileRoute("/api/kernel/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return Response.json({ error: "Kernel AI is not configured." }, { status: 500 });
        const body = (await request.json()) as {
          messages: Wire[];
          tools?: { function: { name: string; description: string; parameters: Record<string, unknown> } }[];
        };
        if (!Array.isArray(body.messages) || body.messages.length > 400) {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }

        // Tools are declared without execute: the app runs them locally after approval.
        const tools: ToolSet = {};
        for (const t of body.tools ?? []) {
          tools[t.function.name] = tool({
            description: t.function.description,
            inputSchema: jsonSchema(t.function.parameters as never),
          });
        }

        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        });
        const { system, messages } = toModelMessages(body.messages);
        const result = streamText({
          model: provider.responses(MODEL),
          system,
          messages,
          tools,
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              store: false,
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        const enc = new TextEncoder();
        const send = (c: ReadableStreamDefaultController<Uint8Array>, delta: unknown) =>
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`));

        const stream = new ReadableStream<Uint8Array>({
          async start(c) {
            let toolIndex = 0;
            try {
              for await (const part of result.fullStream) {
                if (part.type === "text-delta") send(c, { content: part.text });
                else if (part.type === "reasoning-delta") send(c, { reasoning: part.text });
                else if (part.type === "tool-call") {
                  send(c, {
                    tool_calls: [
                      { index: toolIndex++, id: part.toolCallId, type: "function", function: { name: part.toolName, arguments: JSON.stringify(part.input ?? {}) } },
                    ],
                  });
                } else if (part.type === "error") {
                  const e = part.error as { statusCode?: number; message?: string };
                  c.enqueue(enc.encode(`data: ${JSON.stringify({ error: { status: e?.statusCode ?? 500, message: e?.message ?? "Model error" } })}\n\n`));
                }
              }
            } catch (err) {
              if ((err as Error).name !== "AbortError") {
                c.enqueue(enc.encode(`data: ${JSON.stringify({ error: { message: (err as Error).message } })}\n\n`));
              }
            }
            c.enqueue(enc.encode("data: [DONE]\n\n"));
            c.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      },
    },
  },
});
