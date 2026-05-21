"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { testimonials } from "@/lib/v3/landing-copy";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";
import { SectionLabel } from "./_primitives/SectionLabel";
import { PlusCorner } from "./_primitives/PlusCorner";

const PORTRAIT_COLORS = [
  "var(--accent)",
  "var(--ink)",
  "var(--amber)",
] as const;

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const total = testimonials.quotes.length;
  const current = testimonials.quotes[index];
  const color = PORTRAIT_COLORS[index % PORTRAIT_COLORS.length];

  function next() {
    setIndex((i) => (i + 1) % total);
  }
  function prev() {
    setIndex((i) => (i - 1 + total) % total);
  }

  return (
    <section className="relative bg-[color:var(--paper)] py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-x-12 gap-y-12 px-6 lg:grid-cols-12 lg:px-10">
        {/* Halftone portrait */}
        <div className="relative lg:col-span-5">
          <div className="relative mx-auto aspect-square w-full max-w-[440px]">
            <PlusCorner position="tl" tone="light" size={11} />
            <PlusCorner position="tr" tone="light" size={11} />
            <PlusCorner position="bl" tone="light" size={11} />
            <PlusCorner position="br" tone="light" size={11} />
            <div
              key={index}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                animation:
                  "v3-portrait-fade 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
              }}
            >
              <HalftoneFigure
                variant="portrait"
                width={440}
                height={440}
                color={color}
                density={6}
                ariaLabel={`Portrait of ${current.name}`}
              />
            </div>
          </div>

          {/* Counter + arrows */}
          <div className="mt-10 flex items-center gap-6">
            <span className="font-display text-[44px] font-medium leading-none tabular-nums tracking-[-0.03em] text-[color:var(--ink)]">
              {index + 1}
              <span className="text-[color:var(--ink-muted)]">/{total}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prev}
                aria-label="Previous testimonial"
                className="group inline-grid h-10 w-10 place-items-center border border-[color:var(--ink-line)] text-[color:var(--ink-soft)] transition-colors hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)]"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                }}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next testimonial"
                className="group inline-grid h-10 w-10 place-items-center border border-[color:var(--ink-line)] text-[color:var(--ink-soft)] transition-colors hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)]"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                }}
              >
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Quote */}
        <div className="lg:col-span-7 lg:pl-6">
          <SectionLabel tone="light">{testimonials.label}</SectionLabel>

          <blockquote
            key={`q-${index}`}
            className="mt-8 font-display text-[28px] leading-[1.22] tracking-[-0.02em] text-[color:var(--ink)] sm:text-[32px] lg:text-[40px]"
            style={{
              animation:
                "v3-quote-fade 460ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
            }}
          >
            <span>{current.lead}</span>{" "}
            <span className="v3-italic text-[color:var(--ink-soft)]">
              {current.accent}
            </span>
            {current.tail ? <span>{current.tail}</span> : null}
          </blockquote>

          <div className="mt-10 flex items-baseline justify-end gap-1 text-right text-[12px] uppercase tracking-[0.1em] text-[color:var(--ink-muted)]">
            <span className="font-display text-[14px] font-medium normal-case tracking-[-0.01em] text-[color:var(--ink)]">
              {current.name}
            </span>
            <span aria-hidden className="mx-2 inline-block h-3 w-px bg-[color:var(--ink-line)]" />
            <span>{current.role}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
