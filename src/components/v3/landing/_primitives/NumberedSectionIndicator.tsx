import { cn } from "@/lib/cn";

type Props = {
  number: string;
  tone?: "light" | "dark";
  className?: string;
};

export function NumberedSectionIndicator({
  number,
  tone = "light",
  className,
}: Props) {
  const numColor =
    tone === "light"
      ? "text-[color:var(--ink)]"
      : "text-[color:var(--paper)]";
  return (
    <div
      className={cn(
        "inline-flex flex-col items-start gap-3 select-none",
        className,
      )}
    >
      <span
        className={cn(
          "font-display text-[14px] font-medium leading-none tabular-nums tracking-[-0.005em]",
          numColor,
        )}
      >
        {number}
      </span>
      <span
        aria-hidden
        className="block h-9 w-px bg-[color:var(--accent)]"
      />
    </div>
  );
}
