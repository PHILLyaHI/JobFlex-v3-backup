"use client";

// Manual Card Lab hub — page CONTENT only. The index of the single-column CARD
// design of the manual proposal builder: one blueprint spec-card carrying the
// station plate, name, the design bet in one line, an aria-hidden schematic of
// the card grammar drawn with bordered elements (no images), and the route in
// mono. The whole card is the link.
//
// The lab ran five variants and the owner picked Focus Card. The other four
// were removed from the tree, so this page also prints a RESULT block naming
// what they bet and where to find them (one commit back). The hub states what
// it chose and what it chose against — a lab that erases its losers teaches
// nothing the next time the question is asked.
//
// Fixture-free by design: this page owns no builder state and no seed data —
// it is just links. The route is linked by URL STRING and cast to Route
// (typedRoutes is on); importing anything from the variant folder is
// forbidden, so the hub can never break a variant's build or vice versa.
//
// Blocks are DIRECT children of `.content` — the reveal cascade in
// use-reveal.ts walks `content.children`, so the four top-level sections below
// are what stagger in.

import Link from "next/link";
import type { Route } from "next";
import { useReveal } from "./use-reveal";
import { CARD_VARIANTS, RETIRED_VARIANTS, type SchematicKind } from "./data";
import styles from "./hub.module.css";

/**
 * The tiny card-grammar drawing on each spec-card. Pure decoration over the
 * thesis text, so the whole sheet is aria-hidden; every part is a styled
 * <span> on the shared graph-paper `.schem` sheet. Blueprint blue marks each
 * variant's SIGNATURE element only — the one thing that variant does and the
 * other four don't — so the five drawings are comparable at a glance.
 *
 * All five are drawn as a single column, because all five ARE a single column.
 * What differs is the grammar inside it.
 */
function Schematic({ kind }: { kind: SchematicKind }) {
  switch (kind) {
    // 01 — one card at full ink and full height, the rest stood down to thin
    // still-legible summary rows. Nothing is hidden, only weighted.
    case "focus":
      return (
        <div className={styles.schem} aria-hidden="true">
          <span className={styles.fDim}>
            <span className={styles.fDimLine} />
          </span>
          <span className={styles.fLive}>
            <span className={styles.fLiveLine} />
            <span className={styles.fLiveLine} />
            <span className={styles.fLiveLine} />
          </span>
          <span className={styles.fDim}>
            <span className={styles.fDimLine} />
          </span>
          <span className={styles.fDim}>
            <span className={styles.fDimLine} />
          </span>
        </div>
      );
  }
}

export function ManualCardsHubContent() {
  useReveal();

  return (
    <>
      {/* ── Masthead — the fleet's GLOBAL page-head vocabulary. The always-on
          dashboard module publishes .page-head / .kicker / .page-title
          (exactly like .rv), so this H1 matches the rest of the blueprint
          fleet; only the stamp annotation is module-local. */}
      <div className="page-head">
        <div>
          <div className="kicker">Proposals · Design Lab</div>
          <h1 className="page-title">Manual Card Lab</h1>
        </div>
        <div className={styles.stamp}>
          Drawing № MC-LAB · rev B · 1 of 5 selected
        </div>
      </div>

      {/* ── Lab note — what this page is for and what it is not ───────── */}
      <section className={styles.note}>
        <p className={styles.noteTxt}>
          <span className={styles.noteKick}>Lab note</span>
          Five complete builds of the same manual proposal builder went up side
          by side — one feature set, one seed draft, five ways of organising a
          single column of cards. Focus Card was selected; the other four came
          down and are one commit back in history. Fixture data throughout:
          nothing saves, nothing sends.
        </p>
      </section>

      {/* ── Spec-card — the selected design ──────────────────────────── */}
      <section className={styles.grid} aria-label="Selected design">
        {CARD_VARIANTS.map((v) => (
          <Link key={v.route} href={v.route as Route} className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.cardTop}>
                <span className={styles.plate}>{v.station}</span>
                <div className={styles.nameWrap}>
                  <h2 className={styles.name}>{v.name}</h2>
                  <p className={styles.thesis}>{v.thesis}</p>
                </div>
              </div>
              <Schematic kind={v.schematic} />
            </div>
            <div className={styles.cardFoot}>
              <span className={styles.route}>{v.route}</span>
              <span className={styles.open}>
                Open
                <svg
                  className={styles.openIc}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </Link>
        ))}
      </section>

      {/* ── Result block — the four bets that lost ──────────────────────
          Kept deliberately. The comparison is the only reason to trust the
          pick, and it is worthless if the alternatives vanish silently. These
          are text, not links: the routes no longer resolve. */}
      <section className={styles.retired} aria-labelledby="mc-retired-head">
        <div className={styles.retiredHead}>
          <h2 className={styles.retiredTitle} id="mc-retired-head">
            Not selected
          </h2>
          <p className={styles.retiredNote}>
            Four complete builds against the same inventory and the same seed
            draft. Removed from the tree, kept in history — check out the commit
            before the removal to bring any of them back intact.
          </p>
        </div>
        <ul className={styles.retiredList}>
          {RETIRED_VARIANTS.map((v) => (
            <li key={v.route} className={styles.retiredItem}>
              <div className={styles.retiredTop}>
                <span className={styles.retiredName}>{v.name}</span>
                <span className={styles.retiredRoute}>{v.route}</span>
              </div>
              <p className={styles.retiredThesis}>{v.thesis}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
