"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { money, longDate } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Line {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface Props {
  token: string;
  orgName: string;
  orgPhone: string | null;
  number: number | null;
  title: string;
  reason: string | null;
  lines: Line[];
  photos: Array<{ id: string; url: string; caption?: string }>;
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  /** Tax-inclusive amount of this change (signed). */
  total: number;
  status: string;
  contextTitle: string;
  originalTotal: number | null;
  /** The contract before this change: original + changes approved so far. */
  contractBefore: number | null;
  approvedAt: Date | null;
  approvedName: string | null;
  declinedAt: Date | null;
}

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function ChangeOrderApprovalCard(p: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "decline" | null>(null);
  const [name, setName] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const positive = p.total >= 0;
  const resolved = p.status === "APPROVED" || p.status === "DECLINED" || p.status === "VOID";
  const label = `Change order${p.number ? ` #${p.number}` : ""}`;
  const approvedChanges = p.contractBefore != null && p.originalTotal != null ? Math.round((p.contractBefore - p.originalTotal) * 100) / 100 : 0;
  const newTotal = p.contractBefore != null ? Math.round((p.contractBefore + p.total) * 100) / 100 : null;

  async function respond(action: "approve" | "decline") {
    if (action === "approve" && (name.trim().length < 2 || !agree)) {
      toast.error("Type your full name and tick the box to approve.");
      return;
    }
    setBusy(action);
    try {
      const res = await fetch(`/api/public-co/${p.token}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "approve" ? { name: name.trim(), agree } : { reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't update");
      toast.success(action === "approve" ? "Approved — thank you" : "Declined");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't update", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-xl w-full mx-auto paper-card p-6 sm:p-10 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl pointer-events-none"
        style={{ background: positive ? "rgba(5,150,105,0.10)" : "rgba(225,29,72,0.08)" }}
      />
      <div className="relative">
        <div className="quiet-caps mb-3">{p.orgName} · {label}</div>
        <h1 className="font-display text-[28px] sm:text-[34px] leading-[1.05] tracking-[-0.02em]">{p.title}</h1>
        <div className="text-[12px] text-[color:var(--ink-muted)] mt-2">{p.contextTitle}</div>

        <div className="mt-6 flex items-baseline gap-3">
          <div className={cn("stat-numeric text-[48px] sm:text-[64px] leading-none", positive ? "text-emerald-700" : "text-rose-700")}>
            {positive ? "+" : "−"}
            {money(Math.abs(p.total))}
          </div>
          <div className="text-[11px] text-[color:var(--ink-muted)] tabular">{positive ? "added to your contract" : "credited to your contract"}</div>
        </div>

        {p.reason && (
          <div className="mt-6">
            <div className="quiet-caps mb-1">Why</div>
            <p className="text-[14px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">{p.reason}</p>
          </div>
        )}

        {p.photos.length > 0 && (
          <div className="mt-6">
            <div className="quiet-caps mb-2">Photos</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {p.photos.map((ph) => (
                <a key={ph.id} href={ph.url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden rounded-[var(--r-md)] hairline bg-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL chosen by the contractor */}
                  <img src={ph.url} alt={ph.caption || "Photo of the damage"} className="h-full w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </div>
        )}

        {p.lines.length > 0 && (
          <div className="mt-6">
            <div className="quiet-caps mb-2">What it covers</div>
            <ul className="divide-y divide-[color:var(--ink-line)] hairline rounded-[var(--r-md)] overflow-hidden">
              {p.lines.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate">{l.name}</div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] tabular">
                      {qty(l.quantity)} {l.unit} × {money(l.unitPrice)}
                    </div>
                  </div>
                  <div className="tabular shrink-0">{money(l.total)}</div>
                </li>
              ))}
              {p.taxTotal > 0 && (
                <li className="flex items-baseline justify-between gap-3 px-3 py-2 text-[13px]">
                  <div>Sales tax{p.taxRate > 0 ? ` · ${(p.taxRate * 100).toFixed(2).replace(/\.?0+$/, "")}%` : ""}</div>
                  <div className="tabular">{money(p.taxTotal)}</div>
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="mt-6 paper-card p-4 text-[12px] space-y-1.5">
          {p.originalTotal != null && (
            <div className="flex justify-between gap-3"><span className="text-[color:var(--ink-muted)]">Original contract</span><span className="tabular">{money(p.originalTotal)}</span></div>
          )}
          {Math.abs(approvedChanges) >= 0.005 && (
            <div className="flex justify-between gap-3"><span className="text-[color:var(--ink-muted)]">Changes approved so far</span><span className="tabular">{approvedChanges >= 0 ? "+" : "−"}{money(Math.abs(approvedChanges))}</span></div>
          )}
          <div className="flex justify-between gap-3"><span className="text-[color:var(--ink-muted)]">This change</span><span className="tabular">{positive ? "+" : "−"}{money(Math.abs(p.total))}</span></div>
          {newTotal != null && (
            <div className="flex justify-between gap-3 pt-1.5 border-t border-[color:var(--ink-line)]"><span className="quiet-caps">New total</span><span className="font-display tabular text-[18px]">{money(newTotal)}</span></div>
          )}
        </div>

        {resolved ? (
          <div className="mt-8 flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-full grid place-items-center", p.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
              {p.status === "APPROVED" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </div>
            <div>
              <Badge tone={p.status === "APPROVED" ? "success" : "danger"}>{p.status === "APPROVED" ? "Approved" : p.status === "VOID" ? "Withdrawn" : "Declined"}</Badge>
              <div className="text-[11px] text-[color:var(--ink-muted)] mt-1 tabular">
                {p.status === "APPROVED" && p.approvedAt
                  ? `Signed ${p.approvedName ? `by ${p.approvedName} ` : ""}on ${longDate(p.approvedAt)}`
                  : p.status === "DECLINED" && p.declinedAt
                    ? `On ${longDate(p.declinedAt)}`
                    : p.status === "VOID"
                      ? `${p.orgName} withdrew this change.`
                      : ""}
              </div>
            </div>
          </div>
        ) : declining ? (
          <div className="mt-8 space-y-3">
            <label className="block">
              <span className="quiet-caps">Tell {p.orgName} why (optional)</span>
              <textarea
                className="mt-1.5 w-full rounded-[var(--r-md)] hairline bg-white/70 p-3 text-[14px]"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please call me first."
              />
            </label>
            <div className="flex gap-2">
              <Button size="lg" variant="outline" loading={busy === "decline"} onClick={() => respond("decline")} icon={<X className="h-4 w-4" />} className="flex-1">
                Decline this change
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <label className="block">
              <span className="quiet-caps">Your full name</span>
              <input
                className="mt-1.5 w-full h-11 rounded-[var(--r-md)] hairline bg-white/70 px-3 text-[15px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Type your full name to approve"
                autoComplete="name"
              />
            </label>
            <label className="flex items-start gap-2.5 text-[13px] leading-snug cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I agree to this change of {positive ? "+" : "−"}{money(Math.abs(p.total))}
                {newTotal != null ? `, bringing my contract to ${money(newTotal)}` : ""}. Typing my name is my signature.
              </span>
            </label>
            <div className="flex gap-2">
              <Button size="lg" loading={busy === "approve"} disabled={name.trim().length < 2 || !agree} onClick={() => respond("approve")} icon={<Check className="h-4 w-4" />} className="flex-1">
                Approve · {money(Math.abs(p.total))}
              </Button>
              <Button size="lg" variant="outline" onClick={() => setDeclining(true)}>Decline</Button>
            </div>
            {p.orgPhone && (
              <div className="text-[11px] text-[color:var(--ink-muted)]">
                Questions? Call {p.orgName} at <a className="underline" href={`tel:${p.orgPhone.replace(/\s+/g, "")}`}>{p.orgPhone}</a>.
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
