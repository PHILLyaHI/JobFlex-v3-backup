"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UserPlus, Trash2, Mail, Phone, Send } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/format";
import {
  updateApplicantStatus,
  appendApplicantNote,
  convertApplicantToWorker,
  deleteApplicant,
} from "@/actions/applicants";

interface Applicant {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  source: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
}

const TONE: Record<string, "neutral" | "accent" | "success" | "danger" | "warn"> = {
  APPLIED: "accent",
  INTERVIEWING: "warn",
  HIRED: "success",
  REJECTED: "danger",
};

export function ApplicantDetail({ applicant }: { applicant: Applicant }) {
  const router = useRouter();
  const [status, setStatus] = React.useState(applicant.status);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function changeStatus(next: string) {
    setStatus(next);
    setBusy("status");
    try {
      await updateApplicantStatus(applicant.id, next);
      toast.success("Updated");
      router.refresh();
    } catch (err: any) {
      setStatus(applicant.status);
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function addNote() {
    if (!noteDraft.trim()) return;
    setBusy("note");
    try {
      await appendApplicantNote(applicant.id, noteDraft.trim());
      setNoteDraft("");
      toast.success("Note added");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function convertToWorker() {
    if (!confirm(`Convert ${applicant.fullName} into an active worker?`)) return;
    setBusy("convert");
    try {
      await convertApplicantToWorker(applicant.id);
      toast.success("Converted to worker", "They'll get a magic-link invite next.");
      router.push("/dashboard/workers" as any);
    } catch (err: any) {
      toast.error("Couldn't convert", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this applicant?")) return;
    setBusy("delete");
    try {
      await deleteApplicant(applicant.id);
      toast.success("Deleted");
      router.push("/dashboard/hire" as any);
    } catch (err: any) {
      toast.error("Couldn't delete", err?.message);
    } finally {
      setBusy(null);
    }
  }

  const noteEntries = React.useMemo(() => {
    if (!applicant.notes) return [] as { stamp: string; text: string }[];
    return applicant.notes.split(/\n\n+/).map((block) => {
      const m = block.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) — (.+)/s);
      if (m) return { stamp: m[1], text: m[2] };
      return { stamp: "", text: block };
    });
  }, [applicant.notes]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-5">
        <Card>
          <div className="flex items-start gap-4">
            <Avatar name={applicant.fullName} size={56} />
            <div className="flex-1 min-w-0">
              <div className="font-display text-[24px] tracking-[-0.015em] leading-tight">
                {applicant.fullName}
              </div>
              <div className="text-[13px] text-[color:var(--ink-soft)] mt-1">{applicant.role}</div>
              <div className="flex items-center gap-3 mt-3 text-[12px] text-[color:var(--ink-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  <a className="hover:text-[color:var(--accent)]" href={`mailto:${applicant.email}`}>
                    {applicant.email}
                  </a>
                </span>
                {applicant.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {applicant.phone}
                  </span>
                )}
              </div>
            </div>
            <Badge tone={TONE[status] ?? "neutral"}>{status.toLowerCase()}</Badge>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Notes</CardTitle>
              <CardSubtitle>Interview observations, follow-ups, decisions.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <Textarea
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Phone screen — strong communicator, available start of next month…"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                loading={busy === "note"}
                onClick={addNote}
                icon={<Send className="h-3 w-3" />}
              >
                Add note
              </Button>
            </div>
          </div>

          {noteEntries.length > 0 && (
            <ul className="mt-5 pt-4 border-t border-[color:var(--ink-line)] space-y-3">
              {noteEntries.map((n, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  className="paper-card !shadow-none p-3 text-[12.5px] text-[color:var(--ink-soft)] whitespace-pre-line"
                >
                  {n.stamp && (
                    <div className="quiet-caps !mb-1.5">{n.stamp}</div>
                  )}
                  {n.text}
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pipeline status</CardTitle>
              <CardSubtitle>Drag changes also save here.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-2">
            {[
              { v: "APPLIED", label: "Applied" },
              { v: "INTERVIEWING", label: "Interviewing" },
              { v: "HIRED", label: "Hired" },
              { v: "REJECTED", label: "Rejected" },
            ].map((opt) => {
              const active = status === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  disabled={busy === "status"}
                  onClick={() => changeStatus(opt.v)}
                  className={cn(
                    "w-full p-3 rounded-[var(--r-md)] hairline text-left transition-all",
                    active
                      ? "bg-[color:var(--accent-soft)]/50 border-[color:var(--accent)]/30"
                      : "bg-white/40 hover:bg-white/60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink)]",
                      )}
                    >
                      {opt.label}
                    </span>
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Details</CardTitle>
              <CardSubtitle>Source, applied date, options.</CardSubtitle>
            </div>
          </CardHeader>
          <dl className="text-[12px] space-y-2">
            <div className="flex justify-between">
              <dt className="text-[color:var(--ink-muted)]">Source</dt>
              <dd className="text-[color:var(--ink-soft)] tabular">{applicant.source ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[color:var(--ink-muted)]">Applied</dt>
              <dd className="text-[color:var(--ink-soft)] tabular">
                {shortDate(applicant.createdAt)}
              </dd>
            </div>
          </dl>
          <div className="mt-4 pt-4 border-t border-[color:var(--ink-line)] space-y-2">
            <Button
              variant="primary"
              loading={busy === "convert"}
              onClick={convertToWorker}
              icon={<UserPlus className="h-3.5 w-3.5" />}
              disabled={status === "HIRED"}
            >
              Convert to worker
            </Button>
            <Button
              variant="ghost"
              loading={busy === "delete"}
              onClick={onDelete}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Delete applicant
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
