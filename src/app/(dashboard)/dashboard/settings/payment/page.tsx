"use client";
import * as React from "react";
import { CreditCard, Landmark, Wallet, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";

export default function PaymentSettingsPage() {
  const [stripe, setStripe] = React.useState(true);
  const [square, setSquare] = React.useState(false);
  const [paypal, setPaypal] = React.useState(false);
  const [ach, setAch] = React.useState(true);
  const [autoRemind, setAutoRemind] = React.useState(true);
  const [late, setLate] = React.useState(true);
  const [currency, setCurrency] = React.useState("USD");
  const [depositPct, setDepositPct] = React.useState(30);
  const [terms, setTerms] = React.useState("Net 14");

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Payment"
        description="Choose how clients can pay and how invoices behave."
      />

      <Card className="mb-5">
        <CardHeader>
          <div>
            <CardTitle>Processors</CardTitle>
            <CardSubtitle>Toggle the methods clients see at checkout.</CardSubtitle>
          </div>
          <Badge tone="accent" dot>
            Live
          </Badge>
        </CardHeader>
        <ul className="divide-y divide-[color:var(--ink-line)]">
          <ProcessorRow
            icon={<CreditCard className="h-3.5 w-3.5" />}
            name="Stripe"
            description="Cards, Apple Pay, Google Pay. Fee 2.9% + 30¢."
            checked={stripe}
            onChange={setStripe}
          />
          <ProcessorRow
            icon={<Wallet className="h-3.5 w-3.5" />}
            name="Square"
            description="Cards + ACH for U.S. accounts. Fee 2.6% + 10¢."
            checked={square}
            onChange={setSquare}
          />
          <ProcessorRow
            icon={<Wallet className="h-3.5 w-3.5" />}
            name="PayPal"
            description="PayPal balance, cards, Pay Later."
            checked={paypal}
            onChange={setPaypal}
          />
          <ProcessorRow
            icon={<Landmark className="h-3.5 w-3.5" />}
            name="ACH bank transfer"
            description="Lower fees on large jobs. 1–3 business days to clear."
            checked={ach}
            onChange={setAch}
          />
        </ul>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Defaults</CardTitle>
              <CardSubtitle>Used on every new proposal &amp; invoice.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="USD">USD · $</option>
              <option value="CAD">CAD · $</option>
              <option value="GBP">GBP · £</option>
              <option value="EUR">EUR · €</option>
            </Select>
            <Input
              label="Deposit %"
              type="number"
              value={depositPct}
              onChange={(e) => setDepositPct(Number(e.target.value))}
              hint="Required to schedule"
            />
            <Input
              label="Net terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              hint="e.g. Net 14, Due on receipt"
            />
            <Input label="Late fee" defaultValue="1.5%" hint="Per month after due" />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Automations</CardTitle>
              <CardSubtitle>Quiet, persistent reminders.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="divide-y divide-[color:var(--ink-line)]">
            <Toggle
              checked={autoRemind}
              onChange={setAutoRemind}
              label="Auto-remind on overdue invoices"
              description="Email + SMS at +3 days, +7 days, +14 days past due."
            />
            <Toggle
              checked={late}
              onChange={setLate}
              label="Apply late fees automatically"
              description="Adds the configured rate at the close of each billing cycle."
            />
            <Toggle
              checked={true}
              onChange={() => {}}
              label="Receipts on payment"
              description="Send a branded receipt to the client immediately after payment."
            />
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Compliance</CardTitle>
            <CardSubtitle>Required for processor verification.</CardSubtitle>
          </div>
          <Badge tone="success" dot>
            Verified
          </Badge>
        </CardHeader>
        <div className="paper-card p-4 flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
          <div className="text-[12px] text-[color:var(--ink-soft)] leading-relaxed">
            Your business documents are on file with Stripe. Update them under{" "}
            <span className="text-[color:var(--accent)]">stripe.com/dashboard</span> if your tax
            ID, address, or beneficial owner changes.
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button onClick={() => toast.success("Saved", "Payment defaults updated.")}>
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => toast.success("Test charge", "Stripe sandbox event sent.")}>
            Send test charge
          </Button>
        </div>
      </Card>
    </>
  );
}

function ProcessorRow({
  icon,
  name,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between py-3.5 gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-7 w-7 rounded-[var(--r-sm)] hairline grid place-items-center text-[color:var(--ink-muted)] shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-[color:var(--ink)]">{name}</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{description}</div>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </li>
  );
}
