import { useId } from "react";
import { cn } from "@/lib/cn";

type Variant =
  | "wallpaper-left"
  | "wallpaper-right"
  | "monolith"
  | "portrait"
  | "window"
  | "wordmark";

type Props = {
  variant: Variant;
  width: number;
  height: number;
  color?: string;
  density?: number;
  text?: string;
  className?: string;
  ariaLabel?: string;
};

function mountainPath(
  width: number,
  height: number,
  peaks: number,
  bias: "left" | "right",
  seed: number,
) {
  const segments = 64;
  const points: string[] = [`M 0 ${height}`];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const skew =
      bias === "left" ? Math.pow(1 - t, 1.35) : Math.pow(t, 1.35);
    const base =
      0.55 +
      0.32 * Math.sin(t * Math.PI * peaks + seed) +
      0.18 * Math.sin(t * Math.PI * peaks * 2.7 + seed * 1.3) +
      0.08 * Math.sin(t * Math.PI * peaks * 5.1 + seed * 0.7);
    const y = Math.max(0, height - base * skew * height * 0.92);
    points.push(`L ${(t * width).toFixed(2)} ${y.toFixed(2)}`);
  }
  points.push(`L ${width} ${height} Z`);
  return points.join(" ");
}

function silhouettePath(width: number, height: number, seed: number) {
  const segments = 56;
  const points: string[] = [`M 0 ${height}`];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const tail = 1 - Math.abs(0.5 - t) * 2;
    const ridge =
      0.45 +
      0.4 * Math.sin(t * Math.PI * 3 + seed) +
      0.22 * Math.sin(t * Math.PI * 6.5 + seed * 1.7);
    const y = Math.max(0, height - ridge * tail * height * 0.9);
    points.push(`L ${(t * width).toFixed(2)} ${y.toFixed(2)}`);
  }
  points.push(`L ${width} ${height} Z`);
  return points.join(" ");
}

function portraitPath(width: number, height: number) {
  const cx = width / 2;
  const headR = height * 0.18;
  const headY = height * 0.28;
  return [
    `M ${cx - width * 0.4} ${height}`,
    `Q ${cx - width * 0.42} ${height * 0.62} ${cx - width * 0.32} ${height * 0.55}`,
    `Q ${cx - width * 0.18} ${height * 0.5} ${cx - headR * 0.9} ${headY + headR * 0.5}`,
    `A ${headR} ${headR} 0 1 1 ${cx + headR * 0.9} ${headY + headR * 0.5}`,
    `Q ${cx + width * 0.18} ${height * 0.5} ${cx + width * 0.32} ${height * 0.55}`,
    `Q ${cx + width * 0.42} ${height * 0.62} ${cx + width * 0.4} ${height}`,
    "Z",
  ].join(" ");
}

function windowPath(width: number, height: number) {
  const r = 12;
  return [
    `M ${r} 0`,
    `L ${width - r} 0`,
    `Q ${width} 0 ${width} ${r}`,
    `L ${width} ${height - r}`,
    `Q ${width} ${height} ${width - r} ${height}`,
    `L ${r} ${height}`,
    `Q 0 ${height} 0 ${height - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    "Z",
  ].join(" ");
}

export function HalftoneFigure({
  variant,
  width,
  height,
  color,
  density = 6,
  text,
  className,
  ariaLabel,
}: Props) {
  const reactId = useId();
  const safeId = reactId.replace(/[^a-zA-Z0-9]/g, "");
  const patternId = `htpat-${safeId}`;
  const maskId = `htmask-${safeId}`;
  const fill = color ?? "var(--accent)";
  const cellW = density;
  const cellH = density * 0.66;
  const dashW = density * 0.5;
  const dashH = Math.max(1, density * 0.18);

  let shapePath = "";
  if (variant === "wallpaper-left") shapePath = mountainPath(width, height, 4, "left", 0.7);
  else if (variant === "wallpaper-right") shapePath = mountainPath(width, height, 4, "right", 2.4);
  else if (variant === "monolith") shapePath = silhouettePath(width, height, 1.2);
  else if (variant === "portrait") shapePath = portraitPath(width, height);
  else if (variant === "window") shapePath = windowPath(width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block", className)}
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <defs>
        <pattern
          id={patternId}
          width={cellW}
          height={cellH}
          patternUnits="userSpaceOnUse"
        >
          <rect
            x={(cellW - dashW) / 2}
            y={(cellH - dashH) / 2}
            width={dashW}
            height={dashH}
            fill={fill}
            rx={dashH / 2}
          />
        </pattern>
        {variant === "wordmark" ? (
          <mask id={maskId}>
            <rect width={width} height={height} fill="black" />
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="var(--font-display), system-ui, sans-serif"
              fontWeight={700}
              fontSize={height * 0.88}
              letterSpacing={-height * 0.04}
              fill="white"
            >
              {text}
            </text>
          </mask>
        ) : (
          <mask id={maskId}>
            <path d={shapePath} fill="white" />
          </mask>
        )}
      </defs>
      <rect
        width={width}
        height={height}
        fill={`url(#${patternId})`}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
