"use client";
import * as React from "react";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { money } from "@/lib/format";
import { OverflowTooltip } from "./OverflowTooltip";

const UNIT_LABEL: Record<string, string> = {
  SQFT: "sq ft",
  LINEAR_FT: "linear ft",
  CUBIC_FT: "cubic ft",
  UNIT: "unit",
  HOUR: "hour",
  LUMP_SUM: "lump sum",
};

// The live "what the client sees" sheet. The line-item table is table-fixed
// so a long, unbroken item name truncates with an ellipsis instead of pushing
// the qty / unit / total columns out of the card.
export function ProposalPreview({
  orgName = "Your Company",
  totalsRef,
}: {
  orgName?: string;
  totalsRef?: React.Ref<HTMLDivElement>;
}) {
  const draft = useProposalDraftStore((s) => s.draft);
  const { subtotal, tax, total } = useProposalDraftStore((s) => s.computed)();
  const namedItems = draft.lineItems.filter((l) => l.name.trim());

  return (
    <div className="paper-card p-7">
      <div className="flex items-start justify-between gap-4 border-b border-[color:var(--ink-line)] pb-5">
        <div className="min-w-0">
          <div className="quiet-caps">Live preview</div>
          <div className="mt-1 truncate font-display text-[21px] leading-tight tracking-[-0.015em]">
            {draft.title || "Untitled proposal"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="quiet-caps">From</div>
          <div className="mt-1 font-display text-[13px] text-[color:var(--ink)]">
            {orgName}
          </div>
        </div>
      </div>

      {draft.description && (
        <p className="mt-5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
          {draft.description}
        </p>
      )}

      <table className="mt-6 w-full table-fixed text-[13px]">
        <thead>
          <tr className="border-b border-[color:var(--ink-line)]">
            <th className="quiet-caps py-2 text-left">Item</th>
            <th className="quiet-caps w-[52px] py-2 text-right">Qty</th>
            <th className="quiet-caps w-[82px] py-2 text-right">Unit</th>
            <th className="quiet-caps w-[94px] py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {namedItems.map((l) => (
            <tr
              key={l.id}
              className="border-b border-[color:var(--ink-line)]/60 last:border-0 align-top"
            >
              <td className="py-2.5 pr-3">
                <OverflowTooltip text={l.name}>
                  <div
                    data-ot-measure=""
                    className="truncate font-medium text-[color:var(--ink)]"
                  >
                    {l.name}
                  </div>
                </OverflowTooltip>
                {l.description && (
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-[color:var(--ink-muted)]">
                    {l.description}
                  </div>
                )}
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-faint)]">
                  {UNIT_LABEL[l.measurementType] ?? l.measurementType}
                </div>
              </td>
              <td className="py-2.5 text-right tabular">{l.quantity}</td>
              <td className="py-2.5 text-right tabular">{money(l.unitPrice)}</td>
              <td className="py-2.5 text-right font-display tabular">
                {money(l.quantity * l.unitPrice)}
              </td>
            </tr>
          ))}
          {namedItems.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className="py-8 text-center text-[12px] text-[color:var(--ink-faint)]"
              >
                Add line items on the left to see them here.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div ref={totalsRef} className="mt-6 space-y-1.5 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-[color:var(--ink-muted)]">Subtotal</span>
          <span className="tabular">{money(subtotal)}</span>
        </div>
        {draft.taxRate > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[color:var(--ink-muted)]">
              Tax · {(draft.taxRate * 100).toFixed(1)}%
            </span>
            <span className="tabular">{money(tax)}</span>
          </div>
        )}
        <div className="my-2 h-px bg-[color:var(--ink-line)]" />
        <div className="flex items-baseline justify-between">
          <span className="quiet-caps">Total</span>
          <span className="font-display text-[32px] leading-none tabular tracking-[-0.02em] text-[color:var(--ink)]">
            {money(total)}
          </span>
        </div>
      </div>

      {draft.scopeOfWork && (
        <div className="mt-8">
          <div className="quiet-caps mb-2">Scope of work</div>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[color:var(--ink-soft)]">
            {draft.scopeOfWork}
          </p>
        </div>
      )}

      {draft.installments.length > 0 && (
        <div className="mt-7">
          <div className="quiet-caps mb-2">Payment schedule</div>
          <ol className="space-y-1.5 text-[12.5px]">
            {draft.installments.map((i, idx) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 text-[color:var(--ink-soft)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-[10px] tabular text-[color:var(--ink-faint)]">
                    #{idx + 1}
                  </span>
                  <span className="truncate">{i.label || "Installment"}</span>
                </span>
                <span className="shrink-0 tabular">
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
