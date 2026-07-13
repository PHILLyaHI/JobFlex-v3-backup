"use client";

import React from "react";

export function WidgetVersionB() {
  return (
    <div className="relative w-full h-[320px] rounded-2xl border border-neutral-200/60 bg-gradient-to-br from-neutral-50 via-neutral-100/50 to-neutral-200/30 overflow-hidden shadow-sm flex items-center justify-center p-6">
      {/* Subtle grid pattern background */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(var(--ink) 1px, transparent 1px)`,
          backgroundSize: "16px 16px"
        }}
      />

      {/* Real scale app window, bleeding off the bottom edge */}
      <div 
        className="absolute left-4 right-4 top-8 h-[300px] rounded-xl border border-neutral-200 bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-300"
        style={{
          boxShadow: "0 20px 40px -15px rgba(20, 24, 31, 0.12), 0 1px 3px rgba(20, 24, 31, 0.05)"
        }}
      >
        {/* App Chrome: Browser Traffic Lights & URL */}
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2 shrink-0">
          <div className="flex gap-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-[#FF5F57]/90" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/90" />
            <span className="h-2 w-2 rounded-full bg-[#28C840]/90" />
          </div>
          <div className="flex-1 max-w-[200px] mx-auto bg-neutral-200/40 rounded px-3 py-0.5 text-center text-[10px] text-neutral-400 font-mono select-none truncate">
            app.jobflex.com/dashboard
          </div>
          <div className="w-10 shrink-0" />
        </div>

        {/* Zone 2: Slim Top Bar inside App Window */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <span className="font-display text-[13px] font-bold tracking-tight text-[color:var(--ink)]">
              jobflex
            </span>
            {/* Small Stat Pill */}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-medium text-emerald-800 border border-emerald-100">
              4 crews out today
            </span>
          </div>
          {/* User Avatar */}
          <div className="h-5 w-5 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-[9px] font-bold text-[color:var(--ink-soft)] font-display shrink-0">
            R
          </div>
        </div>

        {/* Hero: Large Week Schedule */}
        <div className="flex-1 p-3 flex flex-col min-h-0 bg-neutral-50/30">
          {/* 5 Day Grid */}
          <div className="grid grid-cols-5 gap-2 text-center h-full">
            {/* Day columns */}
            {["M", "T", "W", "T", "F"].map((day, idx) => {
              const isToday = idx === 2; // Wednesday is today
              return (
                <div key={idx} className="flex flex-col gap-1 h-full min-h-0">
                  <span className={`text-[10px] font-bold ${isToday ? "text-[color:var(--accent)]" : "text-neutral-400"}`}>
                    {day}
                  </span>
                  <div 
                    className={`flex-1 rounded-lg border flex flex-col gap-1.5 p-1 pb-10 transition-all ${
                      isToday 
                        ? "bg-[color:var(--accent-soft)]/30 border-[color:var(--accent)]/30" 
                        : "bg-white border-neutral-100"
                    }`}
                  >
                    {/* Mon: Nguyen Kitchen */}
                    {idx === 0 && (
                      <div className="w-full bg-blue-50/70 border border-blue-100/50 rounded-md p-1.5 text-left flex flex-col justify-between h-[52px]">
                        <span className="text-[9px] font-semibold text-blue-900 leading-tight truncate">Nguyen</span>
                        <span className="self-end h-3.5 w-3.5 rounded-full bg-blue-200/80 flex items-center justify-center text-[7.5px] font-bold text-blue-800">M</span>
                      </div>
                    )}

                    {/* Wed (Today): Ortiz Bath */}
                    {idx === 2 && (
                      <div className="w-full bg-amber-50/70 border border-amber-100/50 rounded-md p-1.5 text-left flex flex-col justify-between h-[52px]">
                        <span className="text-[9px] font-semibold text-amber-900 leading-tight truncate">Ortiz</span>
                        <span className="self-end h-3.5 w-3.5 rounded-full bg-amber-200/80 flex items-center justify-center text-[7.5px] font-bold text-amber-800">S</span>
                      </div>
                    )}

                    {/* Thu: Kowalski block (where details float) */}
                    {idx === 3 && (
                      <div className="w-full bg-neutral-100 border border-neutral-200/80 rounded-md p-1.5 text-left flex flex-col justify-between h-[52px]">
                        <span className="text-[9px] font-semibold text-neutral-800 leading-tight truncate">Kowalski</span>
                        <span className="self-end h-3.5 w-3.5 rounded-full bg-neutral-300 flex items-center justify-center text-[7.5px] font-bold text-neutral-800">R</span>
                      </div>
                    )}

                    {/* Fri: Visibly being assigned block */}
                    {idx === 4 && (
                      <div className="w-full border border-dashed border-neutral-300 rounded-md p-1 text-center flex flex-col items-center justify-center h-[52px] bg-neutral-50/30">
                        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 py-0.5 text-[8px] font-bold text-emerald-700 border border-emerald-100 animate-pulse">
                          Assign → M
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Element: Detail Panel over the Kowalski job (on Thu column) */}
      <div 
        className="absolute left-[130px] top-[145px] w-[185px] bg-white border border-neutral-100 rounded-lg p-2.5 flex flex-col gap-1 shadow-2xl transition-all duration-300 hover:translate-y-[-1px]"
        style={{
          boxShadow: "0 15px 35px -5px rgba(20, 24, 31, 0.15), 0 5px 15px -3px rgba(20, 24, 31, 0.08)"
        }}
      >
        <div className="flex items-center justify-between border-b border-neutral-50 pb-1">
          <span className="text-[10px] font-bold text-[color:var(--ink)] truncate">Kowalski</span>
          <span className="h-3.5 w-3.5 rounded-full bg-neutral-200 flex items-center justify-center text-[7px] font-bold text-neutral-700">R</span>
        </div>
        <span className="text-[9.5px] text-neutral-500">tape & mud</span>
        <span className="text-[9px] font-semibold text-[color:var(--accent)] bg-[color:var(--accent-soft)]/50 self-start px-1.5 py-0.5 rounded">Thu 8 AM</span>
      </div>
    </div>
  );
}
