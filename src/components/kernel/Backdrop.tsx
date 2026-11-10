/** Soft Cloud Slate circles and hairline rings that give the glass something to blur. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute -right-[12vw] -top-[18vw] h-[58vw] w-[58vw] rounded-full bg-slate/30" />
      <div className="absolute -bottom-[22vw] -left-[10vw] h-[46vw] w-[46vw] rounded-full bg-whisper/80" />
      {[38, 62, 88, 118].map((v, i) => (
        <div
          key={v}
          className="absolute left-1/2 top-[55%] rounded-full border border-hairline"
          style={{ width: `${v}vw`, height: `${v}vw`, transform: "translate(-50%,-50%)", opacity: 1 - i * 0.18 }}
        />
      ))}
    </div>
  );
}
