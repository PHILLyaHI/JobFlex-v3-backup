import { Hammer, Leaf, Shield, Star } from "lucide-react";
import { trustedBy } from "@/lib/v3/landing-copy";
import { PlusCorner } from "./_primitives/PlusCorner";

type WordmarkStyle = {
  Icon?: typeof Leaf;
  font: "display" | "sans";
  weight: 400 | 500 | 600 | 700;
  caps: boolean;
  italic: boolean;
  tracking: string;
  size: string;
};

const WORDMARK_TREATMENTS: WordmarkStyle[] = [
  { Icon: Leaf, font: "display", weight: 500, caps: false, italic: true, tracking: "-0.015em", size: "text-[15px]" },
  { font: "display", weight: 700, caps: false, italic: false, tracking: "-0.02em", size: "text-[16px]" },
  { font: "display", weight: 400, caps: false, italic: true, tracking: "-0.01em", size: "text-[14px]" },
  { Icon: Hammer, font: "sans", weight: 600, caps: true, italic: false, tracking: "0.08em", size: "text-[11px]" },
  { Icon: Star, font: "display", weight: 500, caps: false, italic: false, tracking: "-0.02em", size: "text-[15px]" },
  { Icon: Shield, font: "display", weight: 700, caps: false, italic: false, tracking: "-0.025em", size: "text-[15px]" },
];

const SCROLLER_WORDMARKS = [
  ...trustedBy.wordmarks,
  ...trustedBy.wordmarks,
];

const SCROLLER_TREATMENTS: WordmarkStyle[] = [
  ...WORDMARK_TREATMENTS,
  ...WORDMARK_TREATMENTS,
];

export function TrustedByStrip() {
  return (
    <section className="relative bg-[color:var(--paper)]">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="relative border-y border-[color:var(--ink-line)]/70 py-4">
          <PlusCorner position="tl" tone="light" size={11} />
          <PlusCorner position="tr" tone="light" size={11} />
          <PlusCorner position="bl" tone="light" size={11} />
          <PlusCorner position="br" tone="light" size={11} />

          {/* Desktop: single-row strip */}
          <div className="hidden items-center gap-8 md:flex">
            <span className="quiet-caps shrink-0 text-[color:var(--ink-muted)]">
              {trustedBy.label}
            </span>
            <span aria-hidden className="h-3 w-px shrink-0 bg-[color:var(--ink-line)]" />
            <ul className="flex flex-1 items-center justify-between gap-6 overflow-hidden">
              {trustedBy.wordmarks.map((mark, i) => (
                <Wordmark key={mark} text={mark} treatment={WORDMARK_TREATMENTS[i] ?? WORDMARK_TREATMENTS[0]} />
              ))}
            </ul>
            <span aria-hidden className="h-3 w-px shrink-0 bg-[color:var(--ink-line)]" />
            <span className="quiet-caps shrink-0 text-[color:var(--ink-muted)]">
              + 1,240 shops
            </span>
          </div>

          {/* Mobile: continuous marquee */}
          <div className="md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <span className="quiet-caps text-[color:var(--ink-muted)]">
                {trustedBy.label}
              </span>
              <span className="quiet-caps text-[color:var(--ink-muted)]">
                +1.2k shops
              </span>
            </div>
            <div className="relative overflow-hidden">
              <div
                className="flex w-max items-center gap-8"
                style={{ animation: "ticker 32s linear infinite" }}
              >
                {SCROLLER_WORDMARKS.map((mark, i) => (
                  <Wordmark
                    key={`${mark}-${i}`}
                    text={mark}
                    treatment={
                      SCROLLER_TREATMENTS[i] ?? SCROLLER_TREATMENTS[0]
                    }
                  />
                ))}
              </div>
              {/* edge fades */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[color:var(--paper)] to-transparent"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[color:var(--paper)] to-transparent"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Wordmark({ text, treatment }: { text: string; treatment: WordmarkStyle }) {
  const { Icon, font, weight, caps, italic, tracking, size } = treatment;
  const fontClass = font === "display" ? "font-display" : "font-sans";
  const italicClass = italic ? "italic" : "";
  const capsClass = caps ? "uppercase" : "";

  return (
    <li className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[color:var(--ink-muted)] opacity-80 transition-opacity hover:opacity-100">
      {Icon ? (
        <Icon
          className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-faint)]"
          aria-hidden
          strokeWidth={1.5}
        />
      ) : null}
      <span
        className={`${fontClass} ${italicClass} ${capsClass} ${size} leading-none`}
        style={{ fontWeight: weight, letterSpacing: tracking }}
      >
        {text}
      </span>
    </li>
  );
}
