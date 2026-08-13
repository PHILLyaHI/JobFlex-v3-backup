"use client";

// MOBILE HOMEOWNER — section 3, "How it works": four cards, four live
// vignettes.
//
// Re-laid-out rather than reused. The desktop `homeowner-vignettes.tsx` is a
// 4-across grid that folds to 2×2 at ≤700px and then rescues the overflow with
// `transform: scale(.658)` on the vignette interior — which renders the 7.5px
// mono annotations at 4.9px, below anything readable in daylight. Here the
// cards stack full width and every vignette draws at 1:1.
//
// It also mints five bare document-global ids (`steps`, `vType`, `vChips`,
// `vRows`, `vNote`) that nothing has queried since the React port. Only the
// one the IntersectionObserver actually needs survives, namespaced
// `jfmh-steps`; the other four are gone.
//
// The LOOPS are the desktop module's, tick for tick — 55ms typing with a
// 26-tick pause on the finished line, 1700ms chip advance, 180ms-staggered
// scope rows on a 4200ms cycle with a 350ms gap, and a notification that drops
// every 4600ms and returns 500ms later. All four start together, once, when
// the section crosses 15% of the viewport, and every one of them is a no-op
// under `prefers-reduced-motion` with its final state rendered instead. Each
// vignette owns its own state so the 18-updates-per-second typing loop cannot
// re-render the wizard sitting above it.

import { useEffect, useState } from "react";
import { useInViewOnce, useReducedMotion } from "../homeowner-landing/use-homeowner-behavior";

const TYPE_TEXT = "Remodel my 12×14 kitchen with white shaker cabinets and quartz…";
const V_CHIPS = ["Quartz", "Granite", "Butcher block"];
const V_ROWS = ["Cabinets: replace, shaker, ~14 ln ft", "Countertops: quartz, ~38 sf"];

/* vignette 1 — typing */
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
  return <span>{text}</span>;
}

/* vignette 2 — chips */
function VChips({ started }: { started: boolean }) {
  const reduced = useReducedMotion();
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (!started || reduced) return;
    const id = window.setInterval(() => setSel((s) => (s + 1) % V_CHIPS.length), 1700);
    return () => window.clearInterval(id);
  }, [started, reduced]);

  return (
    <div className="v-chips">
      {V_CHIPS.map((label, i) => (
        <span key={label} className={i === sel ? "v-chip on" : "v-chip"}>
          {label}
        </span>
      ))}
    </div>
  );
}

/* vignette 3 — the raw sentence turning into an estimate */
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
    <div className="v-rows">
      {V_ROWS.map((label, i) => (
        <div key={label} className={shown[i] ? "v-row on" : "v-row"}>
          <i>✓</i>
          {label}
        </div>
      ))}
    </div>
  );
}

/* vignette 4 — the notification */
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
    <div className={on ? "v-note on" : "v-note"}>
      <span className="v-mark">JF</span>
      <div className="v-nbody">
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

export function MobileStepsGrid({
  className,
  gridRef,
}: {
  className: string;
  gridRef: (el: Element | null) => void;
}) {
  const run = useInViewOnce("jfmh-steps", 0.15);

  return (
    <div className={className} id="jfmh-steps" ref={gridRef}>
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
                <use href="#jfmh-i-chev" />
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
