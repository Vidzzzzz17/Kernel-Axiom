import { forwardRef, useEffect, useState } from "react";
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
    useEffect(() => { if (draft) setValue(draft.text); }, [draft]);
    const submit = () => {
      const t = value.trim();
      if (!t) return;
      onSend(t);
      setValue("");
    };
    return (
      <form
        className={cn("glass flex items-end gap-1 rounded-[28px] p-1.5", className)}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <IconButton type="button" label="Attach" className="text-muted-foreground">
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
      </form>
    );
  },
);
Composer.displayName = "Composer";
