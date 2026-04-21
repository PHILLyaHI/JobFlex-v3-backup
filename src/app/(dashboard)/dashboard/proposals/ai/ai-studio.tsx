"use client";
import * as React from "react";
import { Sparkles, AlertCircle, Wand2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { ProposalEditor } from "@/components/proposal/ProposalEditor";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { toast } from "@/components/ui/Toast";
import { generateAiProposal } from "@/actions/ai";

const SAMPLES = [
  "Replace 2,400 sqft architectural shingle roof, tear-off, ridge vents, ice & water shield. Philadelphia, PA.",
  "Install 180 linear ft cedar privacy fence with one gate, sloped yard. 7 ft tall.",
  "Full gut kitchen remodel — shaker cabinets, quartz counters, island seating for 4, mid-tier appliance package.",
];

export function AiStudio({
  clients,
  aiEnabled,
  orgName,
  defaultTaxRate,
}: {
  clients: { id: string; name: string }[];
  aiEnabled: boolean;
  orgName: string;
  defaultTaxRate: number;
}) {
  const hydrate = useProposalDraftStore((s) => s.hydrate);
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [generated, setGenerated] = React.useState(false);
  const [disabledBanner, setDisabledBanner] = React.useState(!aiEnabled);

  async function onGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    const res = await generateAiProposal(prompt);
    setLoading(false);
    if (!res.ok) {
      toast.error("Couldn't generate", res.error);
      return;
    }
    if (res.disabled) setDisabledBanner(true);
    hydrate({
      title: res.draft.title,
      description: res.draft.description ?? "",
      scopeOfWork: res.draft.scopeOfWork,
      notes: "",
      taxRate: defaultTaxRate,
      clientId: undefined,
      lineItems: res.draft.lineItems.map((l) => ({
        id: nanoid(6),
        name: l.name,
        description: l.description,
        measurementType: l.measurementType,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        materialCost: l.materialCost,
        laborCost: l.laborCost,
      })),
      installments:
        res.draft.installments?.map((i) => ({ id: nanoid(6), ...i })) ?? [
          { id: nanoid(6), label: "Deposit", amount: 30, isPercent: true },
          { id: nanoid(6), label: "Completion", amount: 70, isPercent: true },
        ],
    });
    setGenerated(true);
    toast.success(res.disabled ? "Draft loaded · demo mode" : "Draft ready", "Review, edit, then save.");
  }

  if (!generated) {
    return (
      <div className="space-y-5">
        {disabledBanner && (
          <div className="paper-card p-4 flex items-start gap-3 border-l-[3px] border-l-amber-400">
            <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700" />
            <div className="text-[12px] leading-relaxed">
              <div className="font-medium text-[color:var(--ink)]">OpenAI isn't configured.</div>
              <div className="text-[color:var(--ink-muted)] mt-0.5">
                Add <code className="font-mono text-[11px]">OPENAI_API_KEY</code> to your <code className="font-mono text-[11px]">.env.local</code>. For now you'll get a realistic sample draft to try the editor.
              </div>
            </div>
          </div>
        )}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Describe the job</CardTitle>
              <CardSubtitle>
                Material, dimensions, location — the more precise you are, the better the draft.
              </CardSubtitle>
            </div>
          </CardHeader>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="e.g. Replace 2,400 sqft architectural shingle roof in Philadelphia, PA. Include tear-off, ridge vents, ice & water shield on the valleys. 30-year shingles."
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="text-[11px] rounded-full px-3 py-1 hairline hover:bg-[color:var(--accent-soft)] transition-colors text-[color:var(--ink-muted)]"
                >
                  {s.slice(0, 60)}…
                </button>
              ))}
            </div>
            <Button
              onClick={onGenerate}
              loading={loading}
              disabled={!prompt.trim()}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              Draft proposal
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="paper-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px]">
          <div className="h-7 w-7 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] grid place-items-center">
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          <span>
            Draft generated. Review each line — you're the final eye on pricing.
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setGenerated(false)}>
          Start over
        </Button>
      </div>
      <ProposalEditor clients={clients} orgName={orgName} />
    </div>
  );
}
