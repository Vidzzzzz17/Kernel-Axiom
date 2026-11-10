/** Minimal, safe text renderer: paragraphs, inline code and _emphasis_. No HTML injection. */
export default function MessageText({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
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
