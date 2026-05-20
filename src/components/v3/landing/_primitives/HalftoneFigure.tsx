import { useId } from "react";
import { cn } from "@/lib/cn";

type Variant =
  | "wallpaper-left"
  | "wallpaper-right"
  | "monolith"
  | "portrait"
  | "window"
  | "wordmark"
  | "diamond"
  | "stack"
  | "spark";

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
  // Tall asymmetric monolith — single dominant peak with a smaller
  // foothill, like a stylized obelisk fronted by a buttress.
  const segments = 80;
  const points: string[] = [`M 0 ${height}`];
  const peakCenter = 0.52;
  const peakWidth = 0.18;
  const peakHeight = 0.94;
  const foothillCenter = 0.22;
  const foothillWidth = 0.16;
  const foothillHeight = 0.42;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Sharp asymmetric peak (steeper on left, gentler on right)
    const peakOffset = (t - peakCenter) / peakWidth;
    const peakSkew = peakOffset < 0 ? 1.05 : 1.55;
    const peak = Math.exp(-Math.pow(Math.abs(peakOffset), peakSkew) * 1.8);
    // Smaller smooth foothill
    const foothill =
      Math.exp(-Math.pow((t - foothillCenter) / foothillWidth, 2) * 2.2) *
      foothillHeight;
    // Subtle base undulation so the silhouette isn't perfectly flat
    const base = 0.06 + 0.04 * Math.sin(t * Math.PI * 4 + seed);
    const composite = Math.max(base, peak * peakHeight, foothill);
    const y = Math.max(0, height - composite * height);
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

function diamondPath(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const w = Math.min(width, height) * 0.45;
  return [
    `M ${cx} ${cy - w}`,
    `L ${cx + w * 0.78} ${cy}`,
    `L ${cx} ${cy + w}`,
    `L ${cx - w * 0.78} ${cy}`,
    "Z",
  ].join(" ");
}

function stackPath(width: number, height: number) {
  const barH = height * 0.18;
  const gap = height * 0.08;
  const startY = (height - (3 * barH + 2 * gap)) / 2;
  const inset = width * 0.08;
  const parts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const y = startY + i * (barH + gap);
    const w = width - inset * 2 - i * width * 0.04;
    parts.push(
      `M ${inset + (i * width * 0.02)} ${y}`,
      `L ${inset + (i * width * 0.02) + w} ${y}`,
      `L ${inset + (i * width * 0.02) + w} ${y + barH}`,
      `L ${inset + (i * width * 0.02)} ${y + barH}`,
      "Z",
    );
  }
  return parts.join(" ");
}

function sparkPath(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.42;
  const inner = r * 0.32;
  const arms = 4;
  const points: string[] = [];
  for (let i = 0; i < arms * 2; i++) {
    const angle = (i * Math.PI) / arms - Math.PI / 2;
    const radius = i % 2 === 0 ? r : inner;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  points.push("Z");
  return points.join(" ");
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
  else if (variant === "diamond") shapePath = diamondPath(width, height);
  else if (variant === "stack") shapePath = stackPath(width, height);
  else if (variant === "spark") shapePath = sparkPath(width, height);

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
