"use client";
// THE SIGNUP LEDGER (2026-10-01): every account made in the span, who made
// it, where the landing says they came from, and what the subscription is
// now. The live list holds half an hour; an account older than that had
// nowhere left to be seen, which is how a signup the owner watched arrive
// became one the owner could not find again. Nothing new is stored for it —
// these are Organization rows with the landing's tags on them and the
// Subscription beside them, read over a span the owner picks.
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Megaphone, RefreshCw, UserPlus } from "lucide-react";
import { getSignupLedger } from "@/actions/trafficDashboard";
import type { SignupLedger, SignupRecord } from "@/lib/traffic-live";
import { RangeSelect } from "./range-select";
import s from "./traffic.module.css";

const SPANS: Array<[number, string]> = [[1, "Today"], [7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [365, "Last year"]];
/** Rows before "Show all" — the summary above always counts the whole span. */
const ROWS_SHOWN = 8;

export function SignupLedgerPanel({ initial, timezone, fullHistory = false }: { initial: SignupLedger; timezone: string; fullHistory?: boolean }) {
  const [ledger, setLedger] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);

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
  const records = all ? ledger.records : ledger.records.slice(0, ROWS_SHOWN);
  return (
    <section className={s.section} id="signups" aria-labelledby="traffic-signups-title" aria-busy={pending}>
      <header className={s.sectionHead}>
        <div className={s.sectionTitle}>
          <span className={s.sectionIcon} aria-hidden="true"><UserPlus size={22}/></span>
          <h2 id="traffic-signups-title">Signups</h2>
        </div>
        <div className={s.sectionTools}>
          <RangeSelect label="Signup span" value={ledger.days} options={SPANS} onChange={(d) => { setAll(false); void load(d); }} disabled={pending}/>
          <button type="button" className={s.iconButton} aria-label="Refresh the signups" onClick={() => void load(ledger.days)} disabled={pending}>
            <RefreshCw size={16} className={pending ? s.spin : ""}/>
          </button>
        </div>
      </header>

      <div className={s.card}>
        <div className={s.kpis} data-cols="5">
          <div className={s.kpi} data-lead="true"><span>Signups</span><strong>{sum.total.toLocaleString("en-US")}</strong><small>{sum.fromAds > 0 ? `${sum.fromAds} from ads` : "none from ads"}</small></div>
          <div className={s.kpi} data-tone="paying"><span><i aria-hidden="true"/>Paying</span><strong>{sum.paying}</strong><small>subscription active</small></div>
          <div className={s.kpi} data-tone="trial"><span><i aria-hidden="true"/>On trial</span><strong>{sum.trial}</strong><small>still deciding</small></div>
          <div className={s.kpi} data-tone="lapsed"><span><i aria-hidden="true"/>Lapsed</span><strong>{sum.lapsed}</strong><small>canceled, expired or failed</small></div>
          <div className={s.kpi} data-tone="free"><span><i aria-hidden="true"/>Free plan</span><strong>{sum.free + sum.unknown}</strong><small>{sum.unknown > 0 ? `${sum.unknown} with no plan row` : "never upgraded"}</small></div>
        </div>

        {error && <div className={s.cardNote} role="status"><Info size={16}/><span>{error}</span></div>}

        {ledger.records.length === 0 ? (
          <div className={s.empty}>No accounts were made in this span.</div>
        ) : (
          <div className={s.ledger}>
            <div className={s.ledgerCols} aria-hidden="true"><span>Company</span><span>Came from</span><span>Plan now</span><span>Signed up</span></div>
            <ol className={s.ledgerList}>
              {records.map((r) => <LedgerRow key={r.orgId} r={r} when={when}/>)}
            </ol>
          </div>
        )}
        {ledger.records.length > ROWS_SHOWN && <button type="button" className={s.moreButton} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${ledger.records.length.toLocaleString("en-US")}`}</button>}
        {ledger.truncated && all && <p className={s.cardFoot}>Showing the newest 400 of this span. Choose a shorter one to see them all.</p>}
      </div>
    </section>
  );
}

function LedgerRow({ r, when }: { r: SignupRecord; when: (iso: string) => string }) {
  return (
    <li className={s.ledgerRow} data-state={r.state}>
      <div className={s.ledgerWho}>
        <b>{r.orgName}</b>
        <span>{r.ownerName ? `${r.ownerName} · ` : ""}{r.ownerEmail || "no owner yet"}</span>
      </div>
      <div className={s.ledgerFrom}>
        <b>{r.fromAd && <i className={s.tagAd}><Megaphone size={11}/>Ad</i>}{r.source}</b>
        <span>{[r.campaign, r.content].filter(Boolean).join(" · ") || "no campaign tag"}{r.industry && r.industry !== "default" ? ` · ${r.industry} landing` : ""}</span>
      </div>
      <div className={s.ledgerPlan}>
        <b className={s.stampPlan} data-state={r.state}>{r.planLabel}</b>
      </div>
      <div className={s.ledgerWhen}>{when(r.createdAt)}</div>
    </li>
  );
}
