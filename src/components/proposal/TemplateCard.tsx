"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { deleteTemplate, createProposalFromTemplate } from "@/actions/templates";
import { money } from "@/lib/format";

export interface TemplateCardData {
  id: string;
  name: string;
  description: string | null;
  usageCount: number;
  lineItemTeasers: string[];
  approxTotal: number;
  createdAt: Date;
}

export function TemplateCard({ t }: { t: TemplateCardData }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function onUse() {
    setBusy(true);
    try {
      const res = await createProposalFromTemplate(t.id);
      toast.success("Proposal created from template");
      router.push(`/dashboard/proposals/${res.id}` as any);
    } catch (err: any) {
      toast.error("Couldn't create", err?.message);
      setBusy(false);
    }
  }

  async function onDelete() {
    try {
      await deleteTemplate(t.id);
      setConfirmDel(false);
      toast.success("Template deleted");
      router.refresh();
    } catch (err: any) {
      toast.error("Delete failed", err?.message);
    }
  }

  return (
    <>
      <div className="paper-card p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 hover:shadow-pop relative group">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[18px] leading-tight tracking-[-0.015em] truncate">
              {t.name}
            </div>
            {t.description && (
              <div className="text-[11px] text-[color:var(--ink-muted)] mt-1 line-clamp-2">
                {t.description}
              </div>
            )}
          </div>
          <div className="relative">
            <Badge tone="neutral">Used {t.usageCount}×</Badge>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-3 pb-1 border-t border-[color:var(--ink-line)]">
          {t.lineItemTeasers.length === 0 ? (
            <span className="text-[11px] text-[color:var(--ink-faint)] italic">No line items</span>
          ) : (
            t.lineItemTeasers.slice(0, 3).map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[12px] text-[color:var(--ink-soft)] truncate"
              >
                <span className="h-1 w-1 rounded-full bg-[color:var(--ink-faint)] shrink-0" />
                <span className="truncate">{name}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[color:var(--ink-line)]">
          <div>
            <div className="quiet-caps">Typical total</div>
            <div className="stat-numeric text-[24px] leading-none mt-1">
              {money(t.approxTotal)}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setConfirmDel(true)}
              aria-label="Delete template"
              className="h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <Button size="sm" loading={busy} onClick={onUse} icon={<Copy className="h-3.5 w-3.5" />}>
              Use
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete this template?"
        description={`"${t.name}" will be permanently removed. Proposals already created from it are unaffected.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onDelete}>
              Delete template
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </>
  );
}
