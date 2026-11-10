import type { OrbState } from "@/lib/kernel/types";
import { cn } from "@/lib/utils";

/** The Kernel Axiom orb. States only change eyes and posture, never colors. */
export function Orb({ size = 32, state = "idle", className }: { size?: number; state?: OrbState; className?: string }) {
  return (
    <div
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
