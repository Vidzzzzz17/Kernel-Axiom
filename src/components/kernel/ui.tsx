import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "glass" | "ghost";
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm transition-[background,transform,opacity] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/85",
  glass: "glass text-foreground hover:bg-background/80",
  ghost: "text-foreground hover:bg-foreground/5",
};

export const KButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(
  ({ variant = "glass", className, ...p }, ref) => (
    <button ref={ref} className={cn(base, variants[variant], className)} {...p} />
  ),
);
KButton.displayName = "KButton";

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; label: string }
>(({ variant = "ghost", label, className, ...p }, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    className={cn(base, variants[variant], "size-11 min-w-11 px-0", className)}
    {...p}
  />
));
IconButton.displayName = "IconButton";

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const spring = { type: "spring", stiffness: 380, damping: 32 } as const;
