"use client";
import {
  Home,
  ChefHat,
  Bath as BathIcon,
  Layers3,
  Fence,
  PanelsTopLeft,
  AppWindow,
  Grid3x3,
  PaintRoller,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
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

const PROJECT_TYPE_ICONS: Record<ProjectType, LucideIcon> = {
  Roofing: Home,
  Kitchen: ChefHat,
  Bath: BathIcon,
  Decking: Layers3,
  Fencing: Fence,
  Siding: PanelsTopLeft,
  Windows: AppWindow,
  Flooring: Grid3x3,
  Painting: PaintRoller,
  Other: MoreHorizontal,
};

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
        const Icon = PROJECT_TYPE_ICONS[t];
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn(
              "flex items-center gap-1.5 rounded-full h-9 pl-3.5 pr-4 text-[13px] font-medium transition-all hairline",
              active
                ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent shadow-[0_2px_8px_-4px_rgba(17,17,19,0.35)]"
                : "bg-white/60 dark:bg-white/[0.03] text-[color:var(--ink-soft)] hover:bg-black/[0.04]",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-90" : "opacity-60")} />
            {t}
          </button>
        );
      })}
    </div>
  );
}
