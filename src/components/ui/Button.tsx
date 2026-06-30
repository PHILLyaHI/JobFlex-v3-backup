"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "outline" | "danger" | "serif-link";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
  asChild?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-ink)] active:translate-y-[1px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
  ghost:
    "bg-transparent text-[color:var(--ink)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
  outline:
    "bg-transparent text-[color:var(--ink)] hairline hover:bg-black/[0.025] dark:hover:bg-white/[0.03]",
  danger:
    "bg-[color:var(--rose)] text-white hover:brightness-110 active:translate-y-[1px]",
  "serif-link":
    "bg-transparent text-[color:var(--ink)] font-display italic underline underline-offset-[5px] decoration-[color:var(--ink-faint)] hover:decoration-[color:var(--accent)] px-0",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-[var(--r-sm)]",
  md: "h-10 px-4 text-[13px] rounded-[var(--r-md)]",
  lg: "h-12 px-6 text-[14px] rounded-[var(--r-md)]",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", icon, loading, children, disabled, ...props },
  ref,
) {
  const isLink = variant === "serif-link";
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 font-medium tracking-[-0.005em] transition-all duration-200 ease-[cubic-bezier(.22,1,.36,1)] focus-ring disabled:opacity-50 disabled:pointer-events-none select-none",
        // Tactile press: a subtle scale-in on tap gives every button instant
        // feedback. Releases over the 200ms ease above. Links stay flat.
        !isLink && "active:scale-[0.98]",
        !isLink && sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="h-3 w-3 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
      )}
      {!loading && icon && <span className="shrink-0 opacity-80">{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
});
