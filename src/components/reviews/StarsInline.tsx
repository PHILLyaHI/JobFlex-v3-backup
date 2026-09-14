// Five stars with a fractional fill — 4.8 paints four full stars and 80% of the
// fifth. No hooks, no client boundary, no Tailwind: it renders the same inside
// a blueprint port (plain .css trees), the public reviews page and the admin
// module-CSS shell. Colours come from the tokens; pass `className` for layout.
import type { CSSProperties } from "react";

type Props = {
  value: number | null | undefined;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Filled colour; defaults to the amber token. */
  color?: string;
  /** Empty-star colour; defaults to the hairline token. */
  emptyColor?: string;
  title?: string;
};

const PATH = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

export function StarsInline({ value, size = 14, className, style, color, emptyColor, title }: Props) {
  const v = Math.max(0, Math.min(5, Number(value ?? 0)));
  const fill = color ?? "var(--amber)";
  const empty = emptyColor ?? "var(--ink-line)";
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 1, lineHeight: 0, ...style }}
      role="img"
      aria-label={title ?? `${v.toFixed(1)} out of 5 stars`}
      title={title}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const pct = Math.max(0, Math.min(1, v - (i - 1))) * 100;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path d={PATH} fill={empty} />
            {pct > 0 ? <path d={PATH} fill={fill} style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} /> : null}
          </svg>
        );
      })}
    </span>
  );
}
