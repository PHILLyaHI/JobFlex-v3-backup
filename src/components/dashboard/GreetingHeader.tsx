"use client";
import * as React from "react";

interface GreetingHeaderProps {
  /** Reference moment. Pass `new Date()` from the composer to make hour-of-day derive cleanly. */
  now: Date;
}

const DAY_LONG = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const MONTH_DAY_LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });

function partOfDay(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function GreetingHeader({ now }: GreetingHeaderProps) {
  const greeting = partOfDay(now.getHours());
  const day = DAY_LONG.format(now);
  const date = MONTH_DAY_LONG.format(now);

  return (
    <header className="px-5 pt-1 pb-1">
      <div className="quiet-caps">
        <span className="tabular">{day}</span>
        <span className="mx-1.5 text-[color:var(--ink-faint)]">·</span>
        <span className="tabular">{date}</span>
      </div>
      <h1 className="mt-2 font-display text-[22px] tracking-[-0.015em] leading-tight">
        Good {greeting}.
      </h1>
    </header>
  );
}
