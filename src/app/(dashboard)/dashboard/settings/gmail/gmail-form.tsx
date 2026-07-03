"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AtSign, Link2, ShieldCheck, RefreshCw, Send, Save } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";
import { updateGmailSettings, disconnectGmail, sendGmailTestEmail } from "@/actions/settings";
import type { GmailSettings } from "@/lib/settings";

const GMAIL_STATUS: Record<string, { ok: boolean; title: string; msg: string }> = {
  connected: { ok: true, title: "Gmail connected", msg: "Outbound mail now sends from your inbox." },
  denied: { ok: false, title: "Connection canceled", msg: "You didn't grant access." },
  unconfigured: { ok: false, title: "Gmail not available", msg: "GMAIL_OAUTH_* env vars aren't set on the server." },
  norefresh: { ok: false, title: "Couldn't connect", msg: "Google didn't return a refresh token — remove JobFlex from your Google account's third-party access, then retry." },
  badstate: { ok: false, title: "Connection expired", msg: "The link timed out — try connecting again." },
  mismatch: { ok: false, title: "Couldn't connect", msg: "Session/organization mismatch — try again." },
  error: { ok: false, title: "Couldn't connect", msg: "Something went wrong exchanging the token." },
};

export function GmailForm({ initial }: { initial: GmailSettings }) {
  const router = useRouter();
  const connected = initial.connected;
  const [sendFromUser, setSendFromUser] = React.useState(initial.sendFromUser);
  const [trackOpens, setTrackOpens] = React.useState(initial.trackOpens);
  const [autoSync, setAutoSync] = React.useState(initial.autoSync);
  const [displayName, setDisplayName] = React.useState(initial.displayName);
  const [replyTo, setReplyTo] = React.useState(initial.replyTo);
  const [signature, setSignature] = React.useState(initial.signature);
  const [busy, setBusy] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  async function sendTest() {
    setTesting(true);
    try {
      const res = await sendGmailTestEmail();
      toast.success(
        "Test sent",
        `Sent to ${res.to} via ${res.via === "gmail" ? "your Gmail" : "Resend"}.`,
      );
    } catch (err: unknown) {
      toast.error("Test failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setTesting(false);
    }
  }

  // Surface the OAuth callback result (?gmail=…) once, then clean the URL.
  React.useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("gmail");
    if (!status) return;
    const s = GMAIL_STATUS[status];
    if (s) (s.ok ? toast.success : toast.error)(s.title, s.msg);
    window.history.replaceState(null, "", "/dashboard/settings/gmail");
  }, []);

  // Real OAuth: hand off to the server route, which redirects to Google.
  function connect() {
    window.location.href = "/api/integrations/gmail/connect";
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await disconnectGmail();
      toast.success("Disconnected", "Sends now use Resend with your reply-to address.");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't disconnect", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await updateGmailSettings({
        connected,
        sendFromUser,
        trackOpens,
        autoSync,
        displayName,
        replyTo,
        signature,
      });
      toast.success("Saved", "Gmail settings updated.");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Save failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
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
                  ? `Outbound mail routes through ${initial.connectedEmail || "your Gmail"}. We hold an OAuth refresh token only — never your password.`
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
                  onClick={connect}
                >
                  Reconnect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={disconnecting}
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={connect} icon={<Link2 className="h-3.5 w-3.5" />}>
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
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Phillip @ JobFlex"
              hint="Appears before the email address in the recipient's inbox."
            />
            <Input
              label="Reply-to address"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="you@yourcompany.com"
            />
            <Select
              label="Default signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
            >
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
          <Scope name="gmail.send" description="Send mail on your behalf" granted={connected} />
          <Scope name="userinfo.email" description="Read your email address to set the From" granted={connected} />
        </ul>
        <div className="mt-5 flex gap-2">
          <Button loading={busy} onClick={save} icon={<Save className="h-3.5 w-3.5" />}>
            Save changes
          </Button>
          <Button
            variant="outline"
            loading={testing}
            icon={<Send className="h-3.5 w-3.5" />}
            onClick={sendTest}
          >
            Send test email
          </Button>
        </div>
      </Card>
    </>
  );
}

function Scope({
  name,
  description,
  granted,
}: {
  name: string;
  description: string;
  granted: boolean;
}) {
  return (
    <li className="flex items-center justify-between py-2.5">
      <div>
        <div className="font-mono text-[11.5px] text-[color:var(--ink)]">{name}</div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{description}</div>
      </div>
      <Badge tone={granted ? "success" : "neutral"}>{granted ? "Granted" : "Not granted"}</Badge>
    </li>
  );
}
