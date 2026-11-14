import { Minus, Square, X } from "lucide-react";
import { IconButton } from "./ui";
import kernelLogo from "@/assets/kernel-logo.png";

/** Custom frameless-window title bar. Only renders inside the desktop app. */
export function TitleBar() {
  const w = typeof window !== "undefined" ? window.kernel?.window : undefined;
  if (!w) return null;
  return (
    <div className="glass-soft flex h-10 items-center justify-between pl-4 [-webkit-app-region:drag]">
      <span className="label-mono flex items-center gap-2 text-muted-foreground"><img src={kernelLogo} alt="" className="size-6 rounded-md" />Kernel Axiom</span>
      <div className="flex [-webkit-app-region:no-drag]">
        <IconButton label="Minimize" className="h-10 rounded-none" onClick={() => w.minimize()}>
          <Minus className="size-4" aria-hidden />
        </IconButton>
        <IconButton label="Maximize" className="h-10 rounded-none" onClick={() => w.toggleMaximize()}>
          <Square className="size-3.5" aria-hidden />
        </IconButton>
        <IconButton label="Close" className="h-10 rounded-none hover:bg-destructive hover:text-destructive-foreground" onClick={() => w.close()}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

