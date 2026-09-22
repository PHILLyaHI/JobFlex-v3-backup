import { Reveal } from "./reveal";
import { StampIn } from "./stamp-in";
import { COMPARE_COMPETITORS, COMPARE_ROWS, type CompareCell } from "./landing-compare";

/* THE COMPARISON — a schedule off a drawing sheet, inside the one-app section
   (the owner's pick of three drafts, 2026-09-19). No heading of its own: it
   borrows the section's line.

   The rules it is drawn to: the section is paper with the drafting grid; the
   plate is white with a 2 px ink line and the hard offset shadow; our column
   has a blueprint-filled head (the name in paper) sitting flush on ONE
   2 px blueprint rectangle around the rows 01–11 (drawn in the stylesheet —
   see .lp-spec-us::before), the two reading as one figure, a blue tab over
   an outline; inside the outline the plate's own white, with a blueprint
   square and a white tick per row; a competitor's cross is
   the SAME 26 px square as the tick, outlined in ink, never a hairline; the
   vendor's own word for a charge is a mono label of at least 12 px; and every
   mark and label sits on the centre line of its column, on the same axis as
   the vendor's name in the head — only the row labels are set left. The
   ticks and crosses are drawn in the landing's inline 24-grid stroke style;
   this page ships no <symbol> sprite.

   The evidence — quote, URL, date — stays in landing-compare.ts and is not
   rendered. */

const COUNT = COMPARE_ROWS.length;

/* One 26 px square for tick and cross alike, so the two read as the same kind
   of answer. `blue` is ours — blueprint fill, white tick; `ink` is the
   outlined competitor mark. */
function Mark({ kind, tone, stamp }: { kind: "yes" | "no"; tone: "blue" | "ink"; stamp?: boolean }) {
  const glyph =
    kind === "yes" ? (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="square" aria-hidden="true">
        <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
      </svg>
    );
  const cls = `lp-cmp-mark is-${kind} is-${tone}`;
  if (stamp) return <StampIn className={cls}>{glyph}</StampIn>;
  return <span className={cls}>{glyph}</span>;
}

function ThemCell({ cell }: { cell: CompareCell }) {
  if (cell.status === "yes") {
    return (
      <>
        <Mark kind="yes" tone="ink" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (cell.status === "no") {
    return (
      <>
        <Mark kind="no" tone="ink" />
        <span className="sr-only">Not offered</span>
      </>
    );
  }
  // The vendor's own word for the charge, or for the state it is in.
  return <span className="lp-cmp-tag">{cell.label ?? (cell.status === "soon" ? "Coming soon" : "Paid")}</span>;
}

export function CompareSection() {
  return (
    <Reveal delay={120} className="lp-cmp-body">
      <div className="lp-cmp-plate lp-spec-wrap">
        <table className="lp-spec">
          <caption className="sr-only">
            JobFlex compared with Jobber, Housecall Pro and Roofr on {COUNT} capabilities.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="lp-spec-no">
                No.
              </th>
              <th scope="col" className="lp-spec-label">
                Capability
              </th>
              <th scope="col" className="lp-spec-us">
                JobFlex
              </th>
              {COMPARE_COMPETITORS.map((c) => (
                <th key={c.id} scope="col" className="lp-spec-them">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, i) => {
              const no = String(i + 1).padStart(2, "0");
              return (
                <tr key={row.id} className="lp-cmp-r" style={{ transitionDelay: `${120 + i * 60}ms` }}>
                  <td className="lp-spec-no">{no}</td>
                  <th scope="row" className="lp-spec-label">
                    {/* The number rides inside the label on a phone, where the
                        No. column is hidden to give the scroll its width. */}
                    <span className="lp-spec-inno" aria-hidden="true">
                      {no}
                    </span>
                    {row.label}
                  </th>
                  <td className="lp-spec-us">
                    <Mark kind="yes" tone="blue" stamp />
                    <span className="sr-only">Included</span>
                  </td>
                  {COMPARE_COMPETITORS.map((c) => (
                    <td key={c.id} className="lp-spec-them">
                      <ThemCell cell={row.them[c.id]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Reveal>
  );
}
