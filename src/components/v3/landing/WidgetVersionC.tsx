"use client";

import React from "react";

export function WidgetVersionC() {
  return (
    <div className="relative w-full h-[320px] rounded-2xl border border-neutral-200/60 bg-gradient-to-br from-neutral-50 via-neutral-100/50 to-neutral-200/30 overflow-hidden shadow-sm flex items-start justify-start p-6">
      {/* Subtle grid pattern background */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(var(--ink) 1px, transparent 1px)`,
          backgroundSize: "16px 16px"
        }}
      />

      {/* Back Layer: App window, heavily cropped (bleeds right and bottom) */}
      <div 
        className="absolute left-6 top-8 w-[400px] h-[200px] rounded-xl border border-neutral-200/80 bg-white shadow-lg flex flex-col overflow-hidden transition-all duration-300"
        style={{
          boxShadow: "0 10px 25px -5px rgba(20, 24, 31, 0.08), 0 1px 3px rgba(20, 24, 31, 0.03)"
        }}
      >
        {/* App Chrome: Browser Traffic Lights & URL */}
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2 shrink-0">
          <div className="flex gap-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-[#FF5F57]/90" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/90" />
            <span className="h-2 w-2 rounded-full bg-[#28C840]/90" />
          </div>
          <div className="flex-1 max-w-[160px] mx-auto bg-neutral-200/40 rounded px-3 py-0.5 text-center text-[9.5px] text-neutral-400 font-mono select-none truncate">
            app.jobflex.com/dashboard
          </div>
          <div className="w-10 shrink-0" />
        </div>

        {/* Slim App Nav */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-display text-[12px] font-bold tracking-tight text-[color:var(--ink)]">
              jobflex
            </span>
            <div className="flex gap-2 text-[10px] font-medium text-neutral-400">
              <span className="text-[color:var(--accent)] border-b border-[color:var(--accent)] pb-1.5 pt-0.5 px-0.5">
                Dashboard
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard Content: Greeting & Collected Money */}
        <div className="p-4 flex flex-col gap-3 min-w-0">
          <span className="text-[13px] font-bold tracking-tight text-[color:var(--ink-soft)] font-display truncate">
            Good morning, Reyes & Sons
          </span>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-medium">
              Collected this month
            </span>
            <span className="text-[22px] font-bold font-display text-[color:var(--ink)] leading-none mt-0.5 tabular">
              $48,210
            </span>
          </div>
        </div>
      </div>

      {/* Front Layer: Floating "This week" calendar card overlapping the window's lower-middle edge */}
      <div 
        className="absolute left-12 top-[125px] w-[290px] bg-white border border-neutral-100 rounded-xl p-3 flex flex-col gap-2 shadow-2xl transition-all duration-300 hover:translate-y-[-1px]"
        style={{
          boxShadow: "0 25px 50px -12px rgba(20, 24, 31, 0.18), 0 3px 9px rgba(20, 24, 31, 0.05)"
        }}
      >
        <div className="flex items-center justify-between border-b border-neutral-50 pb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">This week</span>
          {/* Subtle dots for pagination/more */}
          <div className="flex gap-1">
            <span className="h-1 w-1 rounded-full bg-neutral-300" />
            <span className="h-1 w-1 rounded-full bg-neutral-300" />
          </div>
        </div>

        {/* 5 Day Grid inside Card */}
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {["M", "T", "W", "T", "F"].map((day, idx) => {
            const isToday = idx === 2;
            return (
              <div key={idx} className="flex flex-col gap-1">
                <span className={`text-[8.5px] font-bold ${isToday ? "text-[color:var(--accent)]" : "text-neutral-400"}`}>
                  {day}
                </span>
                <div 
                  className={`h-14 rounded-md border flex flex-col items-center justify-between p-1 ${
                    isToday 
                      ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/30" 
                      : "bg-neutral-50/50 border-neutral-100"
                  }`}
                >
                  {idx === 0 && (
                    <div className="w-full bg-blue-50 border border-blue-100 rounded p-0.5 text-left flex flex-col justify-between h-full">
                      <span className="text-[7.5px] font-bold text-blue-800 leading-none truncate">Nguyen</span>
                      <span className="self-end h-2.5 w-2.5 rounded-full bg-blue-200 flex items-center justify-center text-[6px] font-bold text-blue-800">M</span>
                    </div>
                  )}
                  {idx === 2 && (
                    <div className="w-full bg-amber-50 border border-amber-100 rounded p-0.5 text-left flex flex-col justify-between h-full">
                      <span className="text-[7.5px] font-bold text-amber-800 leading-none truncate">Ortiz</span>
                      <span className="self-end h-2.5 w-2.5 rounded-full bg-amber-200 flex items-center justify-center text-[6px] font-bold text-amber-800">S</span>
                    </div>
                  )}
                  {!isToday && idx !== 0 && (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="h-1.0 w-1.0 rounded-full bg-neutral-200/60" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Element: Small "Crew assigned ✓" pill on the calendar card */}
      <div 
        className="absolute left-[245px] top-[108px] bg-emerald-50 border border-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md transition-all duration-300 hover:translate-y-[-1px]"
        style={{
          boxShadow: "0 4px 10px rgba(16, 185, 129, 0.15)"
        }}
      >
        <span className="text-[8.5px] font-bold tracking-tight">Crew assigned ✓</span>
      </div>
    </div>
  );
}
