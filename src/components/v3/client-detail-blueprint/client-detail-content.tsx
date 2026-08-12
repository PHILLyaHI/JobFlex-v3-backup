"use client";

// CLIENT DETAIL / BLUEPRINT — the page.
// Route: /dashboard/client-detail.
//
// The old client record (src/app/(dashboard)/dashboard/clients/[id]/page.tsx)
// contributed its CONTENT LIST and nothing else: identity, contact, tags,
// proposals, payments, activity, and the figures worth a headline. Its layout —
// a three-column grid of four same-weight cards — is the thing being replaced,
// not the thing being ported.
//
// THE COMPOSITION, top to bottom, decaying in weight:
//
//   MASTHEAD      the client's NAME at the shell's 46px/900. A record page
//                 should be titled by who it is about, so the name is not
//                 repeated inside the band below it.
//   PARTICULARS   a headless band: an ink monogram stamp and the company on
//                 the left, the reachable facts on the right, one 2px rule
//                 between them. Headless on purpose — it needs no title to say
//                 what it is, and skipping the title keeps it a different
//                 SHAPE from every card under it.
//   FIGURES       the house KPI strip. The only 38px type on the page.
//   LEDGER        proposals, full width, the tallest object and the real
//                 content. Chips filter it in place.
//   TAIL          payments and activity side by side, the lightest beat.
//
// DERIVED, NEVER STORED. Every headline figure is computed from the fixture
// arrays on this render. A hardcoded lifetime total is a number that goes
// stale the first time somebody edits a payment row, and a page that lies
// about its own arithmetic is worse than one with no figures.
//
// THE CHIPS DO NOT REPLAY THE ENTRANCE. Filtering re-renders the ledger and
// nothing animates — see the note in ./use-reveal.ts about the observer trap
// that would otherwise wipe the list on every click.
//
// Nothing here writes. The masthead carries no record number and no fixture
// disclaimer: a page titled by a person should not be annotated by a filing
// code, and a caveat pinned beside the actions reads as part of the actions.

import { useCallback, useMemo, useRef, useState } from "react";
import { type ProposalFilter, bucketOf, money } from "./client-detail-data";
import type { ClientDetailView } from "./client-detail-load";
import {
  Btn,
  EmptyNote,
  Fact,
  Ic,
  Panel,
  PaymentBadge,
  ProposalBadge,
  Tag,
  cx,
} from "./cd-ui";
import {
  ClientEditDialog,
  ClientMessageDialog,
  type EditHandle,
  type MessageHandle,
} from "./cd-dialogs";
import styles from "./client-detail.module.css";
import { useReveal } from "./use-reveal";

const FILTERS: { value: ProposalFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export function ClientDetailContent({ view }: { view: ClientDetailView }) {
  const { clientId, client: CLIENT, proposals: PROPOSALS, payments: PAYMENTS, activity: ACTIVITY } = view;
  const [filter, setFilter] = useState<ProposalFilter>("all");
  const editRef = useRef<EditHandle | null>(null);
  const messageRef = useRef<MessageHandle | null>(null);

  // The fleet entrance cascade. Marker-driven, plays once on mount.
  useReveal();

  const counts = useMemo(() => {
    const base: Record<ProposalFilter, number> = { all: PROPOSALS.length, draft: 0, open: 0, won: 0, lost: 0 };
    for (const p of PROPOSALS) base[bucketOf(p.status)] += 1;
    return base;
  }, [PROPOSALS]);

  const rows = useMemo(
    () => (filter === "all" ? PROPOSALS : PROPOSALS.filter((p) => bucketOf(p.status) === filter)),
    [filter, PROPOSALS],
  );

  const figures = useMemo(() => {
    const paid = PAYMENTS.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amount, 0);
    const due = PAYMENTS.filter((p) => p.status === "PENDING").reduce((a, p) => a + p.amount, 0);
    const sent = PROPOSALS.filter((p) => p.status !== "DRAFT").length;
    const won = PROPOSALS.filter((p) => p.status === "ACCEPTED").length;
    return {
      paid,
      due,
      sent,
      // Acceptance is measured against what actually went out, not against
      // drafts sitting in a folder.
      rate: sent === 0 ? 0 : Math.round((won / sent) * 100),
    };
  }, [PAYMENTS, PROPOSALS]);

  // NEW PROPOSAL opens the estimator picker rather than routing straight to an
  // engine, because the record page has no business deciding whether this job
  // is a roof, a fence or a hand-written sheet. The client rides along on the
  // event: whichever engine is chosen receives `?client=<id>` and starts with
  // this client already attached, so a proposal begun from a client's record
  // can never be saved against nobody. The picker is mounted once in the shell
  // and listens on the document — the topbar's own New Estimate button opens
  // the same dialog the same way, minus the client.
  const newProposal = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent("jf:estimator-picker", { detail: clientId ? { clientId } : undefined }),
    );
  }, [clientId]);

  // The band prints the address as ONE SENTENCE and the form edits the four
  // columns it was built from, so the raw values travel from the server beside
  // the formatted ones. Splitting "14208 NE 182nd St, Woodinville, WA 98072"
  // back into street / city / state / zip would be guessing at commas, and the
  // first client who wrote "Suite B, Building 2" would have their address
  // quietly rearranged by an edit they never made.
  const editValues = view.editable;

  return (
    <div className={styles.page}>
      {/* MASTHEAD --------------------------------------------------- */}
      <div className={cx("page-head", styles.head)} data-rv="">
        <div>
          <div className="kicker">Client · {CLIENT.city}</div>
          <h1 className="page-title">{CLIENT.name}</h1>
        </div>
        <div className={styles.headRight}>
          <div className={styles.actions}>
            <Btn tone="quiet" icon="pen" onClick={() => editRef.current?.open()}>
              Edit
            </Btn>
            <Btn icon="msg" onClick={() => messageRef.current?.open()}>
              Message
            </Btn>
            <Btn tone="primary" icon="plus" onClick={newProposal}>
              New proposal
            </Btn>
          </div>
        </div>
      </div>

      <div className={styles.stack}>
        {/* PARTICULARS ---------------------------------------------- */}
        <section data-rv="" className={styles.card} aria-label="Client particulars">
          <div className={styles.bandGrid}>
            <div className={styles.bandId}>
              <div className={styles.lockup}>
                <span className={styles.stamp} aria-hidden="true">
                  {CLIENT.initials}
                </span>
                <span className={styles.company}>
                  {CLIENT.company}
                  <span className={styles.companySub}>Last contact {CLIENT.lastContact}</span>
                </span>
              </div>
              <div className={styles.tags}>
                {CLIENT.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </div>

            {/* Two paired rows of tokens, then the one sentence. Billing used
                to trail the address and sat alone on the last row looking like
                an afterthought; paired with "Client since" it is a field like
                any other, and the address — the only value that is a sentence —
                is the thing that spans. */}
            <div className={styles.bandFacts}>
              <Fact label="Email" icon="send" value={CLIENT.email} />
              <Fact label="Phone" icon="phone" value={CLIENT.phone} />
              <Fact label="Client since" icon="cal" value={CLIENT.since} />
              <Fact label="Notes" icon="building" value={CLIENT.notes} />
              <Fact label="Job address" icon="pin" value={CLIENT.address} wide />
            </div>
          </div>
        </section>

        {/* FIGURES --------------------------------------------------- */}
        <div data-rv="" className={styles.kpis}>
          <div className={styles.kpi} data-rv-cell="">
            <div className={styles.kpiLbl}>Lifetime value</div>
            <div className={cx(styles.kpiVal, styles.kpiValAccent)}>{money(figures.paid)}</div>
          </div>
          <div className={styles.kpi} data-rv-cell="">
            <div className={styles.kpiLbl}>Proposals sent</div>
            <div className={styles.kpiVal}>{figures.sent}</div>
          </div>
          <div className={styles.kpi} data-rv-cell="">
            <div className={styles.kpiLbl}>Acceptance rate</div>
            <div className={styles.kpiVal}>{figures.rate}%</div>
          </div>
          <div className={styles.kpi} data-rv-cell="">
            <div className={styles.kpiLbl}>Outstanding balance</div>
            <div className={cx(styles.kpiVal, figures.due > 0 && styles.kpiValDue)}>
              {money(figures.due)}
            </div>
          </div>
        </div>

        {/* THE LEDGER ------------------------------------------------ */}
        <Panel
          title="Proposals"
          note={`${PROPOSALS.length} on file`}
          tools={
            <div className={styles.chips} role="group" aria-label="Filter proposals by state">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  data-f={f.value}
                  aria-pressed={filter === f.value}
                  className={cx(styles.chip, filter === f.value && styles.chipOn)}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                  <span className={styles.chipCount}>{counts[f.value]}</span>
                </button>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <EmptyNote kicker="Nothing in this state">
              No proposals on {CLIENT.name}&rsquo;s record are marked {filter}.
            </EmptyNote>
          ) : (
            <div className={styles.ledger}>
              {rows.map((p) => (
                <button key={p.id} type="button" className={styles.lRow}>
                  <span className={styles.lMain}>
                    <span className={styles.lTitle}>{p.title}</span>
                    <span className={styles.lMeta}>
                      {p.ref} · Updated {p.updated}
                    </span>
                  </span>
                  <ProposalBadge status={p.status} />
                  <span className={styles.lAmount}>{money(p.amount)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* THE TAIL -------------------------------------------------- */}
        <div className={styles.duo}>
          {/* No annotation on either tail card. The collected total is already
              the Lifetime value figure at the top of the page, and the signal
              count is a number about the list rather than about the client —
              both were restating what the reader can see. */}
          <Panel title="Payment history" bodyClass={styles.scroll}>
            {PAYMENTS.length === 0 ? (
              <EmptyNote kicker="No payments yet">
                Nothing has been collected against this client. Payments appear here the moment a
                provider settles one.
              </EmptyNote>
            ) : (
              PAYMENTS.map((p) => (
                <div key={p.id} className={styles.pRow}>
                  <span className={styles.lMain}>
                    <span className={styles.pMethod}>{p.method}</span>
                    <span className={styles.pMeta}>
                      {p.instrument} · {p.date}
                    </span>
                  </span>
                  <PaymentBadge status={p.status} />
                  <span className={styles.pAmount}>{money(p.amount)}</span>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Activity" bodyClass={styles.scroll}>
            {ACTIVITY.length === 0 ? (
              <EmptyNote kicker="Nothing recorded">
                No signals from this client yet.
              </EmptyNote>
            ) : (
              ACTIVITY.map((a) => (
                <div key={a.id} className={styles.aRow}>
                  <span className={styles.aIcon} aria-hidden="true">
                    <Ic name={a.icon} />
                  </span>
                  <span>
                    <span className={styles.aText}>{a.text}</span>
                    <span className={styles.aStamp}>{a.stamp}</span>
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>

      {/* Both dialogs are mounted, closed, at the END of the page tree rather
          than beside the buttons that open them. `.content` carries
          `z-index: 1`, so a `position: fixed` overlay declared inside an
          earlier band would be trapped under the bands after it — the same
          stacking note the proposals module records against `.pmdl`. */}
      <ClientEditDialog clientId={clientId} initial={editValues} handleRef={editRef} />
      <ClientMessageDialog clientId={clientId} clientName={CLIENT.name} handleRef={messageRef} />
    </div>
  );
}
