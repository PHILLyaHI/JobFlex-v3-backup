/* The one line under every register button (CRO stage 2, 2026-09-09): the
   trial's two facts in the landing's mono caps, the same utility set the
   proposal table and the jobs filters are lettered with. `tone` picks the
   ink for a black or a white ground; nothing else changes. */
export function CtaNote({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <span
      className={`block font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${
        tone === "dark" ? "text-white/45" : "text-slate-400"
      } ${className}`}
    >
      No credit card · 14 days free
    </span>
  );
}
