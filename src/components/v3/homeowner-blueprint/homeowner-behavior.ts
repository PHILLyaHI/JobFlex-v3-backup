// Homeowner portal — the donor's non-wizard scripts, ported verbatim:
// vignettes, the network counter, the drafting-grid parallax and the reveal
// cascade. The wizard itself lives in homeowner-wizard.tsx as React state.
//
// Everything here drives presentation-only DOM that React does not own (class
// toggles on `.rv` / `.v-row` / `.v-note` / `.v-chip`, the `--gy` custom
// property on the ink band, and one text node inside an <svg>), so the donor's
// imperative approach is kept as-is — same selectors, same intervals, same
// thresholds. `init` returns a teardown that clears every timer and observer.

const REDUCED = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export function initHomeowner(root: HTMLElement): () => void {
  const reduced = REDUCED();
  const intervals: number[] = [];
  const timeouts: number[] = [];
  const observers: IntersectionObserver[] = [];
  const later = (fn: () => void, ms: number) => timeouts.push(window.setTimeout(fn, ms));
  const every = (fn: () => void, ms: number) => intervals.push(window.setInterval(fn, ms));

  /* ================= ВИНЬЕТКИ ================= */
  const TYPE_TEXT = "Remodel my 12×14 kitchen with white shaker cabinets and quartz…";
  const typeEl = root.querySelector<HTMLElement>("#vType");
  const chipsBox = root.querySelector<HTMLElement>("#vChips");
  const rowsBox = root.querySelector<HTMLElement>("#vRows");
  const noteEl = root.querySelector<HTMLElement>("#vNote");
  let running = false;

  function startVignettes() {
    if (running) return;
    running = true;

    if (reduced) {
      if (typeEl) typeEl.textContent = TYPE_TEXT;
      if (rowsBox) rowsBox.querySelectorAll(".v-row").forEach((r) => r.classList.add("on"));
      if (noteEl) noteEl.classList.add("on");
      return;
    }

    let n = 0;
    every(() => {
      n = n >= TYPE_TEXT.length + 26 ? 0 : n + 1;
      if (typeEl) typeEl.textContent = TYPE_TEXT.slice(0, Math.min(n, TYPE_TEXT.length));
    }, 55);

    let sel = 0;
    every(() => {
      if (!chipsBox) return;
      const chips = chipsBox.children;
      sel = (sel + 1) % chips.length;
      for (let i = 0; i < chips.length; i++) chips[i].classList.toggle("on", i === sel);
    }, 1700);

    function rowsOn(on: boolean) {
      if (!rowsBox) return;
      const rs = rowsBox.querySelectorAll(".v-row");
      for (let i = 0; i < rs.length; i++) {
        const el = rs[i];
        const k = i;
        later(() => el.classList.toggle("on", on), on ? k * 180 : 0);
      }
    }
    rowsOn(true);
    every(() => {
      rowsOn(false);
      later(() => rowsOn(true), 350);
    }, 4200);

    if (noteEl) noteEl.classList.add("on");
    every(() => {
      if (!noteEl) return;
      noteEl.classList.remove("on");
      later(() => noteEl.classList.add("on"), 500);
    }, 4600);
  }

  const stepsHost = root.querySelector("#steps");
  if (stepsHost) {
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            startVignettes();
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    io.observe(stepsHost);
    observers.push(io);
  }

  /* ================= СЧЁТЧИК СЕТИ ================= */
  const countEl = root.querySelector<HTMLElement>("#netCount");
  const band = root.querySelector<HTMLElement>("#net");
  if (countEl && band) {
    const target = 2300;
    const dur = 1600;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      if (reduced) {
        countEl.textContent = target.toLocaleString("en-US");
        return;
      }
      let t0: number | null = null;
      const frame = (ts: number) => {
        if (t0 === null) t0 = ts;
        const p = Math.min(1, (ts - t0) / dur);
        countEl.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US");
        if (p < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            run();
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.35 },
    );
    io.observe(band);
    observers.push(io);
  }

  /* ================= ПАРАЛЛАКС ЧЕРТЁЖНОЙ СЕТКИ ================= */
  let onScroll: (() => void) | null = null;
  if (band && !reduced) {
    let pending = false;
    const apply = () => {
      pending = false;
      const r = band.getBoundingClientRect();
      if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
      band.style.setProperty("--gy", Math.round((window.innerHeight - r.top) * 0.06) + "px");
    };
    onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
  }

  /* ================= ПОЯВЛЕНИЕ БЛОКОВ ================= */
  const revealIo = new IntersectionObserver(
    (es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("on");
          revealIo.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  root.querySelectorAll(".rv").forEach((el) => revealIo.observe(el));
  observers.push(revealIo);

  return () => {
    intervals.forEach(window.clearInterval);
    timeouts.forEach(window.clearTimeout);
    observers.forEach((io) => io.disconnect());
    if (onScroll) window.removeEventListener("scroll", onScroll);
  };
}
