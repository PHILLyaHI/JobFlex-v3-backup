/* The one line under every register button (CRO stage 2, 2026-09-09): the
   trial's two facts in the landing's mono caps, the same utility set the
   proposal table and the jobs filters are lettered with. `tone` picks the
   ink for a black or a white ground; nothing else changes. 11 px is the
   floor for mono caps and the inks clear 4.5:1 (type pass, 2026-09-10).
   landing-e pass A (2026-09-11): the honest pair — the card is taken at the
   plan step, so the line promises the trial and the exit, nothing else. */
export function CtaNote({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <span
      className={`block font-mono text-[11px] font-bold uppercase tracking-[0.14em] lg:text-[12px] ${
        tone === "dark" ? "text-white/60" : "text-slate-500"
      } ${className}`}
    >
      14 days free · Cancel anytime
    </span>
  );
}
