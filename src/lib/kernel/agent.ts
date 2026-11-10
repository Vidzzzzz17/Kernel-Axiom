import type { AgentEvent, ApprovalRequest, ChatMessage, Settings, Step } from "./types";
import { streamChat, type ToolDef, type WireMessage } from "./modelClient";
import { uid, writeMemory } from "./db";
import { isDesktop } from "./bridge";

export interface RunAgentInput {
  prompt: string;
  history: ChatMessage[];
  settings: Settings;
  signal: AbortSignal;
  emit: (e: AgentEvent) => void;
  /** Resolves true when the user clicks "Allow once". Every risky tool goes through this. */
  requestApproval: (req: ApprovalRequest) => Promise<boolean>;
  /** Returns and clears any "steer while it works" notes typed by the user. */
  takeSteer: () => string[];
}

/** Single entry point for all agent work. Swap providers in Settings; the UI never changes. */
export async function runAgent(input: RunAgentInput): Promise<void> {
  if (input.settings.provider === "demo") return runDemo(input);
  return runModel(input);
}

/* ------------------------------------------------------------------ */

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

function stepper(emit: RunAgentInput["emit"]) {
  return {
    start(title: string, detail?: string): Step {
      const s: Step = { id: uid(), title, detail, status: "running", startedAt: Date.now() };
      emit({ type: "step", step: s });
      return s;
    },
    finish(s: Step, patch: Partial<Step> = {}) {
      Object.assign(s, { status: "done", endedAt: Date.now() }, patch);
      emit({ type: "step", step: { ...s } });
    },
  };
}

async function streamText(text: string, emit: RunAgentInput["emit"], signal: AbortSignal) {
  for (const word of text.split(/(\s+)/)) {
    emit({ type: "text", delta: word });
    await sleep(28, signal);
  }
}

async function runDemo({ prompt, signal, emit, requestApproval, takeSteer }: RunAgentInput) {
  const st = stepper(emit);
  const topic = prompt.replace(/\s+/g, " ").trim().slice(0, 60);

  emit({ type: "status", orb: "thinking", label: "Planning" });
  const plan = st.start("Planning the approach", "Break down, research, verify");
  await sleep(1400, signal);
  st.finish(plan, { title: "Planned the approach", detail: "Research, compare, verify, save" });

  emit({ type: "status", orb: "searching", label: "Searching" });
  emit({ type: "workspace", patch: { url: "search.local/?q=" + encodeURIComponent(topic), status: "Searching", readingLine: -1 } });
  const search = st.start("Searching the web", topic.toLowerCase());
  await sleep(1600, signal);
  st.finish(search, { title: "Searched the web" });

  emit({ type: "status", orb: "reading", label: "Reading" });
  const read = st.start("Reading page 1 of 3", "Sources and documentation");
  for (let page = 1; page <= 3; page++) {
    read.title = `Reading page ${page} of 3`;
    emit({ type: "step", step: { ...read } });
    emit({ type: "workspace", patch: { url: `example.com/source-${page}/overview`, status: "Reading" } });
    for (let line = 0; line < 9; line += 2) {
      emit({ type: "workspace", patch: { readingLine: line } });
      await sleep(220, signal);
    }
  }
  st.finish(read, { title: "Read 3 pages" });

  const steer = takeSteer();
  if (steer.length) {
    const s = st.start("Adjusting to your note", steer.join(" · "));
    await sleep(600, signal);
    st.finish(s, { title: "Adjusted to your note" });
  }

  emit({ type: "status", orb: "writing-code", label: "Running code" });
  const code = `# verify.py\nsources = ["source-1", "source-2", "source-3"]\nfor s in sources:\n    print(s, "ok")\n`;
  emit({ type: "workspace", patch: { code, status: "Running code" } });
  const run = st.start("Running code in sandbox", "verify.py");
  await sleep(1500, signal);
  st.finish(run, { title: "Ran code in sandbox" });

  emit({ type: "status", orb: "speaking", label: "Writing" });
  await streamText(
    `I went through three sources and checked the findings with a short script. Saving the summary writes a file, so I need your approval first.`,
    emit,
    signal,
  );

  const path = "notes/summary.md";
  const content = `# ${topic || "Summary"}\n\n1. Source 1: clear overview, well maintained\n2. Source 2: deeper detail, good examples\n3. Source 3: useful cross-check\n`;
  emit({ type: "status", orb: "needs-approval", label: "Waiting for you" });
  const req: ApprovalRequest = { id: uid(), kind: "write-file", title: `Write a file to ${path}`, preview: content };
  const ok = await requestApproval(req);
  emit({ type: "approval-result", record: { ...req, decision: ok ? "allowed" : "denied" } });

  if (ok) {
    emit({ type: "status", orb: "saving-memory", label: "Saving" });
    const save = st.start("Saving to notes", path);
    await sleep(900, signal);
    await writeMemory(path, content);
    st.finish(save, { title: "Saved to notes" });
    await streamText(`\n\nDone. The summary is in ${path}.`, emit, signal);
    emit({ type: "status", orb: "celebrating", label: "Done" });
  } else {
    await streamText(`\n\nUnderstood, I did not write anything.`, emit, signal);
    emit({ type: "status", orb: "done", label: "Done" });
  }
}

/* ------------------------------------------------------------------ */

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "write_note",
      description: "Write or overwrite a markdown note in the user's local notes. Always asks the user first.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_code",
      description: "Run a short script inside the user's chosen workspace folder (desktop app only). Always asks first.",
      parameters: {
        type: "object",
        properties: { language: { type: "string" }, code: { type: "string" } },
        required: ["language", "code"],
      },
    },
  },
];

async function runModel({ history, prompt, settings, signal, emit, requestApproval, takeSteer }: RunAgentInput) {
  const st = stepper(emit);
  const messages: WireMessage[] = [
    {
      role: "system",
      content:
        "You are Kernel Axiom, a calm, precise agent. Be concise. Use tools when they help; risky tools require the user's approval, which the app handles.",
    },
    ...history.map((m) => ({ role: m.role, content: m.content }) as WireMessage),
    { role: "user", content: prompt },
  ];

  for (let turn = 0; turn < 8; turn++) {
    for (const note of takeSteer()) messages.push({ role: "user", content: `(Steering note) ${note}` });
    emit({ type: "status", orb: "thinking", label: "Thinking" });
    const step = st.start(turn === 0 ? "Thinking" : "Continuing", settings.model);
    let first = true;
    const res = await streamChat({
      settings,
      messages,
      tools: TOOLS,
      signal,
      onToken: (d) => {
        if (first) {
          emit({ type: "status", orb: "speaking", label: "Writing" });
          first = false;
        }
        emit({ type: "text", delta: d });
      },
    });
    st.finish(step, { title: turn === 0 ? "Thought it through" : "Continued" });
    messages.push({ role: "assistant", content: res.text || null, tool_calls: res.toolCalls.length ? res.toolCalls : undefined });
    if (!res.toolCalls.length) break;

    for (const call of res.toolCalls) {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* leave empty */
      }
      let result = "";
      if (call.function.name === "write_note") {
        emit({ type: "status", orb: "needs-approval", label: "Waiting for you" });
        const req: ApprovalRequest = { id: uid(), kind: "write-file", title: `Write a file to ${args.path}`, preview: args.content ?? "" };
        const ok = await requestApproval(req);
        emit({ type: "approval-result", record: { ...req, decision: ok ? "allowed" : "denied" } });
        if (ok) {
          emit({ type: "status", orb: "saving-memory", label: "Saving" });
          const s = st.start("Saving to notes", args.path);
          if (isDesktop() && window.kernel?.workspace) await window.kernel.workspace.writeFile(args.path, args.content);
          await writeMemory(args.path, args.content);
          st.finish(s, { title: "Saved to notes" });
          result = "Saved.";
        } else result = "The user denied this action.";
      } else if (call.function.name === "run_code") {
        emit({ type: "status", orb: "needs-approval", label: "Waiting for you" });
        emit({ type: "workspace", patch: { code: args.code, status: "Waiting for approval" } });
        const req: ApprovalRequest = { id: uid(), kind: "run-code", title: `Run ${args.language} code`, preview: args.code ?? "" };
        const ok = await requestApproval(req);
        emit({ type: "approval-result", record: { ...req, decision: ok ? "allowed" : "denied" } });
        if (!ok) result = "The user denied this action.";
        else if (!window.kernel?.workspace) result = "Code execution is only available in the desktop app.";
        else {
          emit({ type: "status", orb: "writing-code", label: "Running code" });
          const s = st.start("Running code in sandbox", args.language);
          const out = await window.kernel.workspace.runCode(args.code, args.language);
          st.finish(s, { title: "Ran code in sandbox", status: out.code === 0 ? "done" : "failed" });
          result = JSON.stringify(out).slice(0, 4000);
        }
      } else result = `Unknown tool ${call.function.name}`;
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  emit({ type: "status", orb: "done", label: "Done" });
}
