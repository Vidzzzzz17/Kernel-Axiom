import { useEffect, useRef } from "react";
import type { OrbState } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";

/** The Kernel Axiom orb. States only change eyes and posture, never colors. */
export function Orb({ size = 32, state = "idle", className, follow }: { size?: number; state?: OrbState; className?: string; follow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Eyes follow the pointer (home screen only).
  useEffect(() => {
    if (!follow || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      el.style.setProperty("--ex", `${Math.max(-0.09, Math.min(0.09, dx * 0.25))}em`);
      el.style.setProperty("--ey", `${Math.max(-0.06, Math.min(0.06, dy * 0.2))}em`);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [follow]);
  return (
    <div
      ref={ref}
      data-follow={follow || undefined}
      className={cn("orb", className)}
      data-state={state}
      style={{ fontSize: size }}
      role="img"
      aria-label={`Kernel Axiom, ${state.replace("-", " ")}`}
    >
      <div className="orb-eyes">
        <span className="orb-eye l" />
        <span className="orb-eye r" />
      </div>
    </div>
  );
}
