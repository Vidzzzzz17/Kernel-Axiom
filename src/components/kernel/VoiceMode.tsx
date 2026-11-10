import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Mic, MicOff, Search, X } from "lucide-react";
import type { OrbState } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";
import { Orb } from "./Orb";
import { IconButton } from "./ui";

type SR = {
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  start(): void;
  stop(): void;
};

export function VoiceMode({
  running,
  orb,
  toolLabel,
  reply,
  onSend,
  onClose,
}: {
  running: boolean;
  orb: OrbState;
  toolLabel: string;
  reply: string;
  onSend: (t: string) => void;
  onClose: () => void;
}) {
  const [muted, setMuted] = useState(false);
  const [finalText, setFinal] = useState("");
  const [interim, setInterim] = useState("");
  const [spoken, setSpoken] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [typed, setTyped] = useState("");
  const recRef = useRef<SR | null>(null);
  const supported =
    typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // listen
  useEffect(() => {
    if (!supported || muted || running) return;
    const w = window as unknown as Record<string, (new () => SR) | undefined>;
    const Ctor = w["SpeechRecognition"] ?? w["webkitSpeechRecognition"];
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    let acc = "";
    rec.onresult = (e) => {
      let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) acc += r[0].transcript;
        else tmp += r[0].transcript;
      }
      setFinal(acc);
      setInterim(tmp);
    };
    rec.onend = () => {
      if (acc.trim()) onSend(acc.trim());
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
    return () => rec.stop();
  }, [supported, muted, running, onSend]);

  // reveal reply word by word, speak it aloud
  const words = reply.split(/(\s+)/);
  useEffect(() => {
    if (!reply) return setSpoken(0);
    const t = setInterval(() => setSpoken((s) => Math.min(words.length, s + 1)), 140);
    return () => clearInterval(t);
  }, [reply, words.length]);
  useEffect(() => {
    if (running || !reply || muted || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(reply);
    speechSynthesis.speak(u);
    return () => speechSynthesis.cancel();
  }, [running, reply, muted]);

  const state: OrbState = muted ? "paused" : running ? (reply ? "speaking" : orb) : "listening";
  const label = muted ? "Muted" : running ? (reply ? "Speaking" : "Working") : "Listening";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center bg-background/70 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Voice mode"
    >
      <header className="flex w-full max-w-3xl items-center justify-between p-5">
        <IconButton label="Close voice mode" variant="glass" className="rounded-2xl" onClick={onClose}>
          <X className="size-5" aria-hidden />
        </IconButton>
        <p className="label-mono text-muted-foreground" aria-live="polite">
          {label}
        </p>
        <IconButton
          label={captions ? "Hide captions" : "Show captions"}
          variant="glass"
          className={cn("rounded-2xl font-mono text-xs", captions && "bg-foreground/5")}
          onClick={() => setCaptions((c) => !c)}
        >
          CC
        </IconButton>
      </header>

      <div className="relative mt-[6vh] grid size-[min(70vw,360px)] place-items-center">
        {!muted &&
          [0, 1.2, 2.4].map((d) => <span key={d} className="voice-ring" style={{ animationDelay: `${d}s` }} />)}
        <Orb size={220} state={state} />
      </div>

      <div className="mt-10 max-w-xl px-6 text-center text-2xl leading-snug tracking-tight sm:text-3xl" aria-live="polite">
        {captions &&
          (reply ? (
            <>
              {words.slice(0, spoken).join("")}
              <span className="text-muted-foreground">{words.slice(spoken).join("")}</span>
            </>
          ) : (
            <>
              {finalText}
              <span className="text-muted-foreground">{interim || (!finalText && "Say what you need")}</span>
            </>
          ))}
      </div>

      {running && toolLabel && (
        <div className="glass mt-6 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm">
          <span className="size-1.5 rounded-full bg-foreground" /> {toolLabel}
        </div>
      )}

      {!supported && !running && (
        <form
          className="glass mt-6 flex w-[min(90vw,420px)] rounded-full p-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) onSend(typed.trim());
            setTyped("");
          }}
        >
          <input
            aria-label="Type instead of speaking"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Voice isn't available here, type instead"
            className="min-h-11 flex-1 bg-transparent px-4 text-sm outline-none"
          />
        </form>
      )}

      <div className="mt-auto flex items-center gap-6 pb-10">
        <IconButton label={muted ? "Unmute" : "Mute"} variant="glass" className="size-16" onClick={() => setMuted((m) => !m)}>
          {muted ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
        </IconButton>
        <IconButton label="End voice mode" variant="primary" className="size-20" onClick={onClose}>
          <X className="size-6" aria-hidden />
        </IconButton>
        <IconButton label="Search the web" variant="glass" className="size-16" onClick={() => onSend("Search the web for: " + (finalText || "latest news"))}>
          <Search className="size-5" aria-hidden />
        </IconButton>
      </div>
    </motion.div>
  );
}
