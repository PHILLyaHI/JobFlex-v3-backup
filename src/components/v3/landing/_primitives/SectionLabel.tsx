import { cn } from "@/lib/cn";

type Props = {
  children: string;
  tone?: "light" | "dark";
  className?: string;
};

export function SectionLabel({ children, tone = "light", className }: Props) {
  const textTone =
    tone === "light"
      ? "text-[color:var(--ink-muted)]"
      : "text-[color:var(--ink-faint)]";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 select-none",
        textTone,
        className,
      )}
    >
      <span
        aria-hidden
        className="block h-[5px] w-3 bg-[color:var(--accent)]"
      />
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] leading-none">
        {children}
      </span>
    </div>
  );
}
