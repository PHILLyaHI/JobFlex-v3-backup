"use client";
import * as React from "react";
import { Compass, MapPin, UserPlus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";

type Strategy = "round-robin" | "first-come" | "territory" | "manual";

export default function LeadsSettingsPage() {
  const [strategy, setStrategy] = React.useState<Strategy>("round-robin");
  const [aiCategorize, setAiCategorize] = React.useState(true);
  const [autoText, setAutoText] = React.useState(true);
  const [businessHours, setBusinessHours] = React.useState(true);
  const [zips, setZips] = React.useState("78701, 78702, 78703, 78704");
  const [maxPerDay, setMaxPerDay] = React.useState(20);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Leads"
        description="Routing, territory, response time, and intake automation."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Routing</CardTitle>
              <CardSubtitle>How new leads land in your team's lap.</CardSubtitle>
            </div>
            <Compass className="h-4 w-4 text-[color:var(--ink-muted)]" />
          </CardHeader>
          <div className="space-y-3">
            <StrategyRow
              value="round-robin"
              active={strategy}
              onSelect={setStrategy}
              title="Round-robin"
              description="Each new lead goes to the next sales rep in rotation."
            />
            <StrategyRow
              value="first-come"
              active={strategy}
              onSelect={setStrategy}
              title="First-come, first-claim"
              description="Pings every rep — whoever taps Claim first owns it."
            />
            <StrategyRow
              value="territory"
              active={strategy}
              onSelect={setStrategy}
              title="By territory"
              description="Routes by ZIP code or service area assignments below."
            />
            <StrategyRow
              value="manual"
              active={strategy}
              onSelect={setStrategy}
              title="Manual triage"
              description="Owner reviews each lead and assigns it personally."
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Service area</CardTitle>
              <CardSubtitle>Used for territory routing and lead-validation.</CardSubtitle>
            </div>
            <MapPin className="h-4 w-4 text-[color:var(--ink-muted)]" />
          </CardHeader>
          <div className="space-y-3">
            <Input
              label="ZIP codes covered"
              value={zips}
              onChange={(e) => setZips(e.target.value)}
              hint="Comma-separated. Used to filter inbound leads."
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Travel radius (mi)" type="number" defaultValue={25} />
              <Select label="Outside-area policy" defaultValue="flag">
                <option value="reject">Reject automatically</option>
                <option value="flag">Flag for owner review</option>
                <option value="surcharge">Add travel surcharge</option>
              </Select>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Intake automation</CardTitle>
            <CardSubtitle>What happens the moment a lead arrives.</CardSubtitle>
          </div>
          <Badge tone="accent" dot>
            AI-assisted
          </Badge>
        </CardHeader>
        <div className="divide-y divide-[color:var(--ink-line)]">
          <Toggle
            checked={aiCategorize}
            onChange={setAiCategorize}
            label="Auto-categorize with AI"
            description="GPT classifies each new lead by trade and sets a confidence score."
          />
          <Toggle
            checked={autoText}
            onChange={setAutoText}
            label="Send instant SMS"
            description={`"Thanks for the inquiry — we'll be in touch within 15 minutes."`}
          />
          <Toggle
            checked={businessHours}
            onChange={setBusinessHours}
            label="Respect business hours"
            description="Hold automated outbound texts between 8pm and 8am local."
          />
          <Toggle
            checked={false}
            onChange={() => {}}
            label="Auto-decline duplicates"
            description="Match phone + email against existing clients in the last 90 days."
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Capacity</CardTitle>
              <CardSubtitle>Caps so your inbox doesn't drown.</CardSubtitle>
            </div>
            <UserPlus className="h-4 w-4 text-[color:var(--ink-muted)]" />
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Max leads / day"
              type="number"
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(Number(e.target.value))}
            />
            <Input label="Max active per rep" type="number" defaultValue={15} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Smart prompts</CardTitle>
              <CardSubtitle>How the AI primes lead summaries.</CardSubtitle>
            </div>
            <Sparkles className="h-4 w-4 text-[color:var(--ink-muted)]" />
          </CardHeader>
          <Select defaultValue="contractor-first">
            <option value="contractor-first">Contractor-first (default)</option>
            <option value="urgent-first">Urgency-first</option>
            <option value="big-job-first">Highest-value first</option>
          </Select>
          <p className="mt-3 text-[11px] text-[color:var(--ink-muted)] leading-relaxed">
            "Contractor-first" prompts the model to surface scope, materials, and urgency in the
            opening summary you see on each lead.
          </p>
        </Card>
      </div>

      <div className="mt-5 flex gap-2">
        <Button onClick={() => toast.success("Saved", "Lead settings updated.")}>
          Save changes
        </Button>
      </div>
    </>
  );
}

function StrategyRow({
  value,
  active,
  onSelect,
  title,
  description,
}: {
  value: Strategy;
  active: Strategy;
  onSelect: (v: Strategy) => void;
  title: string;
  description: string;
}) {
  const isActive = active === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`w-full text-left p-3 rounded-[var(--r-md)] hairline transition-all ${
        isActive
          ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/30"
          : "bg-white/40 hover:bg-white/60 dark:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`text-[13px] font-medium ${
              isActive ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink)]"
            }`}
          >
            {title}
          </div>
          <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 leading-relaxed">
            {description}
          </div>
        </div>
        <span
          className={`mt-1 h-3.5 w-3.5 rounded-full border-2 shrink-0 ${
            isActive
              ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
              : "border-[color:var(--ink-line)]"
          }`}
        >
          {isActive && (
            <span className="block h-1.5 w-1.5 rounded-full bg-white m-auto mt-[3px]" />
          )}
        </span>
      </div>
    </button>
  );
}
