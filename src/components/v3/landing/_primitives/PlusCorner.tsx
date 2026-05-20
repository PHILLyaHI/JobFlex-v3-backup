import { cn } from "@/lib/cn";

type Position = "tl" | "tr" | "bl" | "br";

type Props = {
  position: Position;
  size?: number;
  tone?: "light" | "dark";
  className?: string;
};

const POS: Record<Position, string> = {
  tl: "-top-[6px] -left-[6px]",
  tr: "-top-[6px] -right-[6px]",
  bl: "-bottom-[6px] -left-[6px]",
  br: "-bottom-[6px] -right-[6px]",
};

export function PlusCorner({
  position,
  size = 12,
  tone = "light",
  className,
}: Props) {
  const color =
    tone === "light"
      ? "text-[color:var(--ink-faint)]"
      : "text-[color:var(--ink-line)]";
  return (
    <span
      aria-hidden
      className={cn("absolute pointer-events-none", POS[position], color, className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 1V11M1 6H11"
          stroke="currentColor"
          strokeWidth="0.75"
          strokeLinecap="square"
        />
      </svg>
    </span>
  );
}
