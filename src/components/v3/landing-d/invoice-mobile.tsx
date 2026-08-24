"use client";

import { useEffect, useRef, useState } from "react";
import { AppWindow } from "./app-window";

export function InvoiceMobile() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const send = () => {
    if (state !== "idle") return;
    setState("sending");
    timers.current.push(setTimeout(() => setState("sent"), 700));
    timers.current.push(setTimeout(() => setState("idle"), 3800));
  };

  return (
    <AppWindow title="app.jobflex.com/invoices/1042">
      <div className="px-4 py-4">
        <div className="text-[14px] font-bold text-lp-ink">Invoice #1042</div>

        <div className="mt-4 space-y-2">
          {[
            ["Cabinet install — complete", "$4,900"],
            ["Counter template + set", "$1,500"],
          ].map(([l, r]) => (
            <div key={l} className="flex justify-between text-[12.5px]">
              <span className="text-slate-500">{l}</span>
              <span className="font-semibold text-lp-ink">{r}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3.5">
          <span className="text-[11px] font-medium text-slate-400">Total due</span>
          <span className="text-[24px] font-bold tracking-tight text-lp-ink">$6,400</span>
        </div>

        {/* Send button → success state */}
        <button
          type="button"
          onClick={send}
          className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold text-white transition-colors duration-300 ${
            state === "sent" ? "bg-emerald-600" : "bg-lp-ink"
          } ${state === "sending" ? "scale-[0.98]" : ""}`}
          style={{ transitionProperty: "background-color, transform" }}
        >
          {state === "idle" && (
            <>
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path d="M1.5 8L14.5 1.5 10 14.5l-2.6-4.4L1.5 8z" fill="currentColor" />
              </svg>
              Send invoice
            </>
          )}
          {state === "sending" && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {state === "sent" && (
            <span style={{ animation: "toast-in .3s" }} className="flex items-center gap-2">
              Successfully sent
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path d="M3 8.5l3.2 3L13 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </button>

        {/* Payment rails */}
        <div className="mt-3.5 flex items-center justify-center gap-4 text-[11px] text-slate-400">
          <span>Online payments via</span>
          <span className="flex items-center gap-3">
            <span className="rounded-md bg-[#635bff] px-2 py-[3px] text-[11px] font-bold italic tracking-tight text-white">
              stripe
            </span>
            <span className="flex items-center gap-1 font-bold text-lp-ink">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
                <rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="#fff" />
              </svg>
              Square
            </span>
          </span>
        </div>
      </div>
    </AppWindow>
  );
}
