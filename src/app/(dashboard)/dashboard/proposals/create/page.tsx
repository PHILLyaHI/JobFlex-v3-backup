"use client";
import Link from "next/link";
import {
  PencilLine,
  Sparkles,
  Home,
  Video,
  Fence,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const sampleLines = [
  ["Materials", "$2,480"],
  ["Labor", "$1,950"],
  ["Permit & disposal", "$315"],
] as const;

export default function CreateProposalPage() {
  return (
    <div className="max-w-[720px]">
      {/* ── Page header ────────────────────────────────────────────── */}
      <header className="mb-10">
        <p className="quiet-caps text-[color:var(--ink-faint)] mb-3">New proposal</p>
        <h1 className="font-display font-bold text-[42px] leading-[1.0] tracking-[-0.03em] text-[color:var(--ink)]">
          How do you<br />want to start?
        </h1>
        <div className="mt-6 h-px bg-[color:var(--ink-line)]" />
      </header>

      {/* ── Manual builder — dark hero card ──────────────────────────
          Uses --ink as background so this card reads at a completely
          different value than the page. Ghost "01" keeps the step
          legible without cluttering the layout. */}
      <Link
        href={"/dashboard/proposals/new" as never}
        className={cn(
          "group relative block rounded-[var(--r-lg)] bg-[color:var(--ink)] p-8 mb-8 overflow-hidden",
          "transition-all duration-300 ease-[var(--ease)]",
          "hover:shadow-[0_24px_48px_-12px_rgba(20,24,31,0.45)] hover:-translate-y-0.5",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2",
        )}
      >
        {/* Ghost step number — decorative depth layer */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-0 select-none font-display font-bold text-[160px] leading-none tracking-[-0.06em] text-white/[0.03]"
        >
          01
        </span>

        <div className="relative">
          {/* Icon + label */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--accent)]">
              <PencilLine className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <p className="quiet-caps !mb-0 text-white/[0.35]">Start here</p>
              <h2 className="font-display font-bold text-[22px] tracking-[-0.02em] text-white leading-tight">
                Build it yourself
              </h2>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-white/60 max-w-[54ch] mb-7">
            Line items, scope of work, payment schedule — the full canvas.
            Live preview shows exactly what your client receives.
          </p>

          {/* Sample estimate — frosted panel inside the dark card */}
          <div
            aria-hidden
            className="rounded-[var(--r-md)] border border-white/[0.08] bg-white/[0.07] px-4 py-3.5 mb-7"
          >
            <p className="quiet-caps !mb-2.5 text-white/30">Sample estimate</p>
            <div className="space-y-2">
              {sampleLines.map(([label, amount]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[12px] text-white/45">{label}</span>
                  <span className="tabular text-[12px] text-white/55">{amount}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.09] pt-3">
              <span className="quiet-caps !mb-0 text-white/35">Total</span>
              <span className="font-display tabular text-[22px] font-bold tracking-[-0.01em] text-[color:var(--accent)]">
                $4,745
              </span>
            </div>
          </div>

          {/* CTA — filled sage button */}
          <span className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[color:var(--accent)] px-4 h-9 text-[13px] font-semibold text-white transition-colors duration-150 ease-[var(--ease)] group-hover:bg-[color:var(--accent-ink)]">
            Open the builder
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-[var(--ease)] group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-7">
        <div className="flex-1 h-px bg-[color:var(--ink-line)]" />
        <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">Or estimate it first</span>
        <div className="flex-1 h-px bg-[color:var(--ink-line)]" />
      </div>

      {/* ── Estimator grid ────────────────────────────────────────────
          Each active card has a distinct filled background so they read
          as separate tools, not a repeated pattern. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Smart Proposal — filled sage (dark bg, white text) */}
        <Link
          href={"/dashboard/advanced-ai" as never}
          className={cn(
            "group relative rounded-[var(--r-lg)] bg-[color:var(--accent)]",
            "p-5 flex flex-col gap-3 min-h-[148px]",
            "transition-all duration-200 ease-[var(--ease)]",
            "hover:shadow-[0_8px_24px_-4px_rgba(31,122,82,0.35)] hover:-translate-y-0.5",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--accent)]",
          )}
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] bg-white/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            {/* Inverted badge on dark bg */}
            <span className="inline-flex items-center h-5 px-2 rounded-full bg-white/20 text-white text-[10px] font-semibold tracking-[0.04em] uppercase">
              AI
            </span>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-[13px] text-white leading-tight">Smart Proposal</p>
            <p className="text-[11px] text-white/65 mt-0.5 leading-snug">Describe the job, AI prices it</p>
          </div>
          <ArrowUpRight className="h-3.5 w-3.5 text-white/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100 self-end" />
        </Link>

        {/* Roofing — warm amber tint */}
        <Link
          href={"/dashboard/advanced-ai/roof" as never}
          className={cn(
            "group relative rounded-[var(--r-lg)] border",
            "bg-[rgba(200,148,80,0.10)] border-[rgba(200,148,80,0.22)]",
            "p-5 flex flex-col gap-3 min-h-[148px]",
            "transition-all duration-200 ease-[var(--ease)]",
            "hover:shadow-[0_8px_24px_-4px_rgba(200,148,80,0.28)] hover:-translate-y-0.5",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]",
          )}
        >
          <div className="h-9 w-9 flex items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--amber)]">
            <Home className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-[13px] text-[color:var(--ink)] leading-tight">Roofing</p>
            <p className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 leading-snug">Satellite measure + pitch factor</p>
          </div>
          <ArrowUpRight className="h-3.5 w-3.5 text-[color:var(--amber)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 self-end" />
        </Link>

        {/* Video — coming soon */}
        <div
          aria-disabled="true"
          className={cn(
            "rounded-[var(--r-lg)] bg-[color:var(--paper-deep)] border border-[color:var(--ink-line)]",
            "p-5 flex flex-col gap-3 min-h-[148px] cursor-default opacity-50",
          )}
        >
          <div className="h-9 w-9 flex items-center justify-center rounded-[var(--r-sm)] bg-black/[0.05]">
            <Video className="h-4 w-4 text-[color:var(--ink-faint)]" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-[13px] text-[color:var(--ink-muted)] leading-tight">Video</p>
            <p className="text-[11px] text-[color:var(--ink-faint)] mt-0.5 leading-snug">Walk the site on camera</p>
          </div>
          <Badge tone="neutral">Soon</Badge>
        </div>

        {/* Fence — coming soon */}
        <div
          aria-disabled="true"
          className={cn(
            "rounded-[var(--r-lg)] bg-[color:var(--paper-deep)] border border-[color:var(--ink-line)]",
            "p-5 flex flex-col gap-3 min-h-[148px] cursor-default opacity-50",
          )}
        >
          <div className="h-9 w-9 flex items-center justify-center rounded-[var(--r-sm)] bg-black/[0.05]">
            <Fence className="h-4 w-4 text-[color:var(--ink-faint)]" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-[13px] text-[color:var(--ink-muted)] leading-tight">Fence</p>
            <p className="text-[11px] text-[color:var(--ink-faint)] mt-0.5 leading-snug">Footage, height, material</p>
          </div>
          <Badge tone="neutral">Soon</Badge>
        </div>
      </div>
    </div>
  );
}
