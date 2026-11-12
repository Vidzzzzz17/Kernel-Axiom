import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
import { Menu, PanelRight, X } from "lucide-react";
import ReactMarkdownLite from "./MessageText";
import { db, DEFAULT_SETTINGS, deleteTask, saveSettings, uid } from "@/lib/kernel/db";
import type { AgentMode } from "@/lib/kernel/modes";
import { isDesktop } from "@/lib/kernel/bridge";
import { runAgent } from "@/lib/kernel/agent";
import type { ApprovalRecord, ApprovalRequest, ChatMessage, OrbState, Step, WorkspaceView } from "@/lib/kernel/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Backdrop } from "./Backdrop";
import { Orb } from "./Orb";
import { Sidebar } from "./Sidebar";
import { Composer } from "./Composer";
import { StepsCard } from "./StepsCard";
import { ApprovalCard } from "./ApprovalCard";
import { Workspace } from "./Workspace";
import { CommandPalette } from "./CommandPalette";
import { VoiceMode } from "./VoiceMode";
import { SettingsPanel } from "./SettingsPanel";
import { ProviderForm } from "./ProviderForm";
import { TitleBar } from "./TitleBar";
import { IconButton, KButton, spring } from "./ui";

const SUGGESTIONS: Record<AgentMode, string[]> = {
  chat: ["Explain something complicated simply", "Help me think through an idea", "Write something worth reading"],
  research: ["Compare local AI models with sources", "Research a topic and check the evidence", "Find the official docs for my project"],
  computer: ["List my open windows", "Open Notepad and help me draft a note", "Summarise the files in my workspace"],
};

interface RunState {
  taskId: string;
  orb: OrbState;
  label: string;
  steps: Step[];
  text: string;
  approvals: ApprovalRecord[];
  startedAt: number;
}

const EMPTY_VIEW: WorkspaceView = { url: "", readingLine: -1, code: "", status: "" };

export function KernelApp() {
  // undefined only while loading; a missing row means first launch.
  const settings = useLiveQuery(async () => (await db.settings.get("settings")) ?? DEFAULT_SETTINGS, []);
  const tasks = useLiveQuery(() => db.tasks.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const notes = useLiveQuery(() => db.memory.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const messages =
    useLiveQuery(
      () => (activeId ? db.messages.where("taskId").equals(activeId).sortBy("createdAt") : Promise.resolve([] as ChatMessage[])),
      [activeId],
    ) ?? [];

  const [run, setRun] = useState<RunState | null>(null);
  const [pending, setPending] = useState<{ req: ApprovalRequest; resolve: (ok: boolean) => void } | null>(null);
  const [view, setView] = useState<WorkspaceView>(EMPTY_VIEW);
  const [wsOpen, setWsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<false | "Model" | "Memory">(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [restOrb, setRestOrb] = useState<OrbState>("looking");
  const [now, setNow] = useState(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const steerRef = useRef<string[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const mode = settings?.mode === "computer" || settings?.mode === "research" ? settings.mode : "chat";
  const running = !!run && !["done", "celebrating", "error", "paused"].includes(run.orb);

  // ticking clock while running
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  // Cmd/Ctrl+K and desktop global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    window.kernel?.onFocusCommandBar?.(() => composerRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, run?.text, run?.steps.length, pending]);

  const send = useCallback(
    async (text: string) => {
      if (running) {
        steerRef.current.push(text);
        return;
      }
      const s = settings ?? DEFAULT_SETTINGS;
      let taskId = activeId;
      const ts = Date.now();
      if (!taskId) {
        taskId = uid();
        await db.tasks.put({ id: taskId, title: text.slice(0, 48), createdAt: ts, updatedAt: ts });
        setActiveId(taskId);
      } else await db.tasks.update(taskId, { updatedAt: ts });
      const history = await db.messages.where("taskId").equals(taskId).sortBy("createdAt");
      await db.messages.put({ id: uid(), taskId, role: "user", content: text, createdAt: ts });

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      steerRef.current = [];
      setView(EMPTY_VIEW);
      const state: RunState = { taskId, orb: "thinking", label: "Working", steps: [], text: "", approvals: [], startedAt: ts };
      setRun({ ...state });
      const commit = () => setRun({ ...state, steps: [...state.steps], approvals: [...state.approvals] });

      try {
        await runAgent({
          prompt: text,
          history,
          settings: s,
          signal: ctrl.signal,
          takeSteer: () => steerRef.current.splice(0),
          requestApproval: (req) =>
            new Promise<boolean>((resolve) => {
              const done = (ok: boolean) => {
                setPending(null);
                resolve(ok);
              };
              ctrl.signal.addEventListener("abort", () => done(false), { once: true });
              setPending({ req, resolve: done });
            }),
          emit: (e) => {
            if (e.type === "status") Object.assign(state, { orb: e.orb, label: e.label });
            if (e.type === "text") state.text += e.delta;
            if (e.type === "step") {
              const i = state.steps.findIndex((x) => x.id === e.step.id);
              if (i >= 0) state.steps[i] = { ...e.step };
              else state.steps.push({ ...e.step });
            }
            if (e.type === "approval-result") state.approvals.push(e.record);
            if (e.type === "workspace") {
              setView((v) => ({ ...v, ...e.patch }));
              if (e.patch.url && !isMobile) setWsOpen(true);
            }
            commit();
          },
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (state.orb !== "paused") Object.assign(state, { orb: "done", label: "Stopped" });
          state.text += state.text ? "\n\n_Stopped._" : "_Stopped._";
        } else {
          Object.assign(state, { orb: "error", label: "Error" });
          state.text += `\n\n${(err as Error).message}`;
        }
        state.steps = state.steps.map((x) => (x.status === "running" ? { ...x, status: "failed", endedAt: Date.now() } : x));
        commit();
      }
      await db.messages.put({
        id: uid(),
        taskId,
        role: "assistant",
        content: state.text,
        steps: state.steps,
        approvals: state.approvals,
        createdAt: Date.now(),
      });
      setRestOrb(state.orb);
      setRun(null);
      setTimeout(() => setRestOrb("idle"), 2400);
      composerRef.current?.focus();
    },
    [running, settings, activeId, isMobile],
  );

  const stop = () => abortRef.current?.abort();
  const takeOver = () => {
    setRun((r) => (r ? { ...r, orb: "paused", label: "Paused, you have control" } : r));
    abortRef.current?.abort();
  };
  const removeTask = async (id: string) => {
    if (run?.taskId === id) stop();
    if (activeId === id) setActiveId(null);
    await deleteTask(id);
  };
  const newTask = () => {
    if (running) stop();
    setActiveId(null);
    setWsOpen(false);
    setNavOpen(false);
    setTimeout(() => composerRef.current?.focus(), 50);
  };

  if (settings === undefined) return <Backdrop />; // loading from IndexedDB
  if (!settings.onboarded) return <Onboarding onDone={(p) => saveSettings({ ...p, onboarded: true })} />;

  const activeTask = tasks.find((t) => t.id === activeId);
  const showRun = run && run.taskId === activeId;
  const isHome = !activeId;

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <Backdrop />
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Sidebar */}
        <div className="hidden md:block">
          <Sidebar tasks={tasks} activeId={activeId} onSelect={setActiveId} onNew={newTask} onSettings={() => setSettingsOpen("Model")}
                  onDelete={removeTask} />
        </div>
        <AnimatePresence>
          {navOpen && (
            <motion.div className="fixed inset-0 z-40 bg-background/40 p-3 backdrop-blur-sm md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNavOpen(false)}>
              <motion.div initial={{ x: -40 }} animate={{ x: 0 }} exit={{ x: -40 }} transition={spring} className="h-full w-fit" onClick={(e) => e.stopPropagation()}>
                <Sidebar
                  tasks={tasks}
                  activeId={activeId}
                  onSelect={(id) => {
                    setActiveId(id);
                    setNavOpen(false);
                  }}
                  onNew={newTask}
                  onSettings={() => setSettingsOpen("Model")}
                  onDelete={removeTask}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main column */}
        <main className={cn("relative flex min-h-0 min-w-0 flex-col", wsOpen ? "hidden w-[380px] shrink-0 lg:flex" : "flex-1")}>
          <header className="flex min-h-12 items-center gap-2 px-1">
            <IconButton label="Open tasks" className="md:hidden" onClick={() => setNavOpen(true)}>
              <Menu className="size-5" aria-hidden />
            </IconButton>
            <h1 className="truncate text-sm">{activeTask?.title ?? ""}</h1>
            <div className="ml-auto flex items-center gap-1">
              <KButton variant="glass" onClick={() => setSettingsOpen("Model")} aria-label="Choose AI model">
                {settings.model || "Choose model"}
              </KButton>
              {activeId && !wsOpen && (
                <IconButton label="Open workspace" variant="glass" onClick={() => setWsOpen(true)}>
                  <PanelRight className="size-4" aria-hidden />
                </IconButton>
              )}
              <KButton variant="glass" className="hidden min-h-11 rounded-xl text-xs sm:inline-flex" onClick={() => setPaletteOpen(true)}>
                <span className="font-mono">⌘K</span>
              </KButton>
            </div>
          </header>

          {isHome ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
              <Orb size={isMobile ? 96 : 128} state={restOrb === "idle" ? "looking" : restOrb} follow={restOrb === "idle"} />
              <h2 className="rise-in mt-8 text-center text-4xl sm:text-5xl">What should we work on?</h2>
              <ModePicker mode={mode} disabled={running} />
              <p className="mt-3 text-xs text-muted-foreground">{mode === "computer" ? (isDesktop() ? "Windows apps · workspace files · approved commands" : "Computer controls require the Windows desktop app") : mode === "research" ? "Web research with sources" : "A conversation, without computer actions"}</p>
              <Composer ref={composerRef} className="mt-8 w-full max-w-2xl" onSend={send} onVoice={() => setVoiceOpen(true)} hint />
              <ul className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTIONS[mode].map((s) => (
                  <li key={s}>
                    <KButton variant="glass" className="text-left text-xs sm:text-sm" onClick={() => send(s)}>
                      {s}
                    </KButton>
                  </li>
                ))}
              </ul>
              {settings.provider === "demo" && (
                <p className="label-mono mt-8 text-muted-foreground">Demo mode · switch models in settings</p>
              )}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                <div className={cn("mx-auto space-y-6 px-1 py-4", wsOpen ? "max-w-full" : "max-w-3xl")}>
                  <AnimatePresence initial={false}>
                    {messages.map((m) => (
                      <motion.div key={m.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
                        {m.role === "user" ? (
                          <UserBubble text={m.content} />
                        ) : (
                          <AssistantBlock orb="idle" steps={m.steps ?? []} text={m.content} approvals={m.approvals ?? []} startedAt={m.steps?.[0]?.startedAt} />
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {showRun && (
                    <AssistantBlock
                      live
                      orb={run.orb}
                      label={run.label}
                      steps={run.steps}
                      text={run.text}
                      approvals={run.approvals}
                      startedAt={run.startedAt}
                      pending={!isMobile ? pending : null}
                    />
                  )}
                </div>
              </div>
              <div className={cn("mx-auto w-full pt-2", wsOpen ? "max-w-full" : "max-w-3xl")}>
                <ModePicker mode={mode} disabled={running} />
                <Composer
                  ref={composerRef}
                  running={running}
                  onSend={send}
                  onStop={stop}
                  onVoice={() => setVoiceOpen(true)}
                  placeholder={running ? "Steer while it works" : wsOpen ? "Ask anything" : undefined}
                />
                <p className="mt-2 text-center text-xs text-muted-foreground">Actions that change files or send data ask first.</p>
              </div>
            </>
          )}
        </main>

        {/* Workspace */}
        <AnimatePresence>
          {wsOpen && activeId && (
            <Workspace view={view} running={running} elapsed={run ? now - run.startedAt : 0} onTakeOver={takeOver} onClose={() => setWsOpen(false)} />
          )}
        </AnimatePresence>
      </div>

      {/* Mobile approval sheet */}
      <AnimatePresence>
        {isMobile && pending && (
          <motion.div className="fixed inset-x-0 bottom-0 z-40 p-3" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
            <div className="mb-3 flex justify-center">
              <Orb size={48} state="needs-approval" />
            </div>
            <ApprovalCard request={pending.req} onDecide={pending.resolve} />
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        tasks={tasks}
        notes={notes}
        onTask={setActiveId}
        onAction={(a) => {
          if (a === "new") newTask();
          if (a === "settings") setSettingsOpen("Model");
          if (a === "memory") setSettingsOpen("Memory");
          if (a === "voice") setVoiceOpen(true);
          if (a === "workspace") setWsOpen(true);
        }}
      />
      <AnimatePresence>
        {settingsOpen && <SettingsPanel settings={settings} initialTab={settingsOpen} onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {voiceOpen && (
          <VoiceMode
            running={running}
            orb={run?.orb ?? "listening"}
            toolLabel={run?.steps.at(-1)?.status === "running" ? run.steps.at(-1)!.title : run?.label ?? ""}
            reply={run?.text ?? ""}
            onSend={send}
            onClose={() => setVoiceOpen(false)}
          />
        )}
      </AnimatePresence>
      {pending && <span className="sr-only" role="status">Kernel Axiom needs your approval</span>}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-whisper px-4 py-3 text-[15px]">{text}</p>
    </div>
  );
}

function AssistantBlock({
  orb,
  label,
  steps,
  text,
  approvals,
  startedAt,
  live,
  pending,
}: {
  orb: OrbState;
  label?: string;
  steps: Step[];
  text: string;
  approvals: ApprovalRecord[];
  startedAt?: number | undefined;
  live?: boolean | undefined;
  pending?: { req: ApprovalRequest; resolve: (ok: boolean) => void } | null;
}) {
  return (
    <div className="flex gap-3">
      <div className={cn("mt-0.5 h-fit rounded-full", live && !["done", "celebrating", "error", "paused"].includes(orb) && "orb-halo")}>
        <Orb size={32} state={orb} />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="flex items-center gap-2 text-sm">
          Kernel Axiom
          {live && label && (
            <span className={cn("text-muted-foreground", !["done", "celebrating", "error", "paused"].includes(orb) && "shimmer-text")}>{label}</span>
          )}
        </p>
        {steps.length > 0 && <StepsCard steps={steps} startedAt={startedAt} live={live} />}
        {text && <ReactMarkdownLite text={text} streaming={live && orb === "speaking"} />}
        {live && !text && orb === "thinking" && steps.length === 0 && <p className="shimmer-text text-[15px]">Thinking it through</p>}
        {approvals.map((a) => (
          <ApprovalCard key={a.id} request={a} record />
        ))}
        <AnimatePresence>{pending && <ApprovalCard key={pending.req.id} request={pending.req} onDecide={pending.resolve} />}</AnimatePresence>
      </div>
    </div>
  );
}

function Onboarding({ onDone }: { onDone: (p: Parameters<typeof saveSettings>[0]) => void }) {
  const [step, setStep] = useState(0);
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Backdrop />
      <motion.div layout transition={spring} className="glass w-full max-w-xl rounded-3xl p-6 sm:p-8">
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col items-center text-center">
              <Orb size={96} state="surprised" />
              <h1 className="mt-6 text-4xl">Kernel Axiom</h1>
              <p className="mt-3 max-w-sm text-muted-foreground">
                A calm agent that lives on your device. No accounts. It asks before it changes anything.
              </p>
              <KButton variant="primary" className="mt-8" onClick={() => setStep(1)}>
                Get started
              </KButton>
            </motion.div>
          ) : (
            <motion.div key="b" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl">Pick a model</h2>
                <IconButton label="Back" onClick={() => setStep(0)}>
                  <X className="size-4" aria-hidden />
                </IconButton>
              </div>
              <ProviderForm settings={DEFAULT_SETTINGS} onSave={onDone} submitLabel="Done" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ModePicker({ mode, disabled }: { mode: AgentMode; disabled: boolean }) {
  return (
    <div className="my-3 flex justify-center gap-1" role="group" aria-label="Assistant mode">
      {(["chat", "research", "computer"] as const).map((value) => (
        <button key={value} type="button" disabled={disabled} aria-pressed={mode === value}
          onClick={() => void saveSettings({ mode: value })}
          className={cn("rounded-full border px-4 py-2 text-sm capitalize transition-colors disabled:opacity-50", mode === value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}>
          {value}
        </button>
      ))}
    </div>
  );
}
