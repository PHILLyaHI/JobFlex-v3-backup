"use client";
import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

interface DisplayProps {
  value: number; // 0-5
  size?: number;
  className?: string;
}

export function StarRating({ value, size = 14, className }: DisplayProps) {
  const rating = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={size}
          height={size}
          className={cn(
            i <= rating ? "text-amber-500 fill-amber-500" : "text-[color:var(--ink-line)] fill-transparent",
          )}
        />
      ))}
    </div>
  );
}

interface PickerProps {
  value: number;
  onChange: (v: number) => void;
  size?: number;
  disabled?: boolean;
}

export function StarRatingPicker({ value, onChange, size = 36, disabled }: PickerProps) {
  const [hover, setHover] = React.useState(0);
  const active = hover || value;
  return (
    <div
      className="inline-flex items-center gap-2"
      onMouseLeave={() => setHover(0)}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i === 1 ? "" : "s"}`}
          disabled={disabled}
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          className={cn(
            "transition-all rounded-[var(--r-sm)] p-0.5 focus-ring",
            disabled ? "pointer-events-none" : "hover:-translate-y-0.5 active:translate-y-0",
          )}
        >
          <Star
            width={size}
            height={size}
            className={cn(
              "transition-colors",
              i <= active
                ? "text-amber-500 fill-amber-500"
                : "text-[color:var(--ink-line)] fill-transparent",
            )}
          />
        </button>
      ))}
    </div>
  );
}
