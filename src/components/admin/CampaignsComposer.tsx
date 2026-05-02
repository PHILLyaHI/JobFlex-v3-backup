"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Send, Trash2, Megaphone } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { listStagger, listItem } from "@/lib/theme/motion";
import { relative, longDate } from "@/lib/format";
import { sendPlatformCampaign, deletePlatformCampaign } from "@/actions/admin";

export interface CampaignRow {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export function CampaignsComposer({
  history,
  totalOrgs,
}: {
  history: CampaignRow[];
  totalOrgs: number;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [expiresInDays, setExpiresInDays] = React.useState(14);
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  async function send() {
    if (!title.trim() || !body.trim()) {
      toast.error("Need a title and body");
      return;
    }
    setBusy(true);
    try {
      await sendPlatformCampaign({ title, body, expiresInDays });
      toast.success(`Sent to ${totalOrgs} organizations`);
      setTitle("");
      setBody("");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't send", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Retract this campaign?")) return;
    setDeleting(id);
    try {
      await deletePlatformCampaign(id);
      toast.success("Retracted");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't retract", err?.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Compose campaign</CardTitle>
            <CardSubtitle>
              Posts a platform-scope announcement that every tenant sees on their dashboard.
            </CardSubtitle>
          </div>
          <Megaphone className="h-4 w-4 text-[color:var(--ink-muted)]" />
        </CardHeader>
        <div className="space-y-3">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="JobFlex 2.4 — change orders, Gantt charts, and more"
          />
          <Textarea
            label="Body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="A short message that lands on the dashboard banner. Keep it under 280 characters."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Expires in (days)"
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Math.max(1, Number(e.target.value) || 1))}
              hint="Auto-removes from the banner after this window."
            />
            <div className="flex flex-col justify-end">
              <div className="paper-card !shadow-none px-3 py-2.5">
                <div className="quiet-caps !mb-0">Reach</div>
                <div className="font-display tabular text-[16px] mt-0.5">
                  {totalOrgs.toLocaleString()} org{totalOrgs === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={send}
            loading={busy}
            icon={<Send className="h-3.5 w-3.5" />}
            disabled={!title.trim() || !body.trim()}
          >
            Send to all
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent campaigns</CardTitle>
            <CardSubtitle>Last {history.length} sent.</CardSubtitle>
          </div>
        </CardHeader>
        {history.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No campaigns sent yet.</p>
        ) : (
          <motion.ul
            variants={listStagger}
            initial="initial"
            animate="animate"
            className="divide-y divide-[color:var(--ink-line)]"
          >
            {history.map((c) => {
              const expired = c.expiresAt && c.expiresAt < new Date();
              return (
                <motion.li key={c.id} variants={listItem} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                        {c.title}
                      </div>
                      <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 line-clamp-2 leading-snug">
                        {c.body}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[10.5px] tabular text-[color:var(--ink-muted)]">
                        <span>{relative(c.createdAt)}</span>
                        {c.expiresAt && (
                          <>
                            <span>·</span>
                            <Badge tone={expired ? "neutral" : "accent"}>
                              {expired ? "expired" : `to ${longDate(c.expiresAt)}`}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={deleting === c.id}
                      onClick={() => onDelete(c.id)}
                      className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40 shrink-0"
                      aria-label="Retract campaign"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </Card>
    </div>
  );
}
