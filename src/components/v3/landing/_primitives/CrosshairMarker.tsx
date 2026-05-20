import { cn } from "@/lib/cn";

type Props = {
  size?: number;
  className?: string;
};

export function CrosshairMarker({ size = 10, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn("inline-block text-[color:var(--ink-faint)]", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M5 0V10M0 5H10" stroke="currentColor" strokeWidth="0.5" />
      </svg>
    </span>
  );
}
