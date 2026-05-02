"use client";
import * as React from "react";
import { Webhook, Facebook, Copy, ExternalLink, Activity } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";

const FAKE_RECEIPTS = [
  {
    id: "1",
    formName: "Roof inspection · IG ad",
    receivedAt: "2 min ago",
    status: "ok" as const,
    name: "Lena Patel",
  },
  {
    id: "2",
    formName: "Free quote — Fence",
    receivedAt: "21 min ago",
    status: "ok" as const,
    name: "Marcus James",
  },
  {
    id: "3",
    formName: "Roof inspection · IG ad",
    receivedAt: "1 hr ago",
    status: "ok" as const,
    name: "Cohen residence",
  },
  {
    id: "4",
    formName: "Free quote — Fence",
    receivedAt: "3 hr ago",
    status: "fail" as const,
    name: "Signature mismatch",
  },
];

export default function MetaSettingsPage() {
  const [connected, setConnected] = React.useState(true);
  const [autoCreate, setAutoCreate] = React.useState(true);
  const [autoText, setAutoText] = React.useState(true);
  const [page, setPage] = React.useState("Patel Roofing & Co.");

  const webhookUrl = "https://app.joblfex.com/api/webhooks/meta";
  const verifyToken = "jflx_2c84_meta_v1";

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text);
    toast.success(`${label} copied`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Meta"
        description="Receive Facebook & Instagram lead form submissions in real time."
      />

      <Card className="mb-5 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-20 -right-20 h-44 w-44 rounded-full bg-[color:var(--accent)]/[0.05] blur-3xl pointer-events-none"
        />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-12 w-12 rounded-[var(--r-md)] hairline grid place-items-center bg-white">
              <Facebook className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-display text-[20px] tracking-[-0.01em]">{page}</div>
                <Badge tone={connected ? "success" : "neutral"} dot>
                  {connected ? "Subscribed" : "Idle"}
                </Badge>
              </div>
              <div className="text-[12px] text-[color:var(--ink-muted)] mt-1">
                Receiving{" "}
                <span className="font-medium text-[color:var(--ink-soft)]">leadgen</span>{" "}
                webhooks from your Meta Business account.
              </div>
            </div>
          </div>
          <div className="shrink-0 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => toast.success("Open Meta", "Tab opens to business.facebook.com")}
            >
              Manage at Meta
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConnected((x) => !x);
                toast.success(connected ? "Unsubscribed" : "Subscribed");
              }}
            >
              {connected ? "Disconnect" : "Connect"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Webhook endpoint</CardTitle>
              <CardSubtitle>Paste these into Meta App Dashboard → Webhooks.</CardSubtitle>
            </div>
            <Webhook className="h-4 w-4 text-[color:var(--ink-muted)]" />
          </CardHeader>
          <div className="space-y-3">
            <div>
              <div className="quiet-caps mb-1.5">Callback URL</div>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly />
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => copy(webhookUrl, "URL")}
                >
                  Copy
                </Button>
              </div>
            </div>
            <div>
              <div className="quiet-caps mb-1.5">Verify token</div>
              <div className="flex gap-2">
                <Input value={verifyToken} readOnly />
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => copy(verifyToken, "Token")}
                >
                  Copy
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-[color:var(--ink-muted)] leading-relaxed">
              Subscribe to <span className="font-mono">leadgen</span> for the page above.
              Subscribed fields populate to the right.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Default lead handling</CardTitle>
              <CardSubtitle>What we do the second a form arrives.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <Select label="Default page" value={page} onChange={(e) => setPage(e.target.value)}>
              <option>Patel Roofing &amp; Co.</option>
              <option>Patel Roofing — Austin</option>
              <option>Patel Roofing — Dallas</option>
            </Select>
            <Select label="Form to lead category" defaultValue="auto">
              <option value="auto">Auto-detect from form name</option>
              <option value="ROOFING">Always Roofing</option>
              <option value="FENCING">Always Fencing</option>
              <option value="OTHER">Always Other</option>
            </Select>
          </div>
          <div className="mt-4 divide-y divide-[color:var(--ink-line)]">
            <Toggle
              checked={autoCreate}
              onChange={setAutoCreate}
              label="Auto-create Lead"
              description="Otherwise the submission lands in the Inbox for manual triage."
            />
            <Toggle
              checked={autoText}
              onChange={setAutoText}
              label="Auto-text the prospect"
              description="Sends our 15-minute response promise via Twilio."
            />
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Recent webhook deliveries</CardTitle>
            <CardSubtitle>Last 24 hours.</CardSubtitle>
          </div>
          <Activity className="h-4 w-4 text-[color:var(--ink-muted)]" />
        </CardHeader>
        <ul className="divide-y divide-[color:var(--ink-line)]">
          {FAKE_RECEIPTS.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-3 gap-4">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[color:var(--ink)]">{r.name}</div>
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                  {r.formName} · {r.receivedAt}
                </div>
              </div>
              {r.status === "ok" ? (
                <Badge tone="success" dot>
                  delivered
                </Badge>
              ) : (
                <Badge tone="danger">failed · retrying</Badge>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            onClick={() => toast.success("Test event sent", "Watch the deliveries list.")}
          >
            Send test event
          </Button>
        </div>
      </Card>
    </>
  );
}
