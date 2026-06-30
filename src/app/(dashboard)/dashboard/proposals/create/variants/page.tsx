import { PencilLine, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

// Throwaway comparison surface. Three BOLD, from-scratch takes on the "Manual
// proposal" hero, plus the current shipped card at the bottom for contrast.
//
// NOTE: these intentionally break the locked DESIGN.md restraint per user
// request — real drop shadows (the system keeps static cards near-flat) and
// color-blocked surfaces (the system caps accent at ~10% and keeps cards white).
// They still hold the line on the brand bans: no construction cliché, no
// gradients, no glassmorphism, single typeface, tabular money, sage as the one
// accent. Once a direction is chosen it replaces the hero in ../page.tsx and
// this route is deleted.

const lines: ReadonlyArray<readonly [string, string]> = [
  ["Materials", "$2,480"],
  ["Labor", "$1,950"],
  ["Permit & disposal", "$315"],
];

// Strong elevation so the card clearly floats off the near-white page.
const lift =
  "shadow-[0_4px_14px_-2px_rgba(20,24,31,0.10),0_22px_46px_-12px_rgba(20,24,31,0.18)]";
const liftInk =
  "shadow-[0_4px_12px_-2px_rgba(20,24,31,0.22),0_24px_50px_-12px_rgba(20,24,31,0.38)]";
const hover =
  "transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5";

/* ── Option 1 · INK STATEMENT ─────────────────────────────────────────────
   A near-black surface that owns the page. Maximum contrast, gallery weight,
   the sage reserved for the icon, total, and CTA. */
function OptionInk() {
  return (
    <div className={`group rounded-[var(--r-lg)] bg-[color:var(--ink)] p-7 ${liftInk} ${hover}`}>
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[color:var(--accent)] text-white">
          <PencilLine className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
            Build it yourself
          </span>
          <h2 className="font-display text-[23px] leading-tight tracking-[-0.015em] text-white">
            Manual proposal
          </h2>
        </div>
      </div>
      <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-white/65">
        Hand-craft every line and set your own pricing, with a live preview of exactly what the client receives.
      </p>
      <div className="mt-6">
        <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
          Sample estimate
        </span>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {lines.map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <span className="text-[12px] text-white/60">{label}</span>
              <span className="tabular text-[12px] text-white/85">{amount}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">Total</span>
            <span className="font-display tabular text-[21px] tracking-[-0.01em] text-[color:var(--accent-soft)]">
              $4,745
            </span>
          </div>
        </div>
      </div>
      <span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--accent-soft)]">
        Open the builder
        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1" />
      </span>
    </div>
  );
}

/* ── Option 2 · SAGE BANNER ───────────────────────────────────────────────
   A confident sage masthead over a white body. Unmistakably JobFlex; the brand
   color carries the top third instead of hiding at 10%. */
function OptionSage() {
  return (
    <div className={`group overflow-hidden rounded-[var(--r-lg)] bg-white ${lift} ${hover}`}>
      <div className="flex items-center gap-3.5 bg-[color:var(--accent)] px-7 py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-white/15 text-white">
          <PencilLine className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-white/75">
            Build it yourself
          </span>
          <h2 className="font-display text-[22px] leading-tight tracking-[-0.015em] text-white">
            Manual proposal
          </h2>
        </div>
      </div>
      <div className="p-7">
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
          Hand-craft every line and set your own pricing, with a live preview of exactly what the client receives.
        </p>
        <div className="mt-5 divide-y divide-[color:var(--ink-line)] border-y border-[color:var(--ink-line)]">
          {lines.map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <span className="text-[12px] text-[color:var(--ink-soft)]">{label}</span>
              <span className="tabular text-[12px] text-[color:var(--ink-muted)]">{amount}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2.5">
            <span className="quiet-caps !mb-0">Total</span>
            <span className="font-display tabular text-[19px] tracking-[-0.01em] text-[color:var(--accent)]">
              $4,745
            </span>
          </div>
        </div>
        <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--accent)]">
          Open the builder
          <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1" />
        </span>
      </div>
    </div>
  );
}

/* ── Option 3 · LIFTED LEDGER, BIG TOTAL ──────────────────────────────────
   Stays light, but earns its presence with a real shadow and a display-scale
   sage total. The number anchors the eye; the line items keep it honest. */
function OptionBigTotal() {
  return (
    <div className={`group rounded-[var(--r-lg)] border border-[color:var(--ink-line)] bg-white p-7 ${lift} ${hover}`}>
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <PencilLine className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="quiet-caps">Build it yourself</span>
          <h2 className="font-display text-[22px] leading-tight tracking-[-0.015em] text-[color:var(--ink)]">
            Manual proposal
          </h2>
        </div>
      </div>
      <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
        Hand-craft every line and set your own pricing, with a live preview of exactly what the client receives.
      </p>
      <div className="mt-6 space-y-2">
        {lines.map(([label, amount]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[12px] text-[color:var(--ink-soft)]">{label}</span>
            <span className="tabular text-[12px] text-[color:var(--ink-muted)]">{amount}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-[color:var(--ink-line)] pt-4">
        <div>
          <span className="quiet-caps !mb-0 block">Estimated total</span>
          <span className="mt-1 block text-[12px] text-[color:var(--ink-muted)]">3 line items, taxes at review</span>
        </div>
        <span className="stat-numeric text-[40px] leading-none text-[color:var(--accent)]">$4,745</span>
      </div>
      <span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--accent)]">
        Open the builder
        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1" />
      </span>
    </div>
  );
}

/* ── Current shipped card (for reference / contrast) ──────────────────────── */
function CurrentReference() {
  return (
    <div className="paper-card p-7">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <PencilLine className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="quiet-caps">Build it yourself</span>
          <h2 className="font-display text-[22px] leading-tight tracking-[-0.015em] text-[color:var(--ink)]">
            Manual proposal
          </h2>
        </div>
      </div>
      <p className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
        Hand-craft every line and set your own pricing, with a live preview of exactly what the client receives.
      </p>
      <div className="mt-6">
        <span className="quiet-caps !mb-2 block text-[color:var(--ink-faint)]">Sample estimate</span>
        <div className="divide-y divide-[color:var(--ink-line)] border-y border-[color:var(--ink-line)]">
          {lines.map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <span className="text-[12px] text-[color:var(--ink-soft)]">{label}</span>
              <span className="tabular text-[12px] text-[color:var(--ink-muted)]">{amount}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2.5">
            <span className="quiet-caps !mb-0">Total</span>
            <span className="font-display tabular text-[17px] tracking-[-0.01em] text-[color:var(--accent)]">
              $4,745
            </span>
          </div>
        </div>
      </div>
      <span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--accent)]">
        Open the builder
        <ArrowRight className="h-4 w-4" />
      </span>
    </div>
  );
}

const options = [
  { tag: "Option 1", name: "Ink statement — dark, gallery weight", node: <OptionInk /> },
  { tag: "Option 2", name: "Sage banner — brand color up top", node: <OptionSage /> },
  { tag: "Option 3", name: "Lifted ledger — light, big sage total", node: <OptionBigTotal /> },
  { tag: "Current", name: "What ships today (for contrast)", node: <CurrentReference /> },
];

export default function HeroCardVariantsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Design · compare"
        title="Hero card, bolder takes"
        description="Three from-scratch directions with real elevation, plus the current card at the bottom so the lift is obvious. Tell me 1, 2, or 3 and I'll wire it into the picker."
      />
      <div className="space-y-8">
        {options.map((o) => (
          <div key={o.tag}>
            <div className="mb-2.5 flex items-baseline gap-2.5">
              <span className="quiet-caps !mb-0 text-[color:var(--accent-ink)]">{o.tag}</span>
              <span className="text-[12px] text-[color:var(--ink-muted)]">{o.name}</span>
            </div>
            {o.node}
          </div>
        ))}
      </div>
    </>
  );
}
