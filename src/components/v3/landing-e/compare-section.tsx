import { LogoMark } from "./logo";
import { Reveal } from "./reveal";
import { StampIn } from "./stamp-in";
import { COMPARE_COMPETITORS, COMPARE_ROWS, type CompareCell } from "./landing-compare";

/* THE COMPARISON TABLE. It has no heading of its own — it lives inside the
   one-app section (intro.tsx) and borrows that section's line as its title, so
   the reader meets one claim and then the evidence for it, not two headings in
   a row.
 *
   WHAT THE EYE IS MEANT TO DO. Left to right: the row label, then our column,
   filled ink with a white square tick, then three muted columns that are
   mostly a grey cross or a small mono footnote. Our column is first after the
   labels for that reason — a reader who stops after two columns has still read
   the argument. Nothing here is a gradient or a star; the only shadow is the
   house's hard offset, and the ticks and crosses are drawn in the same 24-grid
   stroke style as the rest of landing-e (which ships inline icons, not a
   <symbol> sprite — there is no sprite on this page to pull from).

   The evidence — the quote, the URL, the date — stays in landing-compare.ts
   and is deliberately NOT rendered. See the header of that file for how each
   cell earned its status and which row was dropped. */

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" aria-hidden="true">
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </svg>
  );
}

/* A competitor cell. "Paid separately" and "coming soon" are the vendor's own
   qualification, so they are set as a footnote rather than as a verdict. */
function ThemCell({ cell }: { cell: CompareCell }) {
  if (cell.status === "yes") {
    return (
      <>
        <span className="lp-cmp-themYes">
          <CheckIcon />
        </span>
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (cell.status === "no") {
    return (
      <>
        <span className="lp-cmp-no">
          <CrossIcon />
        </span>
        <span className="sr-only">No</span>
      </>
    );
  }
  return <span className="lp-cmp-tag">{cell.status === "soon" ? "Coming soon" : cell.label}</span>;
}

export function CompareSection() {
  return (
    <Reveal delay={120}>
      {/* The scroller. On a phone the page must not move sideways, so the
          horizontal overflow is owned here and the label + JobFlex columns are
          stuck to the left inside it. */}
      <div className="lp-cmp-wrap">
        <table className="lp-cmp">
          <caption className="sr-only">
            JobFlex compared with Jobber, Housecall Pro and Roofr on six capabilities.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="lp-cmp-row">
                <span className="sr-only">Capability</span>
              </th>
              <th scope="col" className="lp-cmp-us lp-cmp-usHead">
                <span className="lp-cmp-usMark">
                  <LogoMark tone="paper" />
                  JobFlex
                </span>
              </th>
              {COMPARE_COMPETITORS.map((c) => (
                <th key={c.id} scope="col" className="lp-cmp-them">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, i) => (
              // The landing's own motion: the rows arrive in sequence off the
              // one `lp-in` the Reveal above sets, once.
              <tr key={row.id} className="lp-cmp-r" style={{ transitionDelay: `${120 + i * 70}ms` }}>
                <th scope="row" className="lp-cmp-row">
                  {row.label}
                </th>
                <td className="lp-cmp-us">
                  <StampIn className="lp-cmp-tick">
                    <CheckIcon />
                  </StampIn>
                  <span className="sr-only">Yes</span>
                </td>
                {COMPARE_COMPETITORS.map((c) => (
                  <td key={c.id} className="lp-cmp-them">
                    <ThemCell cell={row.them[c.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Reveal>
  );
}
