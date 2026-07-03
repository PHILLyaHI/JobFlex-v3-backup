"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { createChangeOrder } from "@/actions/changeOrders";

export function NewChangeOrderSheet({
  jobId,
  proposalId,
  open,
  onClose,
}: {
  // Exactly one of jobId / proposalId — the change order amends that contract.
  jobId?: string;
  proposalId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [sign, setSign] = React.useState<"+" | "−">("+");
  const [busy, setBusy] = React.useState(false);
  const [sendAfter, setSendAfter] = React.useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setAmount("");
    setSign("+");
    setSendAfter(false);
  }

  async function submit() {
    if (!title.trim() || !amount) {
      toast.error("Missing info", "Title and amount are required.");
      return;
    }
    setBusy(true);
    try {
      const signed = (sign === "+" ? 1 : -1) * Math.abs(Number(amount));
      await createChangeOrder({
        ...(jobId ? { jobId } : {}),
        ...(proposalId ? { proposalId } : {}),
        title: title.trim(),
        description: description.trim() || null,
        amount: signed,
        send: sendAfter,
      });
      reset();
      onClose();
      toast.success(sendAfter ? "Sent to client" : "Saved as draft");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New change order"
      description="A signed delta to the contract — for example, a material upgrade or an unexpected repair discovered on site."
      width="min(520px, 100vw)"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            loading={busy && !sendAfter}
            onClick={() => {
              setSendAfter(false);
              submit();
            }}
          >
            Save draft
          </Button>
          <Button
            loading={busy && sendAfter}
            onClick={() => {
              setSendAfter(true);
              submit();
            }}
          >
            Save &amp; send
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Upgrade shingle grade to Lifetime"
        />
        <Textarea
          label="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why this change, and what it covers."
        />
        <div>
          <div className="quiet-caps mb-1.5">Amount</div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-[var(--r-md)] hairline p-0.5 bg-white/60 dark:bg-white/[0.03]">
              {(["+", "−"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSign(s)}
                  className={cn(
                    "h-9 w-9 grid place-items-center rounded-[var(--r-sm)] text-[14px] font-semibold transition-colors",
                    sign === s
                      ? s === "+"
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white"
                      : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
                  )}
                >
                  {s === "+" ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div className="flex-1">
              <Input
                type="number"
                step="0.01"
                prefix={<span className="text-[11px]">$</span>}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1250"
              />
            </div>
          </div>
          <p className="text-[11px] text-[color:var(--ink-muted)] mt-2">
            Positive adds to the contract total; negative reduces it.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
