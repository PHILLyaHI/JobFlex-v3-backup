"use client";
// THE SIGNUP LEDGER (2026-10-01): every account made in the span, who made
// it, where the landing says they came from, and what the subscription is
// now. The live list holds half an hour and the day line holds a day; an
// account older than that had nowhere left to be seen, which is how a signup
// the owner watched arrive became one he could not find again. Nothing new is
// stored for it — these are Organization rows with the landing's tags on them
// and the Subscription beside them, read over a span he picks.
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Megaphone, RefreshCw } from "lucide-react";
import { getSignupLedger } from "@/actions/trafficDashboard";
import type { SignupLedger, SignupRecord, SignupState } from "@/lib/traffic-live";
import s from "./traffic.module.css";

const SPANS: Array<[number, string]> = [[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "A year"]];
const STATE_LABEL: Record<SignupState, string> = {
  trial: "on trial", paying: "paying", lapsed: "lapsed", free: "free plan", unknown: "no plan row",
};

export function SignupLedgerPanel({ initial, timezone, fullHistory = false }: { initial: SignupLedger; timezone: string; fullHistory?: boolean }) {
  const [ledger, setLedger] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (days: number) => {
    setPending(true);
    try {
      setLedger(await getSignupLedger({ days, fullHistory }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the signups.");
    } finally {
      setPending(false);
    }
  }, [fullHistory]);
  useEffect(() => { setLedger(initial); }, [initial]);
  // "Show full history" switched: the same span, counted again.
  const firstWindow = useRef(true);
  useEffect(() => {
    if (firstWindow.current) { firstWindow.current = false; return; }
    void load(ledger.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the window switch reloads here
  }, [fullHistory]);

  const when = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    } catch { return ""; }
  };
  const sum = ledger.summary;
  return (
    <section className={s.ledger} aria-label="Every signup" aria-busy={pending}>
      <div className={s.ledgerHead}>
        <div>
          <h2>Signups</h2>
          <span className={s.micro}>Every account made in the span, and what it is now — this list keeps them; the live view above only holds the last half hour.</span>
        </div>
        <div className={s.ledgerTools}>
          <div className={s.dimensionTabs} style={{ margin: 0 }}>
            {SPANS.map(([d, label]) => (
              <button key={d} type="button" aria-pressed={ledger.days === d} onClick={() => void load(d)} disabled={pending}>{label}</button>
            ))}
          </div>
          <button type="button" className={s.iconButton} aria-label="Refresh the signups" onClick={() => void load(ledger.days)} disabled={pending}>
            <RefreshCw size={16} className={pending ? s.spin : ""}/>
          </button>
        </div>
      </div>

      <div className={s.ledgerSummary}>
        <div><span>Signups</span><strong>{sum.total.toLocaleString("en-US")}</strong><small>{sum.fromAds > 0 ? `${sum.fromAds} from ads` : "none from ads"}</small></div>
        <div data-state="trial"><span>On trial</span><strong>{sum.trial}</strong><small>still deciding</small></div>
        <div data-state="paying"><span>Paying</span><strong>{sum.paying}</strong><small>subscription active</small></div>
        <div data-state="lapsed"><span>Lapsed</span><strong>{sum.lapsed}</strong><small>canceled, expired or failed</small></div>
        <div data-state="free"><span>Free plan</span><strong>{sum.free + sum.unknown}</strong><small>{sum.unknown > 0 ? `${sum.unknown} with no plan row` : "never upgraded"}</small></div>
      </div>

      {error && <div className={s.notice} role="status"><Info size={16}/><div><strong>{error}</strong></div></div>}

      {ledger.records.length === 0 ? (
        <div className={s.liveEmpty}>No accounts were made in this span.</div>
      ) : (
        <ol className={s.ledgerList}>
          {ledger.records.map((r) => <LedgerRow key={r.orgId} r={r} when={when}/>)}
        </ol>
      )}
      {ledger.truncated && <p className={s.footnote}>Showing the newest 400 of this span. Choose a shorter one to see them all.</p>}
    </section>
  );
}

function LedgerRow({ r, when }: { r: SignupRecord; when: (iso: string) => string }) {
  return (
    <li className={s.ledgerRow} data-state={r.state}>
      <div className={s.ledgerMark} aria-hidden="true"/>
      <div className={s.ledgerWho}>
        <b>{r.orgName}</b>
        <span>{r.ownerName ? `${r.ownerName} · ` : ""}{r.ownerEmail || "no owner yet"}</span>
      </div>
      <div className={s.ledgerFrom}>
        <b>{r.fromAd && <em className={s.liveAd}><Megaphone size={11}/>Ad</em>}{r.source}</b>
        <span>{[r.campaign, r.content].filter(Boolean).join(" · ") || "no campaign tag"}{r.industry && r.industry !== "default" ? ` · ${r.industry} landing` : ""}</span>
      </div>
      <div className={s.ledgerPlan}>
        <b className={s.livePlan} data-state={r.state}>{r.planLabel}</b>
        <span>{STATE_LABEL[r.state]}</span>
      </div>
      <div className={s.ledgerWhen}><b>{when(r.createdAt)}</b></div>
    </li>
  );
}
