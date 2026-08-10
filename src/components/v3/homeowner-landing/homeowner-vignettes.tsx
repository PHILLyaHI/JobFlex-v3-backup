"use client";

// HOMEOWNER LANDING — section 3, "STEPS": the four cards and their live
// vignettes. Donor `safe('vignettes', …)`.
//
// The donor starts all four loops together, once, when `#steps` crosses 15% of
// the viewport, and drives them by mutating the DOM. Here each vignette is its
// own component holding its own state, for one concrete reason: the typing loop
// ticks every 55ms forever, and a state update that high up would re-render the
// whole page — including the wizard — eighteen times a second. The shared start
// gate is lifted to `StepsGrid` and passed down, so the donor's "all four begin
// at the same moment" is preserved exactly.
//
// Every reduced-motion branch is the donor's: under `reduce` the typing line is
// filled in complete, the scope rows and the notification are shown in their
// final state, the chips stay on their first option, and no interval is ever
// created. Those branches are DERIVED from the flag rather than written into
// state from an effect, which is the same rendered result without a cascade.

import { useEffect, useState } from "react";
import { useInViewOnce, useReducedMotion } from "./use-homeowner-behavior";

const TYPE_TEXT = "Remodel my 12×14 kitchen with white shaker cabinets and quartz…";
const V_CHIPS = ["Quartz", "Granite", "Butcher block"];
const V_ROWS = ["Cabinets: replace, shaker, ~14 ln ft", "Countertops: quartz, ~38 sf"];

/* виньетка 1 — печать (vignette 1 — typing).
   donor: `n = n >= TYPE_TEXT.length + 26 ? 0 : n + 1` every 55ms — the 26 extra
   ticks are the pause on the finished line before it wipes and starts over. */
function VType({ started }: { started: boolean }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!started || reduced) return;
    const id = window.setInterval(() => {
      setN((v) => (v >= TYPE_TEXT.length + 26 ? 0 : v + 1));
    }, 55);
    return () => window.clearInterval(id);
  }, [started, reduced]);

  const text = started && reduced ? TYPE_TEXT : TYPE_TEXT.slice(0, Math.min(n, TYPE_TEXT.length));

  return <span id="vType">{text}</span>;
}

/* виньетка 2 — чипы (vignette 2 — chips). donor: advance every 1700ms.
   Chip 0 ships selected and stays selected when motion is reduced. */
function VChips({ started }: { started: boolean }) {
  const reduced = useReducedMotion();
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (!started || reduced) return;
    const id = window.setInterval(() => setSel((s) => (s + 1) % V_CHIPS.length), 1700);
    return () => window.clearInterval(id);
  }, [started, reduced]);

  return (
    <div className="v-chips" id="vChips">
      {V_CHIPS.map((label, i) => (
        <span key={label} className={i === sel ? "v-chip on" : "v-chip"}>
          {label}
        </span>
      ))}
    </div>
  );
}

/* виньетка 3 — превращение в смету (vignette 3 — turning into an estimate).
   donor `rowsOn(on)`: staggered 180ms in, instant out; the cycle drops the rows
   every 4200ms and brings them back 350ms later. */
function VRows({ started }: { started: boolean }) {
  const reduced = useReducedMotion();
  const [on, setOn] = useState<boolean[]>(() => V_ROWS.map(() => false));

  useEffect(() => {
    if (!started || reduced) return;

    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const rowsOn = (value: boolean) => {
      V_ROWS.forEach((_, i) => {
        later(
          () =>
            setOn((prev) => {
              const next = prev.slice();
              next[i] = value;
              return next;
            }),
          value ? i * 180 : 0
        );
      });
    };

    rowsOn(true);
    const cycle = window.setInterval(() => {
      rowsOn(false);
      later(() => rowsOn(true), 350);
    }, 4200);

    return () => {
      window.clearInterval(cycle);
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [started, reduced]);

  const shown = reduced ? V_ROWS.map(() => started) : on;

  return (
    <div className="v-rows" id="vRows">
      {V_ROWS.map((label, i) => (
        <div key={label} className={shown[i] ? "v-row on" : "v-row"}>
          <i>✓</i>
          {label}
        </div>
      ))}
    </div>
  );
}

/* виньетка 4 — уведомление (vignette 4 — notification). donor: shown at once,
   then re-dropped every 4600ms and restored 500ms later. */
function VNote({ started }: { started: boolean }) {
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!started || reduced) return;
    let back = 0;
    const id = window.setInterval(() => {
      setHidden(true);
      back = window.setTimeout(() => setHidden(false), 500);
    }, 4600);
    return () => {
      window.clearInterval(id);
      if (back) window.clearTimeout(back);
    };
  }, [started, reduced]);

  const on = started && !hidden;

  return (
    <div className={on ? "v-note on" : "v-note"} id="vNote">
      <span className="v-mark">JF</span>
      <div style={{ minWidth: 0 }}>
        <div className="v-nt">
          <b>JobFlex</b>
          <span>now</span>
        </div>
        <p className="v-nb">
          <em>Reyes &amp; Sons</em> <b>4.9</b> accepted your project — quote incoming.
        </p>
      </div>
    </div>
  );
}

export function StepsGrid({
  className,
  gridRef,
}: {
  className: string;
  gridRef: (el: Element | null) => void;
}) {
  /* donor: one IntersectionObserver on `#steps`, threshold 0.15, `start()`
     once — the observer unobserves on the first hit and `run` never goes back
     to false, which is the donor's `running` latch. */
  const run = useInViewOnce("steps", 0.15);

  return (
    <div className={className} id="steps" ref={gridRef}>
      <div className="st">
        <div className="vig">
          <div className="vig-in">
            <div className="v-type">
              <div className="v-l">Your project</div>
              <p className="v-p">
                <VType started={run} />
                <span className="v-caret"></span>
              </p>
            </div>
          </div>
        </div>
        <div className="st-n">01</div>
        <div className="st-t">Describe it</div>
        <p className="st-b">Plain English is perfect. Photos help, too.</p>
      </div>

      <div className="st">
        <div className="vig">
          <div className="vig-in">
            <div className="v-q">
              <div className="v-qt">2. Countertop material?</div>
              <VChips started={run} />
              <div className="v-qt dim">3. Is the layout changing?</div>
            </div>
          </div>
        </div>
        <div className="st-n">02</div>
        <div className="st-t">Answer 3–5 smart questions</div>
        <p className="st-b">Only what matters — size, materials, layout.</p>
      </div>

      <div className="st">
        <div className="vig">
          <div className="vig-in">
            <div className="v-s">
              <p className="v-raw">“new counters, kitchen kinda small, floor squeaks”</p>
              <svg className="ic v-arrow">
                <use href="#i-chev" />
              </svg>
              <VRows started={run} />
            </div>
          </div>
        </div>
        <div className="st-n">03</div>
        <div className="st-t">Get a contractor-ready scope</div>
        <p className="st-b">Your words become a professional Scope of Work.</p>
      </div>

      <div className="st">
        <div className="vig">
          <div className="vig-in">
            <div className="v-back"></div>
            <VNote started={run} />
          </div>
        </div>
        <div className="st-n">04</div>
        <div className="st-t">A pro takes your job</div>
        <p className="st-b">Vetted pros reply with line-item quotes.</p>
      </div>
    </div>
  );
}
