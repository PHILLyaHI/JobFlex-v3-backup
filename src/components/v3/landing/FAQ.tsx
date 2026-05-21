"use client";

import { useState } from "react";
import { Minus, Plus, Square } from "lucide-react";
import { faq } from "@/lib/v3/landing-copy";

export function FAQ() {
  const defaultIndex = Math.max(
    0,
    faq.items.findIndex((i) => i.defaultOpen),
  );
  const [openIndex, setOpenIndex] = useState<number | null>(
    defaultIndex >= 0 ? defaultIndex : 0,
  );

  return (
    <section className="relative isolate overflow-hidden bg-[color:var(--ink)] pb-32 pt-4 lg:pb-40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)",
          backgroundSize: "12px 12px",
        }}
      />
      <div className="relative mx-auto max-w-[920px] px-6 lg:px-10">
        <ul className="divide-y divide-white/12">
          {faq.items.map((item, i) => {
            const open = openIndex === i;
            return (
              <li key={item.q} className="border-t border-white/12 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  aria-expanded={open}
                  className="group flex w-full items-center gap-4 px-3 py-5 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <Square
                    className={
                      "h-3 w-3 shrink-0 transition-colors " +
                      (open
                        ? "fill-[color:var(--accent)] text-[color:var(--accent)]"
                        : "text-white/40")
                    }
                    strokeWidth={1.5}
                  />
                  <span
                    className={
                      "flex-1 font-display text-[16px] font-medium tracking-[-0.005em] transition-colors sm:text-[18px] " +
                      (open ? "text-[color:var(--paper)]" : "text-white/55 group-hover:text-white/80")
                    }
                  >
                    {item.q}
                  </span>
                  <span
                    aria-hidden
                    className={
                      "grid h-7 w-7 shrink-0 place-items-center rounded-[5px] border transition-all duration-200 " +
                      (open
                        ? "rotate-90 border-white/30 bg-white/5 text-white"
                        : "border-white/15 text-white/55 group-hover:border-white/30 group-hover:text-white")
                    }
                  >
                    {open ? (
                      <Minus className="h-3 w-3" strokeWidth={1.5} />
                    ) : (
                      <Plus className="h-3 w-3" strokeWidth={1.5} />
                    )}
                  </span>
                </button>
                <div
                  className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                >
                  <div className="min-h-0">
                    <div className="pb-6 pl-10 pr-12 text-[14px] leading-[1.65] text-white/65">
                      {item.a}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
