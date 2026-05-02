"use client";
import * as React from "react";
import { AtSign, Link2, ShieldCheck, RefreshCw, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";

export default function GmailSettingsPage() {
  const [connected, setConnected] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [sendFromUser, setSendFromUser] = React.useState(true);
  const [trackOpens, setTrackOpens] = React.useState(true);
  const [autoSync, setAutoSync] = React.useState(false);

  async function connect() {
    setBusy(true);
    setTimeout(() => {
      setConnected(true);
      setBusy(false);
      toast.success("Gmail connected", "Outbound mail will now route through your account.");
    }, 600);
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Gmail"
        description="Send proposals and follow-ups from your own inbox — replies land where they should."
      />

      <Card className="mb-5 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-20 -right-20 h-44 w-44 rounded-full bg-[color:var(--accent)]/[0.06] blur-3xl pointer-events-none"
        />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-12 w-12 rounded-[var(--r-md)] hairline grid place-items-center bg-white">
              <AtSign className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-display text-[20px] tracking-[-0.01em]">
                  {connected ? "Connected" : "Not connected"}
                </div>
                {connected && (
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                )}
              </div>
              <div className="text-[12px] text-[color:var(--ink-muted)] mt-1 leading-relaxed max-w-md">
                {connected
                  ? "Sending as phillip@joblfex.com via Google OAuth. Tokens auto-refresh."
                  : "We'll never see your password — Google handles auth and we keep an OAuth refresh token only."}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex gap-2">
            {connected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => toast.success("Token refreshed")}
                >
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConnected(false);
                    toast.success("Disconnected");
                  }}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                loading={busy}
                onClick={connect}
                icon={<Link2 className="h-3.5 w-3.5" />}
              >
                Connect Gmail
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>From address</CardTitle>
              <CardSubtitle>How outbound mail is signed.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <Input
              label="Display name"
              defaultValue="Phillip @ JobFlex"
              hint="Appears before the email address in the recipient's inbox."
            />
            <Input label="Reply-to address" defaultValue="phillip@joblfex.com" />
            <Select label="Default signature" defaultValue="brand">
              <option value="brand">Brand signature</option>
              <option value="personal">Personal signature</option>
              <option value="none">No signature</option>
            </Select>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Behavior</CardTitle>
              <CardSubtitle>Quietly improve every send.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="divide-y divide-[color:var(--ink-line)]">
            <Toggle
              checked={sendFromUser}
              onChange={setSendFromUser}
              label="Send from my Gmail"
              description="Falls back to Resend when this user isn't connected."
            />
            <Toggle
              checked={trackOpens}
              onChange={setTrackOpens}
              label="Track opens"
              description="Embed a 1px tracking pixel. Disable for Apple Mail Privacy clients."
            />
            <Toggle
              checked={autoSync}
              onChange={setAutoSync}
              label="Two-way thread sync"
              description="Pull replies into the JobFlex Messages inbox automatically."
            />
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Permissions</CardTitle>
            <CardSubtitle>Granted scopes — you can review or revoke any time.</CardSubtitle>
          </div>
          <ShieldCheck className="h-4 w-4 text-[color:var(--ink-muted)]" />
        </CardHeader>
        <ul className="text-[12px] text-[color:var(--ink-soft)] divide-y divide-[color:var(--ink-line)]">
          <Scope name="gmail.send" description="Send mail on your behalf" />
          <Scope name="gmail.readonly" description="Read replies for thread sync" />
          <Scope name="gmail.modify" description="Mark replies as read after import" />
        </ul>
        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            icon={<Send className="h-3.5 w-3.5" />}
            onClick={() => toast.success("Test sent", "Check your inbox.")}
          >
            Send test email
          </Button>
        </div>
      </Card>
    </>
  );
}

function Scope({ name, description }: { name: string; description: string }) {
  return (
    <li className="flex items-center justify-between py-2.5">
      <div>
        <div className="font-mono text-[11.5px] text-[color:var(--ink)]">{name}</div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{description}</div>
      </div>
      <Badge tone="success" dot>
        Granted
      </Badge>
    </li>
  );
}
