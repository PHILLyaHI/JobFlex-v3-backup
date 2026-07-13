"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2 } from "lucide-react";
import { WidgetVersionA } from "@/components/v3/landing/WidgetVersionA";
import { WidgetVersionB } from "@/components/v3/landing/WidgetVersionB";
import { WidgetVersionC } from "@/components/v3/landing/WidgetVersionC";

const widths = [
  { label: "iPhone SE (375px)", value: 375 },
  { label: "iPhone 13/14 (390px)", value: 390 },
  { label: "iPhone Pro Max (430px)", value: 430 },
  { label: "Full Responsive", value: null },
];

export default function HeroReviewPage() {
  const [selectedWidth, setSelectedWidth] = useState<number | null>(390);

  return (
    <main className="min-h-screen bg-[#fafafa] text-[#14181f] pb-24 font-sans antialiased">
      {/* Header Banner */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-50 px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link 
              href="/v3" 
              className="p-2 rounded-full hover:bg-neutral-100 transition-colors text-neutral-500 hover:text-neutral-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-50 text-[color:var(--accent)] text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border border-emerald-100">
                  Design Review
                </span>
                <span className="text-neutral-400 text-xs">v3.0</span>
              </div>
              <h1 className="text-xl font-bold font-display mt-0.5">
                JobFlex Dashboard Hero Widgets
              </h1>
            </div>
          </div>

          {/* Width Simulator Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-medium mr-2">Simulate Width:</span>
            <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-1">
              {widths.map((w) => (
                <button
                  key={w.label}
                  onClick={() => setSelectedWidth(w.value)}
                  className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-all ${
                    selectedWidth === w.value
                      ? "bg-white text-[color:var(--ink)] shadow-sm"
                      : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  {w.value ? `${w.value}px` : "Responsive"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 mt-10">
        {/* Intro */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm mb-12">
          <h2 className="text-lg font-bold font-display mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[color:var(--accent)]" />
            The Product Shot Challenge
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600 mb-4">
            A hero product shot shows the visitor what the product does in under 2 seconds. The earlier version failed because it was too busy — attempting to inventory the entire dashboard at a tiny, unreadable scale. 
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-xs">
            <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-lg p-3.5">
              <span className="font-bold text-emerald-800 uppercase tracking-wide">The Rules of Realism</span>
              <ul className="list-disc pl-4 mt-2 space-y-1.5 text-emerald-900">
                <li><strong>Real Scale & Crop</strong>: Render UI elements at full desktop scale and crop them (let them bleed off edges). Never scale them down.</li>
                <li><strong>Layered Depth</strong>: Use shadows to separate the background, app frame, and floating details.</li>
                <li><strong>Strict Word Budget</strong>: Limit text to ≤25 words. No ellipses (...).</li>
                <li><strong>Cohesive Brand Data</strong>: Contractor (Reyes & Sons), crew initials, jobs, revenue figures ($48,210).</li>
              </ul>
            </div>
            <div className="bg-amber-50/40 border border-amber-100/50 rounded-lg p-3.5">
              <span className="font-bold text-amber-800 uppercase tracking-wide">Content Budget (Per Version)</span>
              <ul className="list-disc pl-4 mt-2 space-y-1.5 text-amber-900">
                <li><strong>1 Hero Element</strong>: Owns the screen composition (either a big metric or a large calendar grid).</li>
                <li><strong>2 Content Zones</strong>: Supports the layout without cluttering.</li>
                <li><strong>1 Floating Element</strong>: Toast, panel, or pill casting a soft shadow.</li>
                <li><strong>Nothing else</strong>.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* The 3 Variants */}
        <div className="space-y-16">
          
          {/* VERSION A */}
          <section className="border-t border-neutral-200 pt-12">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
              <div>
                <h3 className="text-lg font-bold font-display">Version A — Money First</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  Prioritizes the financial outcome. Features one massive metrics hero alongside a compact Mon–Fri calendar strip, with a floating invoice paid toast. Bleeds off the right edge.
                </p>
              </div>
              <span className="shrink-0 bg-white border border-neutral-200 text-neutral-500 text-xs px-3 py-1 rounded-full font-mono">
                Word Count: 18 words
              </span>
            </div>

            {/* Simulated Device Frame Container */}
            <div className="flex justify-center bg-neutral-100/40 border border-dashed border-neutral-200 rounded-2xl py-12 px-4 mb-6">
              <div 
                style={{ width: selectedWidth ? `${selectedWidth}px` : "100%" }}
                className="transition-all duration-300 max-w-full"
              >
                <div className="bg-white rounded-3xl shadow-md border border-neutral-200/80 overflow-hidden p-4 relative">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center justify-between">
                    <span>Mobile Screen Preview</span>
                    {selectedWidth && <span>{selectedWidth}px width</span>}
                  </div>
                  <WidgetVersionA />
                </div>
              </div>
            </div>

            {/* Critique & Checklist */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-neutral-400 block mb-3">Self-Critique & Details</span>
                <p className="text-neutral-600 leading-relaxed text-xs">
                  This variant is ideal if &quot;getting paid&quot; is the key visitor motivator. The huge $48,210 collected statistic acts as the dominant focal point. The week schedule is cropped on the right, proving it is a crop of a much larger live interface. The toast adds a sense of automation (&quot;Invoice paid&quot; notifications).
                </p>
              </div>
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-neutral-400 block mb-3">Verification Checklist</span>
                <div className="space-y-1.5 text-xs text-neutral-600">
                  <CheckItem checked>2-second clarity: &quot;Dashboard: my jobs, my money, my week&quot;</CheckItem>
                  <CheckItem checked>Content budget: 2 zones + 1 toast + 1 money hero</CheckItem>
                  <CheckItem checked>≤25 words: 18 total (no truncation)</CheckItem>
                  <CheckItem checked>Scale & Crop: Bleeds off right edge</CheckItem>
                  <CheckItem checked>App Chrome: URL bar, lights, tabs, avatar present</CheckItem>
                </div>
              </div>
            </div>
          </section>

          {/* VERSION B */}
          <section className="border-t border-neutral-200 pt-12">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
              <div>
                <h3 className="text-lg font-bold font-display">Version B — Calendar First</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  Focuses heavily on crew scheduling. Features a large, detailed calendar schedule as the hero, a slim top bar with real-time crew statistics, and an overlapping job detail panel. Bleeds off the bottom edge.
                </p>
              </div>
              <span className="shrink-0 bg-white border border-neutral-200 text-neutral-500 text-xs px-3 py-1 rounded-full font-mono">
                Word Count: 19 words
              </span>
            </div>

            {/* Simulated Device Frame Container */}
            <div className="flex justify-center bg-neutral-100/40 border border-dashed border-neutral-200 rounded-2xl py-12 px-4 mb-6">
              <div 
                style={{ width: selectedWidth ? `${selectedWidth}px` : "100%" }}
                className="transition-all duration-300 max-w-full"
              >
                <div className="bg-white rounded-3xl shadow-md border border-neutral-200/80 overflow-hidden p-4 relative">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center justify-between">
                    <span>Mobile Screen Preview</span>
                    {selectedWidth && <span>{selectedWidth}px width</span>}
                  </div>
                  <WidgetVersionB />
                </div>
              </div>
            </div>

            {/* Critique & Checklist */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-neutral-400 block mb-3">Self-Critique & Details</span>
                <p className="text-neutral-600 leading-relaxed text-xs">
                  This variant speaks loudest to contractors who struggle with scheduling chaos. The calendar itself is the hero element. The active crew count stat pill (&quot;4 crews out today&quot;) makes the software feel alive. The drag-to-assign action block and detailed job popover panel give visitors a quick look at the interactive workflows of the scheduler.
                </p>
              </div>
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-neutral-400 block mb-3">Verification Checklist</span>
                <div className="space-y-1.5 text-xs text-neutral-600">
                  <CheckItem checked>2-second clarity: &quot;Dashboard: scheduling my crews & jobs&quot;</CheckItem>
                  <CheckItem checked>Content budget: 2 zones + 1 popover panel + 1 schedule hero</CheckItem>
                  <CheckItem checked>≤25 words: 19 total (no truncation)</CheckItem>
                  <CheckItem checked>Scale & Crop: Bleeds off bottom edge</CheckItem>
                  <CheckItem checked>App Chrome: URL bar, lights, logo, avatar present</CheckItem>
                </div>
              </div>
            </div>
          </section>

          {/* VERSION C */}
          <section className="border-t border-neutral-200 pt-12">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
              <div>
                <h3 className="text-lg font-bold font-display">Version C — Layered Stack</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  Stripe-style composition. Features a heavily cropped dashboard window in the background displaying greeting and financial data, a floating &quot;This week&quot; calendar card on the front layer, and a small crew assigned indicator pill.
                </p>
              </div>
              <span className="shrink-0 bg-white border border-neutral-200 text-neutral-500 text-xs px-3 py-1 rounded-full font-mono">
                Word Count: 17 words
              </span>
            </div>

            {/* Simulated Device Frame Container */}
            <div className="flex justify-center bg-neutral-100/40 border border-dashed border-neutral-200 rounded-2xl py-12 px-4 mb-6">
              <div 
                style={{ width: selectedWidth ? `${selectedWidth}px` : "100%" }}
                className="transition-all duration-300 max-w-full"
              >
                <div className="bg-white rounded-3xl shadow-md border border-neutral-200/80 overflow-hidden p-4 relative">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center justify-between">
                    <span>Mobile Screen Preview</span>
                    {selectedWidth && <span>{selectedWidth}px width</span>}
                  </div>
                  <WidgetVersionC />
                </div>
                  </div>
            </div>

            {/* Critique & Checklist */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-neutral-400 block mb-3">Self-Critique & Details</span>
                <p className="text-neutral-600 leading-relaxed text-xs">
                  The most premium layout. By stacking multiple UI layers (the background window, the overlapping calendar card, and the foreground status badge), it creates a depth effect that instantly reads as a real screenshot rather than a flat vector diagram. Focuses equally on money (background) and schedule (foreground).
                </p>
              </div>
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-neutral-400 block mb-3">Verification Checklist</span>
                <div className="space-y-1.5 text-xs text-neutral-600">
                  <CheckItem checked>2-second clarity: &quot;Dashboard: money + schedule overview&quot;</CheckItem>
                  <CheckItem checked>Content budget: 2 zones + 1 assigned pill + 1 stacked hero</CheckItem>
                  <CheckItem checked>≤25 words: 17 total (no truncation)</CheckItem>
                  <CheckItem checked>Scale & Crop: Bleeds off bottom & right edges</CheckItem>
                  <CheckItem checked>App Chrome: URL bar, lights, logo, active tab underline present</CheckItem>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}

function CheckItem({ checked, children }: { checked: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${checked ? "text-[color:var(--accent)]" : "text-neutral-300"}`} />
      <span>{children}</span>
    </div>
  );
}
