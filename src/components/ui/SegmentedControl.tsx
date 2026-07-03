"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  /** accent = filled sage pill + white label; surface = white pill + ink label. */
  variant?: "accent" | "surface";
  className?: string;
  "aria-label": string;
}

// A small radio-group with a sliding pill. The active pill is a `layoutId`'d
// motion element so it glides between options; the id is per-instance (useId)
// so two controls on screen never animate the pill between each other.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  variant = "accent",
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const reduce = useReducedMotion();
  const pillId = React.useId();
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const move = (i: number) => {
    const n = options.length;
    const idx = ((i % n) + n) % n;
    refs.current[idx]?.focus();
    onChange(options[idx].value);
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(options.length - 1);
    }
  };

  const sizeCls = size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-3.5 text-[13px]";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-[var(--r-md)] p-0.5 hairline bg-[color:var(--paper-deep)] ${className ?? ""}`}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative inline-flex items-center justify-center gap-1.5 rounded-[var(--r-sm)] ${sizeCls} font-medium transition-colors ${
              active
                ? variant === "accent"
                  ? "text-white"
                  : "text-[color:var(--ink)]"
                : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${pillId}`}
                className={`absolute inset-0 rounded-[var(--r-sm)] ${
                  variant === "accent"
                    ? "bg-[color:var(--accent)]"
                    : "bg-white shadow-[var(--shadow-sm)]"
                }`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
