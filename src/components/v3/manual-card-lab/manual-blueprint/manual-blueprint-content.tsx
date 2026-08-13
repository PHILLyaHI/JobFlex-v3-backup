"use client";

// MANUAL PROPOSAL / BLUEPRINT — the column.
// Route: /dashboard/manual-blueprint.
//
// The "Quiet" variant (/dashboard/manual-quiet), re-skinned into the house
// blueprint system. The composition below is unchanged from the build that was
// approved — same ten cards, same order, same spacing, same de-emphasis. What
// moved is entirely in manual-blueprint.module.css: ink frames and hard offset
// shadows instead of a borderless soft-shadow surface, caps 900 card titles,
// mono confined to the drawing-annotation layer, square check plates instead of
// pill switches, and the fleet's entrance cascade.
//
// The claim being tested: the calm came from the SPACING and the DE-EMPHASIS,
// not from the soft surface. If that is right, this reads as restfully as the
// donor while looking like the other 22 blueprint pages. If it is wrong, the
// donor route is still standing next door and the two can be put side by side.
//
// SURFACES: the three-tone trial (white / light beige / deep beige) is decided.
// White won everywhere, including the sticky total bar, so there is no `tone`
// prop any more — a card's surface is not a per-card decision. The one thing it
// cost is documented on `--mb-well` in the stylesheet: the control wells had to
// invert to a faint tint, because a white field inside a white card is defined
// by nothing but a hairline.
//
// THE BET: nothing collapses, and the calm comes from typography and air alone.
// All ten cards are open, always. There is no accordion, no promotion state, no
// "open" affordance anywhere, because every one of those is a second thing to
// understand before you can read the first thing. If a long single column can
// be restful, it has to be restful with everything showing.
//
// What that costs, and how it is paid:
//   · LENGTH. Paid with rhythm — the cards have honestly different heights
//     (four switches tall, five table rows tall, one document tall), and card 10
//     carries a heavier shadow as a terminal beat, so the scroll has punctuation
//     instead of ten identical slabs. (It used to be paid partly with a surface
//     change too; now that every card is white, the WEIGHT does that job alone.)
//   · FINDABILITY. Paid with one persistent device and exactly one: a slim
//     sticky bar at the foot carrying the grand total and the three actions.
//     Nothing else lives in it. A second bar, a rail, or a progress chip would
//     be the "where am I" problem answered twice.
//
// STATE. One `draft` object rather than twenty useStates, because the totals,
// the coverage meter and the client's copy all read the WHOLE draft on every
// keystroke. Two things sit OUTSIDE it on purpose:
//   · `contact` — Draft has no email/phone fields (they belong to the client
//     record), but the sheet still has to carry a contact for a typed name, so
//     the override lives here rather than being smuggled into a shared type
//     this variant may not edit;
//   · `clients` — the inline "add a new client" has to append somewhere, and a
//     component-local roster is the honest version of that with no data layer.
//
// Save, Save & send and the draft-state chip write NOTHING and say so. Reset
// confirms in place, inside the bar, so the page never needs a modal.

import { useMemo, useState } from "react";
import type {
  ClientChoice,
  ClientRecord,
  Draft,
  Installment,
  Line,
  ProposalOptions,
  StagedFile,
} from "../manual-focus/manual-focus-types";
import {
  ORG_NAME,
  PROPOSAL_DATE,
  PROPOSAL_NO,
  SEED_CLIENTS,
  SEED_PROJECTS,
  TERMS_TEMPLATE,
  estimateFromAddress,
  makeSeedDraft,
} from "../manual-focus/manual-focus-data";
import { computeTotals, money, newId } from "../manual-focus/manual-focus-math";
import styles from "./manual-blueprint.module.css";
import { Btn, Card, Field, Group, Pair, TextArea, TextField, cx } from "./bp-ui";
import { ClientField, ProjectField } from "./bp-pickers";
// The line table is the lines-v2 block — the reference format: one entry row
// per line plus a full-width material/labor split beneath it, with the three
// money columns carrying their own running totals in the header. It lives
// outside this folder because it is shared with the line-item lab.
import { LinesV2 } from "../lines-v2/lines-v2";
import { PaymentBlock } from "./bp-money";
import { MarkupBlock } from "./bp-markup";
import { PrintOptions, FilesBlock } from "./bp-blocks";
import { TheirCopy } from "./bp-proof";
// Card 11. The same proposal as PAPER — see the header of bp-pdf.tsx for why
// the file is produced by print CSS rather than by a PDF library.
import { DEFAULT_PDF_SETUP, PdfBlock, type PdfSetup } from "./bp-pdf";
import { useReveal } from "./use-reveal";

type SaveNote = "clean" | "edited" | "saved" | "sent";

const NOTE_TEXT: Record<SaveNote, string> = {
  clean: "Fixture · unedited",
  edited: "Edited · nothing autosaves",
  saved: "Nothing saved — this lab has no server",
  sent: "Nothing sent — this lab has no server",
};

/** A record's address as the one line the sheet and the tax estimator both
 *  read. Kept as a single string on purpose — see the note in bp-pickers. */
function addressOf(rec: ClientRecord): string {
  const tail = [rec.city, [rec.state, rec.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [rec.address, tail].filter(Boolean).join(", ");
}

function contactOf(clients: ClientRecord[], choice: ClientChoice) {
  if (choice.mode !== "record") return { email: "", phone: "" };
  const rec = clients.find((c) => c.id === choice.id);
  return { email: rec?.email ?? "", phone: rec?.phone ?? "" };
}

/** Re-runs the address estimate, but ONLY while the rate is still automatic.
 *  The moment the field has been typed in, a later address change must not
 *  silently rewrite it. */
function withTax(d: Draft): Draft {
  if (!d.taxAuto) return d;
  const est = estimateFromAddress(d.address);
  if (!est) return { ...d, taxState: "" };
  return { ...d, taxPct: est.pct, taxState: est.code };
}

export function ManualBlueprintContent() {
  const [draft, setDraft] = useState<Draft>(makeSeedDraft);
  const [clients, setClients] = useState<ClientRecord[]>(() => SEED_CLIENTS.map((c) => ({ ...c })));
  const [contact, setContact] = useState(() => contactOf(SEED_CLIENTS, makeSeedDraft().client));
  const [openLines, setOpenLines] = useState<string[]>([]);
  const [note, setNote] = useState<SaveNote>("clean");

  // The PDF's four page decisions. OUTSIDE `draft`, for the same reason
  // `contact` is: Draft is shared with four other card-lab variants and
  // describes the proposal, not the paper it is printed on. See PdfSetup.
  const [pdf, setPdf] = useState<PdfSetup>(DEFAULT_PDF_SETUP);

  // The fleet entrance cascade. Marker-driven, not children-driven — see
  // ./use-reveal.ts for why this page cannot use the donor's walk.
  useReveal();

  const totals = useMemo(() => computeTotals(draft), [draft]);

  /* ---- editing ------------------------------------------------------ */

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setNote("edited");
  };
  const patch = (p: Partial<Draft>) => edit((d) => ({ ...d, ...p }));

  const setClient = (choice: ClientChoice) => {
    edit((d) => {
      const next: Draft = { ...d, client: choice };
      if (choice.mode === "record" && d.addressAuto) {
        const rec = clients.find((c) => c.id === choice.id);
        if (rec) next.address = addressOf(rec);
      }
      return withTax(next);
    });
    setContact(contactOf(clients, choice));
  };

  const createClient = (rec: ClientRecord) => {
    setClients((list) => [...list, rec]);
    edit((d) => withTax({ ...d, client: { mode: "record", id: rec.id }, address: d.addressAuto ? rec.address : d.address }));
    setContact({ email: rec.email, phone: rec.phone });
  };

  const setAddress = (v: string) =>
    edit((d) => withTax({ ...d, address: v, addressAuto: false }));

  const patchLine = (id: string, p: Partial<Line>) =>
    edit((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) }));

  const addLine = () =>
    edit((d) => ({
      ...d,
      lines: [
        ...d.lines,
        {
          id: newId("ln"),
          name: "",
          description: "",
          unit: "UNIT",
          quantity: 1,
          materialCost: 0,
          laborCost: 0,
        },
      ],
    }));

  const removeLine = (id: string) => {
    edit((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
    setOpenLines((ids) => ids.filter((x) => x !== id));
  };

  const patchInstallment = (id: string, p: Partial<Installment>) =>
    edit((d) => ({
      ...d,
      installments: d.installments.map((i) => (i.id === id ? { ...i, ...p } : i)),
    }));

  const addInstallment = () =>
    edit((d) => ({
      ...d,
      installments: [
        ...d.installments,
        { id: newId("in"), label: "", amount: 0, isPercent: true },
      ],
    }));

  const patchOptions = (p: Partial<ProposalOptions>) =>
    edit((d) => ({ ...d, options: { ...d.options, ...p } }));

  const addFiles = (staged: StagedFile[]) =>
    edit((d) => ({ ...d, files: [...d.files, ...staged] }));

  /* ---- derived ------------------------------------------------------ */

  // Bound to a const first: narrowing a discriminated union through
  // `draft.client.mode` is lost the moment the check crosses into the `find`
  // callback, because `draft` is not provably unchanged in there.
  const choice = draft.client;
  const clientName =
    choice.mode === "record"
      ? (clients.find((c) => c.id === choice.id)?.name ?? "")
      : choice.mode === "freeText"
        ? choice.name.trim()
        : "";

  // The project's NAME, not its id: the client's copy and the PDF both name it,
  // and neither has any business printing "pr_2".
  const projectName = SEED_PROJECTS.find((p) => p.id === draft.projectId)?.name ?? "";

  return (
    <div className={styles.page}>
      <div className={cx("page-head", styles.head)} data-rv="">
        <div>
          <div className="kicker">Proposal builder</div>
          <h1 className="page-title">Manual proposal</h1>
        </div>
        <div className={styles.meta}>
          <span className={styles.metaMono}>
            {PROPOSAL_NO} · {PROPOSAL_DATE}
          </span>
          <span className={styles.metaOrg}>{ORG_NAME}</span>
          <span className={styles.state}>
            <span className={cx(styles.stateDot, note === "edited" && styles.stateDotLive)} />
            {NOTE_TEXT[note]}
          </span>
        </div>
      </div>

      <div className={styles.stack}>
        {/* 01 ------------------------------------------------------- */}
        <Card num="01" title="The job" id="q-01">
          <Group>
            <Field label="Title" htmlFor="q-title">
              <TextField
                id="q-title"
                value={draft.title}
                onChange={(v) => patch({ title: v })}
                placeholder="What is this proposal for?"
              />
            </Field>
            <ProjectField
              projects={SEED_PROJECTS}
              value={draft.projectId}
              onChange={(id) => patch({ projectId: id })}
            />
          </Group>
          <Field label="Overview" htmlFor="q-overview">
            <TextArea
              id="q-overview"
              rows={4}
              value={draft.description}
              onChange={(v) => patch({ description: v })}
            />
          </Field>
        </Card>

        {/* 02 ------------------------------------------------------- */}
        <Card num="02" title="The client" id="q-02">
          <Group>
            <ClientField
              clients={clients}
              choice={draft.client}
              onChoice={setClient}
              onCreate={createClient}
            />
            <Pair>
              <Field label="Email" htmlFor="q-email">
                <TextField
                  id="q-email"
                  value={contact.email}
                  onChange={(v) => {
                    setContact((c) => ({ ...c, email: v }));
                    setNote("edited");
                  }}
                />
              </Field>
              <Field label="Phone" htmlFor="q-phone">
                <TextField
                  id="q-phone"
                  value={contact.phone}
                  onChange={(v) => {
                    setContact((c) => ({ ...c, phone: v }));
                    setNote("edited");
                  }}
                />
              </Field>
            </Pair>
          </Group>
          <Field
            label="Job address"
            htmlFor="q-address"
            hint={draft.addressAuto ? "From the client record" : undefined}
          >
            <TextField id="q-address" value={draft.address} onChange={setAddress} />
          </Field>
        </Card>

        {/* 03 ------------------------------------------------------- */}
        <Card num="03" title="Line items" id="q-03">
          <LinesV2
            lines={draft.lines}
            openIds={openLines}
            onToggle={(id) =>
              setOpenLines((ids) =>
                ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
              )
            }
            onPatch={patchLine}
            onAdd={addLine}
            onRemove={removeLine}
            baseTotal={totals.baseTotal}
            namedCount={totals.printed.length}
            unnamedCount={totals.unnamedCount}
            taxPct={draft.taxPct}
            taxAuto={draft.taxAuto}
            taxState={draft.taxState}
            onTaxPct={(n) => patch({ taxPct: n, taxAuto: false, taxState: "" })}
            // Tax lives in card 07 now, in the chain between the subtotal and
            // the grand total, with the note explaining where the rate came
            // from. Rendering it here too would be the same control in two
            // cards. The props still flow so the block stays contract-shaped.
            hideTax
          />
        </Card>

        {/* 04 — SIX controls on the left, an ESTIMATE plate on the right, and
            a margin badge. The plate now runs the WHOLE chain and ends on the
            grand total, so discount and tax had to come with it: a card that
            prints the final figure while two of its inputs live on a different
            card is the "hold a number in your head while you scroll" failure.
            The old card 08 (Discount & tax) is absorbed here.

            Still deliberately NOT merged with the deposits below — the split is
            by question ("what am I charging?" vs "when do they pay it?"), not
            by arithmetic. ------------------------------------------- */}
        <Card num="04" title="Markup & margin" id="q-04">
          <MarkupBlock
            materialMarkupPct={draft.materialMarkupPct}
            laborMarkupPct={draft.laborMarkupPct}
            overheadPct={draft.overheadPct}
            profitPct={draft.profitPct}
            onMaterialMarkupPct={(n) => patch({ materialMarkupPct: n })}
            onLaborMarkupPct={(n) => patch({ laborMarkupPct: n })}
            onOverheadPct={(n) => patch({ overheadPct: n })}
            onProfitPct={(n) => patch({ profitPct: n })}
            discountPct={draft.discountPct}
            // The two dollar-mode fields are OPTIONAL on Draft so the sibling
            // manual-focus route is untouched by their addition; the defaults
            // are applied here, at the one boundary that knows about them.
            discountFlat={draft.discountFlat ?? 0}
            discountIsPercent={draft.discountIsPercent ?? true}
            taxPct={draft.taxPct}
            taxAuto={draft.taxAuto}
            taxState={draft.taxState}
            onPatch={patch}
            onTaxPct={(n) => patch({ taxPct: n, taxAuto: false, taxState: "" })}
            totals={totals}
          />
        </Card>

        {/* 05 ------------------------------------------------------- */}
        <Card num="05" title="Scope & notes" id="q-05">
          <Field label="Scope of work" htmlFor="q-scope">
            <TextArea
              id="q-scope"
              rows={7}
              value={draft.scopeOfWork}
              onChange={(v) => patch({ scopeOfWork: v })}
            />
          </Field>
          <Field label="Internal notes" htmlFor="q-notes" hint="Never printed.">
            <TextArea
              id="q-notes"
              rows={3}
              value={draft.notes}
              onChange={(v) => patch({ notes: v })}
            />
          </Field>
        </Card>

        {/* 06 ------------------------------------------------------- */}
        <Card num="06" title="What prints" id="q-06">
          <PrintOptions options={draft.options} onPatch={patchOptions} />
        </Card>

        {/* 07 ------------------------------------------------------- */}
        <Card num="07" title="Terms" id="q-07">
          <Field label="Terms & conditions" htmlFor="q-terms">
            <TextArea
              id="q-terms"
              rows={7}
              value={draft.terms}
              onChange={(v) => patch({ terms: v })}
              placeholder="Nothing here yet."
            />
          </Field>
          {draft.terms.trim() === "" ? (
            <Btn tone="add" icon="pen" onClick={() => patch({ terms: TERMS_TEMPLATE })}>
              Insert starter template
            </Btn>
          ) : null}
        </Card>

        {/* 08 — WHEN it is paid, and nothing else. The four-row receipt that
            used to sit above these fields is gone: card 04 now runs the whole
            chain and ends on the grand total, and printing the same arithmetic
            again here — a scroll away, with no way to tell which was
            authoritative — was the one-number-many-places failure at its
            worst. The schedule divides a figure produced up there; the coverage
            meter is what says whether the division adds up. ------------ */}
        <Card num="08" title="Payment & deposits" id="q-08">
          <PaymentBlock
            installments={draft.installments}
            total={totals.total}
            onPatch={patchInstallment}
            onAdd={addInstallment}
            onRemove={(id) =>
              edit((d) => ({ ...d, installments: d.installments.filter((i) => i.id !== id) }))
            }
          />
        </Card>

        {/* 09 ------------------------------------------------------- */}
        <Card num="09" title="Files" id="q-09">
          <FilesBlock
            files={draft.files}
            onAdd={addFiles}
            onRemove={(id) => edit((d) => ({ ...d, files: d.files.filter((f) => f.id !== id) }))}
          />
        </Card>

        {/* 10 ------------------------------------------------------- */}
        <Card num="10" title="Their copy" id="q-10" sheet>
          <TheirCopy
            title={draft.title}
            clientName={clientName}
            address={draft.address}
            scopeOfWork={draft.scopeOfWork}
            terms={draft.terms}
            taxPct={draft.taxPct}
            options={draft.options}
            totals={totals}
          />
        </Card>

        {/* 11 — THE SAME PROPOSAL AS PAPER.
            Card 10 answers "what will they see"; this answers "what will they
            receive". It is a separate card and not a button on card 10 because
            the document has decisions of its own — trim size, cover, running
            furniture — and none of them belongs to the on-screen copy.

            It carries `sheet` as card 10 does: the column now ends on a
            two-card coda, the same artifact in two media, and both are
            documents rather than forms. */}
        <Card num="11" title="The PDF" id="q-11" sheet>
          <PdfBlock
            setup={pdf}
            onPatch={(p) => {
              setPdf((s) => ({ ...s, ...p }));
              // These change what the client receives, so they count as an
              // edit even though they live outside the draft.
              setNote("edited");
            }}
            doc={{
              title: draft.title,
              clientName,
              email: contact.email,
              phone: contact.phone,
              address: draft.address,
              projectName,
              description: draft.description,
              scopeOfWork: draft.scopeOfWork,
              terms: draft.terms,
              taxPct: draft.taxPct,
              options: draft.options,
              totals,
              installments: draft.installments,
              files: draft.files,
            }}
          />
        </Card>
      </div>

      {/* THE ONE PERSISTENT DEVICE ---------------------------------- */}
      <div className={styles.bar} data-rv="">
        <div>
          <div className={styles.barLabel}>Grand total</div>
          <div className={styles.barMoney}>{money(totals.total)}</div>
        </div>
        {/* Reset is gone by request, and with it the two-step discard
            confirmation it needed. The bar is now the two actions that move
            the proposal forward and nothing else — which is what a persistent
            bar should carry. Nothing else on the page restores the fixture, so
            a reload is the way back. */}
        <div className={styles.barActions}>
          <Btn onClick={() => setNote("saved")}>Save</Btn>
          <Btn tone="primary" icon="send" onClick={() => setNote("sent")}>
            Save &amp; send
          </Btn>
        </div>
      </div>
    </div>
  );
}
