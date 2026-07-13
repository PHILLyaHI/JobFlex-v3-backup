"use client";

import React from "react";

export function WidgetVersionA() {
  return (
    <div className="relative w-full h-[320px] rounded-2xl border border-neutral-200/60 bg-gradient-to-br from-neutral-50 via-neutral-100/50 to-neutral-200/30 overflow-hidden shadow-sm flex items-center justify-start p-6">
      {/* Subtle grid pattern background */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(var(--ink) 1px, transparent 1px)`,
          backgroundSize: "16px 16px"
        }}
      />

      {/* Real scale app window, bleeding off the right edge */}
      <div 
        className="absolute left-6 top-8 w-[500px] h-[256px] rounded-xl border border-neutral-200 bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-300"
        style={{
          boxShadow: "0 20px 40px -15px rgba(20, 24, 31, 0.12), 0 1px 3px rgba(20, 24, 31, 0.05)"
        }}
      >
        {/* App Chrome: Browser Traffic Lights & URL */}
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2">
          {/* Traffic lights */}
          <div className="flex gap-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-[#FF5F57]/90" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/90" />
            <span className="h-2 w-2 rounded-full bg-[#28C840]/90" />
          </div>
          {/* URL bar */}
          <div className="flex-1 max-w-[200px] mx-auto bg-neutral-200/40 rounded px-3 py-0.5 text-center text-[10px] text-neutral-400 font-mono select-none truncate">
            app.jobflex.com/dashboard
          </div>
          {/* Spacer to balance */}
          <div className="w-10 shrink-0" />
        </div>

        {/* Slim App Nav */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 shrink-0">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <span className="font-display text-[13px] font-bold tracking-tight text-[color:var(--ink)]">
              jobflex
            </span>
            {/* Tabs */}
            <div className="flex gap-3 text-[11px] font-medium text-neutral-400">
              <span className="text-[color:var(--accent)] border-b-2 border-[color:var(--accent)] pb-2 pt-0.5 px-0.5">
                Dashboard
              </span>
              <span className="pb-2 pt-0.5 px-0.5">
                Schedule
              </span>
            </div>
          </div>
          {/* User Avatar */}
          <div className="h-5 w-5 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-[9px] font-bold text-[color:var(--ink-soft)] font-display shrink-0">
            R
          </div>
        </div>

        {/* Dashboard Grid Content */}
        <div className="flex-1 p-4 grid grid-cols-[180px_1fr] gap-4 min-w-0">
          {/* Hero: Money First */}
          <div className="flex flex-col justify-center min-w-0 border-r border-neutral-100 pr-4">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
              Collected this month
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-[26px] font-bold font-display tracking-tight text-[color:var(--ink)] leading-none tabular">
                $48,210
              </span>
              <span className="inline-flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
                ↑8%
              </span>
            </div>
          </div>

          {/* Zone 2: Compact Calendar Strip */}
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                This week
              </span>
            </div>
            
            {/* 5 Day Grid */}
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {/* Day headers */}
              {["M", "T", "W", "T", "F"].map((day, idx) => {
                const isToday = idx === 2; // Wednesday is today
                return (
                  <div key={idx} className="flex flex-col gap-1">
                    <span className={`text-[9px] font-bold ${isToday ? "text-[color:var(--accent)]" : "text-neutral-400"}`}>
                      {day}
                    </span>
                    <div 
                      className={`h-16 rounded-md border flex flex-col items-center justify-between p-1 transition-all ${
                        isToday 
                          ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/30" 
                          : "bg-neutral-50/50 border-neutral-100"
                      }`}
                    >
                      {/* Job Blocks */}
                      {idx === 0 && (
                        <div className="w-full bg-blue-50 border border-blue-100 rounded p-0.5 text-left flex flex-col justify-between h-full">
                          <span className="text-[8px] font-bold text-blue-800 leading-none truncate">Nguyen</span>
                          <span className="self-end h-3 w-3 rounded-full bg-blue-200 flex items-center justify-center text-[7px] font-bold text-blue-800">M</span>
                        </div>
                      )}
                      {idx === 2 && (
                        <div className="w-full bg-amber-50 border border-amber-100 rounded p-0.5 text-left flex flex-col justify-between h-full">
                          <span className="text-[8px] font-bold text-amber-800 leading-none truncate">Ortiz</span>
                          <span className="self-end h-3 w-3 rounded-full bg-amber-200 flex items-center justify-center text-[7px] font-bold text-amber-800">S</span>
                        </div>
                      )}
                      {!isToday && idx !== 0 && (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="h-1 w-1 rounded-full bg-neutral-200" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Element: Toast overlapping the top-right corner of the window frame */}
      {/* Positioned absolute inside the mobile frame */}
      <div 
        className="absolute right-4 top-6 bg-white border border-neutral-100 rounded-lg px-3 py-2 flex items-center gap-2 transition-all duration-300 hover:translate-y-[-1px]"
        style={{
          boxShadow: "0 10px 25px -5px rgba(20, 24, 31, 0.1), 0 4px 10px -3px rgba(20, 24, 31, 0.05)"
        }}
      >
        <span className="text-[11px] font-medium text-[color:var(--ink)]">
          Invoice paid · <span className="font-bold font-display">$2,400</span>
        </span>
        <span className="h-4.5 w-4.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[9px] font-bold px-1 py-0.5">
          ✓
        </span>
      </div>
    </div>
  );
}
