import { cn } from "@/lib/utils";

/** Minimal, safe text renderer: paragraphs, inline code and _emphasis_. No HTML injection. */
export default function MessageText({ text, streaming }: { text: string; streaming?: boolean | undefined }) {
  const paras = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {paras.map((para, i) => (
        <p key={i} className={cn("rise-in whitespace-pre-wrap", streaming && i === paras.length - 1 && "caret")}>
          {para.split(/(`[^`]+`|_[^_]+_)/).map((part, j) =>
            part.startsWith("`") && part.endsWith("`") ? (
              <code key={j} className="rounded bg-foreground/5 px-1 font-mono text-[13px]">
                {part.slice(1, -1)}
              </code>
            ) : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? (
              <span key={j} className="text-muted-foreground">
                {part.slice(1, -1)}
              </span>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}
