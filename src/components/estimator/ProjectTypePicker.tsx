"use client";
import { cn } from "@/lib/cn";

export const PROJECT_TYPES = [
  "Roofing",
  "Kitchen",
  "Bath",
  "Decking",
  "Fencing",
  "Siding",
  "Windows",
  "Flooring",
  "Painting",
  "Other",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export function ProjectTypePicker({
  value,
  onChange,
}: {
  value: ProjectType | null;
  onChange: (t: ProjectType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_TYPES.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn(
              "rounded-full h-9 px-4 text-[13px] font-medium transition-all hairline",
              active
                ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent shadow-[0_2px_8px_-4px_rgba(17,17,19,0.35)]"
                : "bg-white/60 dark:bg-white/[0.03] text-[color:var(--ink-soft)] hover:bg-black/[0.04]",
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
