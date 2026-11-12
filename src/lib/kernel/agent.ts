import type { AgentEvent, ApprovalRequest, ChatMessage, Settings, Step } from "./types";
import { resolveBase, streamChat, type ToolDef, type WireMessage } from "./modelClient";
import { db, uid, writeMemory } from "./db";
import { isDesktop } from "./bridge";
import { MODE_PROMPTS, toolAllowed } from "./modes";

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

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});
const str = { type: "string" };

const TOOLS: ToolDef[] = [
  fn("desktop_inspect", "Inspect Windows apps. Use window=0 to list open windows, then inspect a returned handle to get control IDs. This shares visible app text with the model after approval.", { window: { type: "integer", minimum: 0 } }, ["window"]),
  fn("desktop_launch", "Launch notepad, calculator or explorer on Windows after approval.", { app: { type: "string", enum: ["notepad", "calculator", "explorer"] } }, ["app"]),
  fn("desktop_click", "Invoke a button by its observed control ID. Inspect again to verify.", { window: { type: "integer" }, element: str }, ["window", "element"]),
  fn("desktop_type", "Replace the value of an editable accessibility control with text. Password fields are blocked.", { window: { type: "integer" }, element: str, text: str }, ["window", "element", "text"]),
  fn("desktop_key", "Send a keyboard shortcut to an observed window after approval.", { window: { type: "integer" }, key: { type: "string", enum: ["ENTER", "TAB", "ESC", "UP", "DOWN", "LEFT", "RIGHT", "CTRL+A", "CTRL+C", "CTRL+V", "CTRL+S"] } }, ["window", "key"]),
  fn("plan", "Share a short numbered plan before multi-step work. Call once at the start.", { steps: { type: "array", items: str } }, ["steps"]),
  fn("list_files", "List files in a folder of the user's workspace (desktop) or their saved notes (browser).", { dir: str }, ["dir"]),
  fn("read_file", "Read a text file from the workspace or notes.", { path: str }, ["path"]),
  fn("write_file", "Create or overwrite a text file in the workspace (also saved to notes). The user must approve.", { path: str, content: str }, ["path", "content"]),
  fn("run_command", "Run a shell command inside the user's workspace folder (desktop app only). The user must approve.", { command: str }, ["command"]),
  fn("web_search", "Search the web. Returns titles, URLs and snippets. Follow up with fetch_url to read a result.", { query: str }, ["query"]),
  fn("open_url", "Open a link, map, phone number (tel:), email (mailto:) or message (sms:) on the user's device. The user must approve.", { url: str, reason: str }, ["url", "reason"]),
  fn("copy_to_clipboard", "Copy text to the user's clipboard.", { text: str }, ["text"]),
  fn("share", "Open the device share sheet (phone) to send text or a link to another app. The user must approve.", { title: str, text: str }, ["title", "text"]),
  fn("notify", "Show a device notification to the user, e.g. when a long task finishes.", { title: str, body: str }, ["title", "body"]),
  fn("fetch_url", "Fetch a public web page and return its readable text.", { url: str }, ["url"]),
  fn("remember", "Save a short fact about the user or their preferences to long-term memory. The user must approve.", { key: str, fact: str }, ["key", "fact"]),
];

const SYSTEM = `You are Kernel Axiom, a candid, helpful AI assistant. Be direct, thoughtful and conversational. Do not pretend to be Grok or claim access to its services.
Use only the tools available in the current mode. When work is finished, describe what actually succeeded and any remaining limitations. Never report simulated actions as real.`;

type Args = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

async function ensureWorkspace() {
  const ws = window.kernel?.workspace;
  if (!ws) return null;
  return (await ws.root()) ?? (await ws.choose());
}

async function runModel({ history, prompt, settings, signal, emit, requestApproval, takeSteer }: RunAgentInput) {
  const st = stepper(emit);
  const desktop = isDesktop() && !!window.kernel?.workspace;
  const mode = settings.mode === "computer" || settings.mode === "research" ? settings.mode : "chat";
  const availableTools = TOOLS.filter((t) => toolAllowed(mode, t.function.name, desktop));
  const memories = (await db.memory.where("path").startsWith("memory/").toArray()).map((m) => `- ${m.content}`).join("\n");
  const messages: WireMessage[] = [
    { role: "system", content: SYSTEM + "\n" + MODE_PROMPTS[mode] + `\nEnvironment: ${desktop ? "desktop app with a real workspace folder" : "web browser; files are the user's saved notes, run_command is unavailable"}.` + (memories ? `\nKnown about the user:\n${memories}` : "") },
    ...history.map((m) => ({ role: m.role, content: m.content }) as WireMessage),
    { role: "user", content: prompt },
  ];

  const approve = async (req: Omit<ApprovalRequest, "id">) => {
    emit({ type: "status", orb: "needs-approval", label: "Waiting for you" });
    const full = { ...req, id: uid() };
    signal.throwIfAborted();
    const ok = await requestApproval(full);
    signal.throwIfAborted();
    emit({ type: "approval-result", record: { ...full, decision: ok ? "allowed" : "denied" } });
    return ok;
  };

  const exec = async (name: string, a: Args): Promise<string> => {
    signal.throwIfAborted();
    if (!availableTools.some((t) => t.function.name === name)) return "This tool is unavailable in the current mode.";
    if (name.startsWith("desktop_")) {
      if (!window.kernel?.desktop) return "Install the updated Windows desktop app to use computer controls.";
      const action = name.slice("desktop_".length);
      if (!(await approve({
        kind: action === "inspect" ? "send-data" : "run-code",
        title: action === "inspect" ? "Read visible app text and send it to your model" : "Control a Windows app",
        preview: JSON.stringify({ action, ...a }, null, 2),
      }))) return "The user denied this desktop action.";
      const step = st.start(action === "inspect" ? "Inspecting Windows apps" : "Controlling a Windows app", action);
      try {
        signal.throwIfAborted();
        const result = await window.kernel.desktop.action({ ...a, action });
        signal.throwIfAborted();
        emit({ type: "workspace", patch: { code: result, status: "Computer" } });
        st.finish(step, { title: "Desktop result received" });
        return result;
      } catch (error) {
        if (signal.aborted) throw error;
        st.finish(step, { title: "Desktop action failed", status: "failed" });
        return "Error: " + (error as Error).message;
      }
    }
    switch (name) {
      case "plan": {
        const steps = Array.isArray(a["steps"]) ? (a["steps"] as string[]) : [];
        const p = st.start("Planned the approach", steps.slice(0, 4).join(" · "));
        st.finish(p);
        return "Plan noted. Proceed.";
      }
      case "list_files": {
        emit({ type: "status", orb: "looking", label: "Looking around" });
        const step = st.start("Listing files", s(a["dir"]) || ".");
        let out: string;
        if (desktop && (await ensureWorkspace())) {
          const list = await window.kernel!.workspace!.listFiles(s(a["dir"]) || ".");
          out = list.map((f) => (f.dir ? f.name + "/" : f.name)).join("\n") || "(empty)";
        } else out = (await db.memory.toArray()).map((m) => m.path).join("\n") || "(no notes yet)";
        st.finish(step, { title: "Listed files" });
        return out;
      }
      case "read_file": {
        emit({ type: "status", orb: "reading", label: "Reading" });
        const path = s(a["path"]);
        const step = st.start("Reading a file", path);
        let out: string;
        try {
          if (desktop && (await ensureWorkspace())) out = await window.kernel!.workspace!.readFile(path);
          else out = (await db.memory.where("path").equals(path).first())?.content ?? `No file at ${path}`;
          emit({ type: "workspace", patch: { code: out.slice(0, 4000), status: "Reading" } });
          st.finish(step, { title: "Read a file" });
        } catch (e) {
          out = `Error: ${(e as Error).message}`;
          st.finish(step, { title: "Couldn't read file", status: "failed" });
        }
        return out.slice(0, 15000);
      }
      case "write_file": {
        const path = s(a["path"]);
        const content = s(a["content"]);
        if (!(await approve({ kind: "write-file", title: `Write a file to ${path}`, preview: content.slice(0, 4000) }))) return "The user denied this write.";
        emit({ type: "status", orb: "saving-memory", label: "Saving" });
        const step = st.start("Writing file", path);
        try {
          if (desktop && (await ensureWorkspace())) await window.kernel!.workspace!.writeFile(path, content);
          await writeMemory(path, content);
          st.finish(step, { title: "Wrote file" });
          return `Wrote ${content.length} characters to ${path}.`;
        } catch (e) {
          st.finish(step, { title: "Couldn't write file", status: "failed" });
          return `Error: ${(e as Error).message}`;
        }
      }
      case "run_command": {
        const command = s(a["command"]);
        if (!desktop) return "run_command is only available in the Kernel Axiom desktop app. Continue without it.";
        emit({ type: "workspace", patch: { code: "$ " + command, status: "Waiting for approval" } });
        if (!(await approve({ kind: "run-code", title: "Run a command on your computer", preview: command }))) return "The user denied this command.";
        if (!(await ensureWorkspace())) return "No workspace folder chosen.";
        emit({ type: "status", orb: "writing-code", label: "Running code" });
        const step = st.start("Running command", command.slice(0, 60));
        const r = await window.kernel!.workspace!.runCommand(command);
        emit({ type: "workspace", patch: { code: `$ ${command}\n${r.stdout}${r.stderr}`.slice(0, 6000), status: "Running code" } });
        st.finish(step, { title: r.code === 0 ? "Ran command" : `Command exited ${r.code}`, status: r.code === 0 ? "done" : "failed" });
        return JSON.stringify(r).slice(0, 12000);
      }
      case "fetch_url": {
        const url = s(a["url"]);
        emit({ type: "status", orb: "searching", label: "Browsing" });
        emit({ type: "workspace", patch: { url: url.replace(/^https?:\/\//, ""), status: "Reading", readingLine: -1 } });
        const step = st.start("Reading a page", url.replace(/^https?:\/\//, "").slice(0, 60));
        let line = 0;
        const t = setInterval(() => emit({ type: "workspace", patch: { readingLine: (line += 2) % 10 } }), 260);
        try {
          const res = await fetch(`${resolveBase("/api/kernel")}/fetch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal });
          const j = (await res.json()) as { title?: string; text?: string; error?: string };
          st.finish(step, { title: j.error ? "Couldn't read page" : "Read a page", detail: j.title || step.detail, status: j.error ? "failed" : "done" });
          return j.error ? `Error: ${j.error}` : `Title: ${j.title}\n\n${j.text}`;
        } finally {
          clearInterval(t);
        }
      }
      case "web_search": {
        const query = s(a["query"]);
        emit({ type: "status", orb: "searching", label: "Searching" });
        emit({ type: "workspace", patch: { url: "search: " + query, status: "Searching", readingLine: -1 } });
        const step = st.start("Searching the web", query.slice(0, 60));
        const res = await fetch(`${resolveBase("/api/kernel")}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal });
        const j = (await res.json()) as { text?: string; urls?: string[]; error?: string };
        const n = j.urls?.length ?? 0;
        st.finish(step, { title: j.error ? "Search failed" : `Searched the web · ${n} sources`, status: j.error ? "failed" : "done" });
        return j.error ? `Error: ${j.error}` : j.text || "No results.";
      }
      case "open_url": {
        const url = s(a["url"]);
        if (!/^(https?:|tel:|mailto:|sms:|geo:)/i.test(url)) return "Only http(s), tel, mailto, sms and geo links can be opened.";
        if (!(await approve({ kind: "send-data", title: "Open on your device", preview: `${url}\n\n${s(a["reason"])}` }))) return "The user declined.";
        const step = st.start("Opened on your device", url.slice(0, 60));
        window.open(url, "_blank", "noopener");
        st.finish(step);
        return "Opened.";
      }
      case "copy_to_clipboard": {
        try {
          await navigator.clipboard.writeText(s(a["text"]));
          st.finish(st.start("Copied to clipboard", s(a["text"]).slice(0, 60)));
          return "Copied.";
        } catch {
          return "Clipboard is not available here.";
        }
      }
      case "share": {
        if (!(await approve({ kind: "send-data", title: "Share to another app", preview: `${s(a["title"])}\n\n${s(a["text"])}` }))) return "The user declined.";
        if (!navigator.share) {
          await navigator.clipboard?.writeText(s(a["text"])).catch(() => undefined);
          return "Share sheet unavailable on this device; copied the text to the clipboard instead.";
        }
        try {
          await navigator.share({ title: s(a["title"]), text: s(a["text"]) });
          st.finish(st.start("Shared", s(a["title"]).slice(0, 60)));
          return "Shared.";
        } catch {
          return "The user cancelled sharing.";
        }
      }
      case "notify": {
        if (typeof Notification === "undefined") return "Notifications are not supported here.";
        const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
        if (perm !== "granted") return "Notifications are blocked.";
        new Notification(s(a["title"]), { body: s(a["body"]), icon: "/icon-192.png" });
        return "Notified.";
      }
      case "remember": {
        const fact = s(a["fact"]);
        if (!(await approve({ kind: "send-data", title: "Remember this about you", preview: fact }))) return "The user declined.";
        emit({ type: "status", orb: "saving-memory", label: "Remembering" });
        await writeMemory(`memory/${s(a["key"]).replace(/[^\w-]+/g, "-") || uid()}`, fact);
        const step = st.start("Saved to memory", fact.slice(0, 60));
        st.finish(step);
        return "Saved.";
      }
      default:
        return `Unknown tool ${name}`;
    }
  };

  let completed = false;
  for (let turn = 0; turn < 24; turn++) {
    signal.throwIfAborted();
    for (const note of takeSteer()) messages.push({ role: "user", content: `(Steering note from the user, mid-task) ${note}` });
    emit({ type: "status", orb: "thinking", label: "Thinking" });
    let wrote = false;
    const res = await streamChat({
      settings,
      messages,
      tools: availableTools,
      signal,
      onToken: (d) => {
        if (!wrote) emit({ type: "status", orb: "speaking", label: "Writing" });
        wrote = true;
        emit({ type: "text", delta: d });
      },
    });
    if (res.text) emit({ type: "text", delta: "\n\n" });
    messages.push({ role: "assistant", content: res.text || null, tool_calls: res.toolCalls.length ? res.toolCalls : undefined });
    if (!res.toolCalls.length) { completed = true; break; }
    for (const call of res.toolCalls) {
      let args: Args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* empty */
      }
      signal.throwIfAborted();
      let result: string;
      try { result = await exec(call.function.name, args); }
      catch (error) {
        if (signal.aborted) throw error;
        result = "Tool failed: " + (error as Error).message;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  signal.throwIfAborted();
  if (!completed) {
    emit({ type: "text", delta: "\n\nReached the 24-step limit. The task may be incomplete; ask me to continue." });
    emit({ type: "status", orb: "paused", label: "Step limit reached" });
  } else emit({ type: "status", orb: "celebrating", label: "Done" });
}
