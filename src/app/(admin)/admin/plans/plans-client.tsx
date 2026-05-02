"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { upsertPricingPlan, deletePricingPlan } from "@/actions/admin";

interface HydratedPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  interval: string;
  order: number;
  features: string[];
}

const BLANK: HydratedPlan = {
  id: "",
  slug: "",
  name: "",
  description: "",
  priceCents: 0,
  interval: "month",
  order: 0,
  features: [],
};

export function PlansClient({ plans }: { plans: HydratedPlan[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<HydratedPlan | null>(null);

  async function save(p: HydratedPlan) {
    try {
      await upsertPricingPlan({
        id: p.id || undefined,
        slug: p.slug,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        interval: p.interval as any,
        order: p.order,
        features: p.features,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err: any) {
      toast.error("Save failed", err?.message);
    }
  }

  async function drop(id: string) {
    try {
      await deletePricingPlan(id);
      toast.success("Deleted");
      router.refresh();
    } catch (err: any) {
      toast.error("Delete failed", err?.message);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pricing plans</CardTitle>
            <CardSubtitle>{plans.length} plan{plans.length === 1 ? "" : "s"}</CardSubtitle>
          </div>
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ ...BLANK })}>
            New plan
          </Button>
        </CardHeader>
        {plans.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No plans yet. Create one.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">
                    {p.name} <span className="text-[11px] text-[color:var(--ink-faint)] font-mono">{p.slug}</span>
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                    ${(p.priceCents / 100).toFixed(2)} / {p.interval} · order {p.order}
                  </div>
                  {p.features.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.features.slice(0, 6).map((f) => (
                        <Badge key={f} tone="neutral">
                          {f}
                        </Badge>
                      ))}
                      {p.features.length > 6 && (
                        <span className="text-[10px] text-[color:var(--ink-faint)]">
                          +{p.features.length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setEditing(p)}
                  className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => drop(p.id)}
                  className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PlanSheet editing={editing} onClose={() => setEditing(null)} onSave={save} />
    </>
  );
}

function PlanSheet({
  editing,
  onClose,
  onSave,
}: {
  editing: HydratedPlan | null;
  onClose: () => void;
  onSave: (p: HydratedPlan) => Promise<void>;
}) {
  const [local, setLocal] = React.useState<HydratedPlan>(editing ?? BLANK);
  const [featuresText, setFeaturesText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (editing) {
      setLocal(editing);
      setFeaturesText(editing.features.join("\n"));
    }
  }, [editing]);

  async function submit() {
    setBusy(true);
    try {
      await onSave({
        ...local,
        features: featuresText
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!editing}
      onClose={onClose}
      title={editing?.id ? "Edit plan" : "New plan"}
      description="These become the cards on /pricing."
      width="min(520px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Save
          </Button>
        </div>
      }
    >
      {editing && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name"
              value={local.name}
              onChange={(e) => setLocal({ ...local, name: e.target.value })}
            />
            <Input
              label="Slug"
              value={local.slug}
              onChange={(e) => setLocal({ ...local, slug: e.target.value })}
            />
          </div>
          <Textarea
            label="Description"
            rows={2}
            value={local.description ?? ""}
            onChange={(e) => setLocal({ ...local, description: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Price (cents)"
              type="number"
              value={local.priceCents}
              onChange={(e) => setLocal({ ...local, priceCents: Number(e.target.value) })}
            />
            <Select
              label="Interval"
              value={local.interval}
              onChange={(e) => setLocal({ ...local, interval: e.target.value })}
            >
              <option value="month">Month</option>
              <option value="year">Year</option>
            </Select>
            <Input
              label="Order"
              type="number"
              value={local.order}
              onChange={(e) => setLocal({ ...local, order: Number(e.target.value) })}
            />
          </div>
          <Textarea
            label="Features (one per line)"
            rows={6}
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            placeholder={"Unlimited proposals\nAI drafts\n5 team seats"}
          />
        </div>
      )}
    </Sheet>
  );
}
