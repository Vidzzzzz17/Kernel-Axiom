import { forwardRef, useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Plus, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./ui";

interface Props {
  running?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  onVoice?: () => void;
  placeholder?: string | undefined;
  hint?: boolean;
  className?: string;
  draft?: { text: string; nonce: number } | null;
}

export const Composer = forwardRef<HTMLTextAreaElement, Props>(
  ({ running, onSend, onStop, onVoice, placeholder = "Ask Kernel Axiom to do something", hint, className, draft }, ref) => {
    const [value, setValue] = useState("");
    const [fileError, setFileError] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (draft) setValue(draft.text); }, [draft]);
    const submit = () => {
      const t = value.trim();
      if (!t) return;
      onSend(t);
      setValue("");
    };
    return (
      <div className={className}><form
        className={cn("glass flex items-end gap-1 rounded-[28px] p-1.5")}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.log" className="hidden" onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          setFileError("");
          if (file.size > 100000) setFileError("Choose a text file smaller than 100 KB.");
          else try { const text = await file.text(); setValue(v => `${v}${v ? "\n\n" : ""}Attached file: ${file.name}\n\n${text}`); }
          catch { setFileError("Couldn't read this file."); }
          e.target.value = "";
        }} />
        <IconButton type="button" label="Attach text file" onClick={() => fileRef.current?.click()} className="text-muted-foreground">
          <Plus className="size-5" aria-hidden />
        </IconButton>
        <label className="sr-only" htmlFor="composer">
          Message
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        />
        {hint && !value && (
          <kbd className="mb-3 mr-1 hidden font-mono text-xs text-muted-foreground sm:block">⌘K</kbd>
        )}
        {onVoice && !running && (
          <IconButton type="button" label="Voice mode" onClick={onVoice}>
            <Mic className="size-5" aria-hidden />
          </IconButton>
        )}
        {running ? (
          <IconButton type="button" variant="primary" label="Stop" onClick={onStop}>
            <Square className="size-4 fill-current" aria-hidden />
          </IconButton>
        ) : (
          <IconButton type="submit" variant="primary" label="Send" disabled={!value.trim()}>
            <ArrowUp className="size-5" aria-hidden />
          </IconButton>
        )}
      </form>{fileError && <p role="alert" className="mt-2 text-sm text-destructive">{fileError}</p>}</div>
    );
  },
);
Composer.displayName = "Composer";
