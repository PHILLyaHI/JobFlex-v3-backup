"use client";

// STEPS — the manual proposal builder, one card open at a time.
// Route: /dashboard/manual-steps. Lab variant; it replaces nothing.
//
// ── THE BET ────────────────────────────────────────────────────────────────
// Least ink on screen wins. Ten sections, nine of them shut to a 72px row that
// still prints what is inside them, one open with real room to work. Shut, the
// whole proposal is about a screen and a half of contents page; open, the card
// you are in is the only thing competing for attention. The rejected build put
// everything on screen at once and the owner's word for it was "clenched".
//
// ── WHERE THE AIR IS SPENT (the numbers) ───────────────────────────────────
// Air is a budget, and this variant spends it on the card that is actually
// being used rather than smearing it over ten:
//
//   shut rows      72px tall, 0 gap — they share ONE deck surface, so the
//                  stack reads as a list rather than ten floating slabs
//   open card      32px padding, and 40px of clear ground above and below it,
//                  which physically splits the deck in two. Internal (32) is
//                  less than external (40): the rule that makes a card read as
//                  a separate object, honoured on the one card it applies to.
//   inside a card  32px between blocks · 16px between fields · 6px from a
//                  label to its value. Distance does the grouping; there are
//                  no rules and no nested cards.
//   column         760px. Long lines are half of "hard to read".
//
// ── ELEVATION, NOT OUTLINE ─────────────────────────────────────────────────
// Cards are a LIGHTER surface than the paper ground plus a soft blurred shadow
// and an 8%-ink hairline. Not a 2px black border — uniform heavy chrome on
// every box was the first thing the owner rejected, and when everything is loud
// nothing is. The soft shadow is a token declared in this variant's own module
// (the shared `--shadow-sm` is a hard 3px offset with no blur, and globals.css
// is off-limits to a lab variant).
//
// ── ONE PERSISTENT DEVICE, AND ONLY ONE ────────────────────────────────────
// The shut deck IS the map: where am I (the open card), how much is left (rows
// with an "Empty" mark), what did I put in section 07 (it says so). The only
// other fixed thing is the sticky bar: the grand total, one mono meta line, and
// three actions. No breadcrumb, no progress ring, no second total.
//
// ── HONESTY ────────────────────────────────────────────────────────────────
// Fixture data, component-local state, no network. Save and Save & send write
// nothing and say so in the bar's own status line rather than flashing a green
// tick. Reset asks first, in place, because it wipes real typing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientRecord, Draft } from "../manual-focus/manual-focus-types";
import {
  PROPOSAL_DATE,
  PROPOSAL_NO,
  SEED_CLIENTS,
  SEED_PROJECTS,
  estimateFromAddress,
  makeSeedDraft,
} from "../manual-focus/manual-focus-data";
import { computeTotals, money, moneyShort } from "../manual-focus/manual-focus-math";
import { STEPS, stepFaces, type StepId } from "./steps-summaries";
import { useStepsColumn, type OpenAlign } from "./use-steps-column";
import { StepCard, StepRow, type Step } from "./steps-stack";
import { Btn } from "./steps-ui";
import { ClientCard, JobCard, type Patch } from "./steps-pickers";
import { LinesCard } from "./steps-lines";
import { MarkupCard, PaymentsCard } from "./steps-money";
import { FilesCard, PrintsCard, ScopeCard, TermsCard } from "./steps-blocks";
import { ProofCard } from "./steps-proof";
import s from "./manual-steps.module.css";

/** How long an honest "this did nothing" message stays in the bar. */
const SAY_MS = 4000;

type Group = { kind: "deck"; key: string; steps: Step[] } | { kind: "open"; step: Step };

export function ManualStepsContent() {
  const [draft, setDraft] = useState<Draft>(makeSeedDraft);
  const [clients, setClients] = useState<ClientRecord[]>(() => SEED_CLIENTS.map((c) => ({ ...c })));
  const [said, setSaid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const stackRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { openId, open } = useStepsColumn("job", { stackRef, barRef });

  const totals = useMemo(() => computeTotals(draft), [draft]);
  const faces = useMemo(
    () => stepFaces(draft, totals, clients, SEED_PROJECTS),
    [draft, totals, clients],
  );

  useEffect(() => () => {
    if (sayTimer.current) clearTimeout(sayTimer.current);
  }, []);

  const patch = useCallback<Patch>((next) => {
    setDraft((d) => ({ ...d, ...next }));
  }, []);

  /**
   * The address owns the tax estimate, but only while the rate is still
   * automatic — a hand-typed rate must never be silently rewritten by a later
   * address edit, and an address we cannot read a state out of leaves whatever
   * rate is there alone rather than guessing.
   */
  const onAddress = useCallback((address: string, auto = false) => {
    setDraft((d) => {
      const addressAuto = auto ? d.addressAuto : false;
      if (!d.taxAuto) return { ...d, address, addressAuto };
      const est = estimateFromAddress(address);
      return est
        ? { ...d, address, addressAuto, taxPct: est.pct, taxState: est.code }
        : { ...d, address, addressAuto, taxState: "" };
    });
  }, []);

  const onCreateClient = useCallback((rec: ClientRecord) => {
    setClients((cs) => [...cs, rec]);
  }, []);

  const onEditClient = useCallback((id: string, next: Partial<ClientRecord>) => {
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...next } : c)));
  }, []);

  const say = useCallback((text: string) => {
    setSaid(text);
    if (sayTimer.current) clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => setSaid(null), SAY_MS);
  }, []);

  function reset() {
    setDraft(makeSeedDraft());
    setClients(SEED_CLIENTS.map((c) => ({ ...c })));
    setConfirming(false);
    say("Everything is back to the seed.");
    open("job", "top");
  }

  /* The deck is split by whichever card is open, so consecutive shut rows share
     one surface and the open card gets clear ground on both sides. */
  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    let run: Step[] = [];
    for (const step of STEPS) {
      if (step.id === openId) {
        if (run.length) out.push({ kind: "deck", key: `d-${run[0]?.id ?? "x"}`, steps: run });
        run = [];
        out.push({ kind: "open", step });
      } else {
        run.push(step);
      }
    }
    if (run.length) out.push({ kind: "deck", key: `d-${run[0]?.id ?? "x"}`, steps: run });
    return out;
  }, [openId]);

  const openIndex = STEPS.findIndex((st) => st.id === openId);
  const nextStep = openIndex >= 0 && openIndex < STEPS.length - 1 ? (STEPS[openIndex + 1] ?? null) : null;

  const onOpen = useCallback(
    (id: StepId, align?: OpenAlign) => {
      setConfirming(false);
      open(id, align);
    },
    [open],
  );

  function body(id: StepId) {
    switch (id) {
      case "job":
        return <JobCard draft={draft} patch={patch} projects={SEED_PROJECTS} />;
      case "client":
        return (
          <ClientCard
            draft={draft}
            patch={patch}
            clients={clients}
            onCreateClient={onCreateClient}
            onEditClient={onEditClient}
            onAddress={onAddress}
          />
        );
      case "lines":
        return <LinesCard draft={draft} patch={patch} totals={totals} />;
      case "markup":
        return <MarkupCard draft={draft} patch={patch} totals={totals} />;
      case "scope":
        return <ScopeCard draft={draft} patch={patch} />;
      case "prints":
        return <PrintsCard draft={draft} patch={patch} />;
      case "terms":
        return <TermsCard draft={draft} patch={patch} />;
      case "payments":
        return <PaymentsCard draft={draft} patch={patch} totals={totals} />;
      case "files":
        return <FilesCard draft={draft} patch={patch} />;
      case "copy":
        return <ProofCard draft={draft} totals={totals} clients={clients} />;
      default:
        return null;
    }
  }

  const namedCount = totals.printed.length;

  return (
    <div className={s.root}>
      <header className={s.masthead}>
        <div>
          <span className="kicker">Manual proposal</span>
          <h1 className={s.title}>Build it by hand</h1>
        </div>
        <span className={s.mastRef}>
          {PROPOSAL_NO} · {PROPOSAL_DATE}
        </span>
      </header>

      <div className={s.bar} ref={barRef}>
        <div className={s.barTotal}>
          <span className={s.barLabel}>Total with tax</span>
          <span className={s.barNum}>{money(totals.total)}</span>
        </div>

        <div className={s.barMeta}>
          {confirming ? (
            <>
              <span className={s.barMetaTop} data-tone="warn">
                Reset wipes every field.
              </span>
              <span className={s.barMetaBot}>The seed comes back.</span>
            </>
          ) : (
            <>
              <span className={s.barMetaTop} data-tone={said ? "warn" : undefined}>
                {said ?? "Draft · nothing is saved"}
              </span>
              <span className={s.barMetaBot}>
                {namedCount === 1 ? "1 line" : `${namedCount} lines`} · sub{" "}
                {moneyShort(totals.preTax)} · tax {moneyShort(totals.tax)}
              </span>
            </>
          )}
        </div>

        <div className={s.barActions}>
          {confirming ? (
            <>
              <Btn variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Btn>
              <Btn variant="danger" onClick={reset}>
                Reset
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="ghost" onClick={() => setConfirming(true)}>
                Reset
              </Btn>
              <Btn variant="solid" onClick={() => say("Save is not wired up.")}>
                Save
              </Btn>
              <Btn variant="primary" onClick={() => say("Nothing was sent.")}>
                Save &amp; send
              </Btn>
            </>
          )}
        </div>
      </div>

      <div className={s.stack} ref={stackRef}>
        {groups.map((g) =>
          g.kind === "deck" ? (
            <div className={s.deck} key={g.key}>
              {g.steps.map((step) => (
                <StepRow key={step.id} step={step} face={faces[step.id]} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <StepCard key={g.step.id} step={g.step} next={nextStep} onOpen={onOpen}>
              {body(g.step.id)}
            </StepCard>
          ),
        )}
      </div>

      <p className={s.foot}>Fixture data. Nothing here reaches a server.</p>
    </div>
  );
}
