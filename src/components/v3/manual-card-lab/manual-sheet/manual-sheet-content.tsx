"use client";

// CHAPTERS — the page. Ten sections, five cards, one sticky rail.
//
// Route: /dashboard/manual-sheet.
//
// THE BET. The rejected build gave each of the brief's ten sections its own
// card: ten headers, twenty edges, ten shadows and ten status badges, stacked.
// Every one of those was defensible on its own and the sum read as noise. This
// variant regroups the same ten into FIVE chapters (see sheet-chapters.ts for
// the pairing logic) and spends the saved chrome on air. Fewer surfaces, larger
// surfaces, more distance between them.
//
// THE COST OF THE BET is that a chapter card is tall, and a tall card becomes a
// wall unless its inside is more disciplined than a small card ever had to be.
// The whole answer is a five-rung spacing ladder — 6 / 16 / 32 / 32 / 48 —
// where every boundary is exactly one rung louder than the boundary inside it,
// so the eye can tell a field from a group from a block from a card without a
// single rule line. It is enforced in one place (manual-sheet.module.css) and
// nothing in these components hardcodes a pixel.
//
// THE ONE PERSISTENT DEVICE is the sticky chapter rail: five short labels, a
// sliding blueprint marker for where you are, and the running total. It carries
// no actions, because a second thing in it would make it a toolbar and the
// brief allows exactly one navigation device. The actions live once, at the
// foot, where a document is signed — and the rail puts the foot one click away
// from anywhere on the page, which is what makes that affordable.
//
// STATE. One `draft` object plus one `clients` array, both component-local
// `useState` seeded from the shared fixtures. No Prisma, no server action, no
// network, no Zustand — the data layer is out of scope until the layout is
// signed off. Save and Save & send move a chip and write nothing, and the foot
// says so in plain words rather than faking a success toast.
//
// THE THREE COUPLINGS that make this a builder rather than a mock-up, and the
// only places where one control reaches into another chapter:
//   · a chosen client fills the job address, but only while `addressAuto` holds;
//   · the address estimates the tax rate, but only while `taxAuto` holds;
//   · the grand total (chapter 2) is what the payment meter (chapter 4) and the
//     rail measure against — computed once, in the math module, never re-derived.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientChoice, ClientRecord, Draft } from "../manual-focus/manual-focus-types";
import {
  estimateFromAddress,
  makeSeedDraft,
  ORG_NAME,
  PROPOSAL_DATE,
  PROPOSAL_NO,
  SEED_CLIENTS,
  SEED_PROJECTS,
} from "../manual-focus/manual-focus-data";
import { computeTotals, money, newId } from "../manual-focus/manual-focus-math";
import s from "./manual-sheet.module.css";
import { CHAPTERS, type ChapterId } from "./sheet-chapters";
import { useChapterRail } from "./use-chapter-rail";
import { Btn, TextBtn } from "./sheet-ui";
import { ChapterJob, fullAddress } from "./sheet-job";
import { ChapterMoney } from "./sheet-money";
import { ChapterWords } from "./sheet-words";
import { ChapterDeal } from "./sheet-deal";
import { ChapterGive } from "./sheet-give";

/** Module-level so the rail hook's dependency identity is stable across every
 *  keystroke in the draft — a fresh array here would re-bind the scroll
 *  listener on every render. */
const CHAPTER_IDS: ChapterId[] = CHAPTERS.map((c) => c.id);

type SaveState = "draft" | "saving" | "saved";

export function ManualSheetContent() {
  const [draft, setDraft] = useState<Draft>(() => makeSeedDraft());
  const [clients, setClients] = useState<ClientRecord[]>(() =>
    SEED_CLIENTS.map((c) => ({ ...c })),
  );
  const [save, setSave] = useState<SaveState>("draft");
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const totals = useMemo(() => computeTotals(draft), [draft]);
  const taxEstimate = useMemo(() => estimateFromAddress(draft.address), [draft.address]);

  const patch = useCallback((p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSave("draft");
  }, []);

  /* ── the two couplings that cross chapters ────────────────── */

  /** Typing the address breaks its link to the client record, and re-estimates
   *  the tax rate ONLY if the rate is still an estimate itself. */
  const onAddress = useCallback((value: string) => {
    setDraft((d) => {
      const next: Draft = { ...d, address: value, addressAuto: false };
      if (d.taxAuto) {
        const hit = estimateFromAddress(value);
        if (hit) {
          next.taxPct = hit.pct;
          next.taxState = hit.code;
        }
      }
      return next;
    });
    setSave("draft");
  }, []);

  const onTaxChange = useCallback((v: number) => {
    setDraft((d) => ({ ...d, taxPct: v, taxAuto: false }));
    setSave("draft");
  }, []);

  const onUseEstimate = useCallback(() => {
    setDraft((d) => {
      const hit = estimateFromAddress(d.address);
      if (!hit) return d;
      return { ...d, taxPct: hit.pct, taxAuto: true, taxState: hit.code };
    });
    setSave("draft");
  }, []);

  const chooseClient = useCallback(
    (choice: ClientChoice) => {
      setDraft((d) => {
        const next: Draft = { ...d, client: choice };
        if (choice.mode !== "record" || !d.addressAuto) return next;
        const rec = clients.find((c) => c.id === choice.id);
        const line = rec ? fullAddress(rec) : "";
        if (!line) return next;
        next.address = line;
        if (d.taxAuto) {
          const hit = estimateFromAddress(line);
          if (hit) {
            next.taxPct = hit.pct;
            next.taxState = hit.code;
          }
        }
        return next;
      });
      setSave("draft");
    },
    [clients],
  );

  const editClient = useCallback((id: string, p: Partial<ClientRecord>) => {
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
    setSave("draft");
  }, []);

  const createClient = useCallback(
    (rec: { name: string; email: string; phone: string; address: string }) => {
      const made: ClientRecord = {
        id: newId("cl"),
        name: rec.name.trim(),
        email: rec.email.trim(),
        phone: rec.phone.trim(),
        // The create form takes ONE address line rather than four boxes; the
        // record's city / state / zip stay empty and `fullAddress` drops them.
        address: rec.address.trim(),
        city: "",
        state: "",
        zip: "",
        tags: [],
      };
      setClients((cs) => [...cs, made]);
      chooseClient({ mode: "record", id: made.id });
    },
    [chooseClient],
  );

  /* ── actions ──────────────────────────────────────────────── */

  const runSave = (label: SaveState) => {
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSave(label), 420);
  };

  const reset = () => {
    setDraft(makeSeedDraft());
    setClients(SEED_CLIENTS.map((c) => ({ ...c })));
    setSave("draft");
    setConfirming(false);
  };

  /* ── the rail ─────────────────────────────────────────────── */

  const { active, marker, jumpTo, setCard, setTab, railRef, tabsRef } =
    useChapterRail(CHAPTER_IDS);

  // Hoisted to a const before the discriminant is read: TS drops the narrowing
  // of a nested property the moment it is used inside a callback, and
  // `clients.find(...)` is a callback.
  const choice = draft.client;
  const clientName =
    choice.mode === "record"
      ? (clients.find((c) => c.id === choice.id)?.name ?? "")
      : choice.mode === "freeText"
        ? choice.name.trim()
        : "";

  const bodies: Record<ChapterId, React.ReactNode> = {
    job: (
      <ChapterJob
        draft={draft}
        patch={patch}
        clients={clients}
        projects={SEED_PROJECTS}
        onChooseClient={chooseClient}
        onEditClient={editClient}
        onCreateClient={createClient}
        onAddress={onAddress}
      />
    ),
    money: (
      <ChapterMoney
        draft={draft}
        patch={patch}
        totals={totals}
        taxEstimate={taxEstimate}
        onUseEstimate={onUseEstimate}
        onTaxChange={onTaxChange}
      />
    ),
    words: <ChapterWords draft={draft} patch={patch} />,
    deal: <ChapterDeal draft={draft} patch={patch} totals={totals} />,
    copy: (
      <ChapterGive
        draft={draft}
        patch={patch}
        totals={totals}
        clientName={clientName}
        clients={clients}
      />
    ),
  };

  const saveWord =
    save === "saving"
      ? "Saving…"
      : save === "saved"
        ? "Saved in this tab only — nothing was sent."
        : "Draft · nothing saved yet.";

  return (
    <div className={s.sheet}>
      <header className={[s.col, s.masthead].join(" ")}>
        <div className={s.kick}>
          <span className={s.kickDot} />
          Manual proposal
        </div>
        <h1 className={s.title}>New proposal</h1>
        <p className={s.mastMeta}>
          {PROPOSAL_NO} · {PROPOSAL_DATE} · {ORG_NAME}
        </p>
      </header>

      <nav className={s.rail} aria-label="Chapters">
        <div className={[s.col, s.railInner].join(" ")} ref={railRef}>
          <div className={s.railTabs} ref={tabsRef}>
            <span
              className={s.railMark}
              style={
                {
                  "--ms-mx": `${marker.x}px`,
                  "--ms-mw": `${marker.w}px`,
                  opacity: marker.w ? 1 : 0,
                } as React.CSSProperties
              }
              aria-hidden="true"
            />
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                ref={setTab(c.id)}
                className={[s.railTab, c.id === active ? s.isOn : null]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={c.id === active ? "true" : undefined}
                onClick={() => jumpTo(c.id)}
              >
                <span className={s.railTabNum}>{c.num}</span>
                {c.short}
              </button>
            ))}
          </div>

          <div className={s.railTotal}>
            <span className={s.railTotalLab}>Total</span>
            <span className={s.railTotalVal}>{money(totals.total)}</span>
          </div>
        </div>
      </nav>

      <div className={s.cards}>
        {CHAPTERS.map((c) => (
          <section
            key={c.id}
            id={`chapter-${c.id}`}
            ref={setCard(c.id)}
            className={s.card}
            aria-labelledby={`chapter-${c.id}-title`}
          >
            <div className={s.cardHead}>
              <span className={s.cardNum}>CH {c.num}</span>
              <h2 className={s.cardTitle} id={`chapter-${c.id}-title`}>
                {c.title}
              </h2>
            </div>
            {bodies[c.id]}
          </section>
        ))}
      </div>

      <footer className={[s.col, s.foot].join(" ")}>
        <div className={s.footState}>
          <span
            className={[s.footDot, save === "saved" ? s.footDotSaved : null]
              .filter(Boolean)
              .join(" ")}
          />
          {saveWord}
        </div>

        {confirming ? (
          <div className={s.confirm}>
            <span className={s.confirmAsk}>Discard every edit and reload the fixture?</span>
            <Btn tone="danger" onClick={reset}>
              Discard
            </Btn>
            <TextBtn quiet onClick={() => setConfirming(false)}>
              Keep editing
            </TextBtn>
          </div>
        ) : (
          <div className={s.footActions}>
            <Btn tone="danger" onClick={() => setConfirming(true)}>
              Reset
            </Btn>
            <div className={s.footSpacer} />
            <Btn onClick={() => runSave("saved")}>Save</Btn>
            <Btn tone="primary" onClick={() => runSave("saved")}>
              Save &amp; send
            </Btn>
          </div>
        )}

        <p className={s.footNote}>
          Lab build. Save and Save &amp; send move the chip above and write nothing — no
          record, no email, no upload.
        </p>
      </footer>

      <div className={s.tail} aria-hidden="true" />
    </div>
  );
}
