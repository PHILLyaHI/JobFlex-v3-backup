"use client";
/**
 * "Email this report daily" (2026-10-04), in the Measurement notes: the
 * admins' switch for the daily digest's email (lib/traffic-digest). The
 * day's reading is saved either way; this only decides the email.
 */
import { useEffect, useState } from "react";
import { getAnalystHistory, setTrafficDigestEmail, type DigestSettings } from "@/actions/trafficHistory";
import { toast } from "@/components/ui/toast-store";
import s from "./traffic.module.css";

export function DigestToggle({ timezone }: { timezone: string }) {
  const [d, setD] = useState<DigestSettings | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let live = true;
    getAnalystHistory().then((h) => { if (live) setD(h.digest); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  async function change(on: boolean) {
    // The box moves at once; a refusal puts it back.
    const was = !!d?.emailOn;
    setD((cur) => (cur ? { ...cur, emailOn: on } : cur));
    setPending(true);
    try {
      const r = await setTrafficDigestEmail({ on });
      setD((cur) => (cur ? { ...cur, emailOn: r.emailOn } : cur));
      if (r.ok) toast.success(on ? "The daily email is on" : "The daily email is off");
      else toast.error("Not saved", r.error);
    } catch (err) {
      setD((cur) => (cur ? { ...cur, emailOn: was } : cur));
      toast.error("Not saved", err instanceof Error ? err.message : undefined);
    }
    finally { setPending(false); }
  }
  const sent = d?.lastSentAt ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d.lastSentAt)) : null;
  return <div data-testid="digest-toggle">
    <label className={s.liveToggle} data-live={!!d?.emailOn}><input type="checkbox" checked={!!d?.emailOn} disabled={!d || pending} onChange={(e) => void change(e.target.checked)}/>Email this report daily</label>
    <p>{d ? <>The analyst&apos;s reading is saved every day at 8:00 AM Los Angeles for the trend{d.emailOn ? <>, and emailed as Markdown to <b>{d.recipients.join(", ")}</b></> : <>; the email is off</>}. {sent ? `Last sent ${sent}.` : "Nothing sent yet."}</> : "Reading the setting…"}</p>
  </div>;
}
