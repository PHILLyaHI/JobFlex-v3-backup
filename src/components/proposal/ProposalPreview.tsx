"use client";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { money } from "@/lib/format";

export function ProposalPreview({ orgName = "Your Company" }: { orgName?: string }) {
  const draft = useProposalDraftStore((s) => s.draft);
  const { subtotal, tax, total } = useProposalDraftStore((s) => s.computed)();

  return (
    <div className="paper-card p-8 sticky top-20">
      <div className="flex items-start justify-between pb-6 border-b border-[color:var(--ink-line)]">
        <div>
          <div className="quiet-caps">Preview</div>
          <div className="font-display text-[22px] leading-tight tracking-[-0.015em] mt-1">
            {draft.title || "Untitled proposal"}
          </div>
        </div>
        <div className="text-right text-[11px] text-[color:var(--ink-muted)]">
          <div className="quiet-caps">From</div>
          <div className="font-display text-[14px] text-[color:var(--ink)] mt-1">{orgName}</div>
        </div>
      </div>

      {draft.description && (
        <p className="mt-5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
          {draft.description}
        </p>
      )}

      <table className="w-full mt-6 text-[13px]">
        <thead>
          <tr className="border-b border-[color:var(--ink-line)]">
            <th className="quiet-caps text-left py-2">Item</th>
            <th className="quiet-caps text-right py-2 w-[72px]">Qty</th>
            <th className="quiet-caps text-right py-2 w-[90px]">Unit</th>
            <th className="quiet-caps text-right py-2 w-[100px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {draft.lineItems.filter((l) => l.name).map((l) => (
            <tr key={l.id} className="border-b border-[color:var(--ink-line)]/60 last:border-0">
              <td className="py-2.5">
                <div className="text-[color:var(--ink)] font-medium">{l.name || "—"}</div>
                {l.description && (
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{l.description}</div>
                )}
                <div className="text-[10px] text-[color:var(--ink-faint)] mt-0.5 tracking-[0.1em] uppercase">
                  {l.measurementType.replace("_", " ")}
                </div>
              </td>
              <td className="text-right tabular py-2.5">{l.quantity}</td>
              <td className="text-right tabular py-2.5">{money(l.unitPrice)}</td>
              <td className="text-right font-display tabular py-2.5">
                {money(l.quantity * l.unitPrice)}
              </td>
            </tr>
          ))}
          {draft.lineItems.filter((l) => l.name).length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-[12px] text-[color:var(--ink-faint)]">
                Add line items on the left to see them here.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-6 space-y-1.5 text-[13px]">
        <Row label="Subtotal" value={money(subtotal)} />
        {draft.taxRate > 0 && <Row label={`Tax · ${(draft.taxRate * 100).toFixed(1)}%`} value={money(tax)} />}
        <div className="h-px bg-[color:var(--ink-line)] my-2" />
        <div className="flex items-baseline justify-between">
          <span className="quiet-caps">Total</span>
          <span className="stat-numeric text-[32px] text-[color:var(--ink)]">{money(total)}</span>
        </div>
      </div>

      {draft.scopeOfWork && (
        <div className="mt-8">
          <div className="quiet-caps mb-2">Scope of work</div>
          <p className="text-[12.5px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
            {draft.scopeOfWork}
          </p>
        </div>
      )}

      {draft.installments.length > 0 && (
        <div className="mt-7">
          <div className="quiet-caps mb-2">Payment schedule</div>
          <ol className="space-y-1.5 text-[12.5px]">
            {draft.installments.map((i, idx) => (
              <li key={i.id} className="flex items-center justify-between text-[color:var(--ink-soft)]">
                <span className="flex items-center gap-2">
                  <span className="w-5 text-[10px] text-[color:var(--ink-faint)] tabular">#{idx + 1}</span>
                  {i.label || "Installment"}
                </span>
                <span className="tabular">
                  {i.isPercent ? `${i.amount}%` : money(i.amount)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[color:var(--ink-muted)]">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
