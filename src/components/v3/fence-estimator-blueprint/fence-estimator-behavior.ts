// Fence estimator blueprint — runtime behaviors, ported verbatim from the donor
// file's <script> (jobflex-fence-estimator-blueprint_7.html). Every duration,
// easing, stagger, formula, price and rendered string is the donor's exact
// value. Adaptations are mechanical only:
// - `document.getElementById(...)` becomes a query against the mounted
//   `.content` root, which the shared shell owns and re-fills on navigation;
// - the delegated click/input/change listeners stay on `document` (that is what
//   makes a click anywhere dismiss the Gate/Door popovers) but are tracked for
//   unmount cleanup, together with every timer and observer;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below.

import { isMapsBrowserEnabled, loadMapsLibrary } from "@/lib/googleMaps";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { attachPlacesSuggest, type PickedPlace } from "@/components/v3/blueprint-shell/places-suggest";
import { mountIsland, type Island } from "@/components/v3/blueprint-shell/react-island";
import {
  FenceDrawMap,
  type FenceDrawMapApi,
  type FenceDrawMapProps,
} from "@/components/estimator/fence/FenceDrawMap";
import {
  buildingsToFootprints,
  latLngToLocalFeet,
} from "@/components/estimator/fence/mapProjection";
import type {
  BuildingFootprint,
  GateSpec,
  OpeningKind,
  PathPoint,
} from "@/components/estimator/fence/fenceTypes";
// Type-only: the component itself arrives through a dynamic import so Three.js
// stays off the initial bundle of a page whose primary surface is a map.
import type { FenceModel3D } from "@/components/estimator/fence/FenceModel3D";
import {
  buildFenceLineItems,
  type FencePricingConfig,
} from "@/components/estimator/fence/fencePricing";
import type { ArmedOpening } from "@/stores/useFenceStudioStore";
import { fetchPropertyBoundary } from "@/actions/fenceBoundary";
import {
  groupSides,
  detectFrontSides,
  bearingLabel,
  type FrontSideMatch,
  type ParcelSide,
  type RingPoint,
} from "@/lib/parcels";
import { pointInRing } from "@/lib/parcel";
import { convertFenceEstimateToProposal } from "@/actions/fenceEstimator";
import { isPlanLimitError, PLAN_LIMIT_MESSAGE } from "@/lib/planLimits";
import {
  MATERIALS,
  HEIGHTS,
  OPENINGS,
  DEMO_PER_FT,
  type Material,
  type OpeningType,
} from "./fence-estimator-data";

/** Where a created proposal opens. `(dashboard)/dashboard/proposals/[id]` — the
 *  classic-shell detail route; this blueprint fleet only owns the LIST page. */
const PROPOSAL_ROUTE = "/dashboard/proposals/";

/** Supplied by the page component, which is the only thing on this route that
 *  can hold a Next router. */
export type FenceEstimatorOptions = {
  navigate: (href: string) => void;
};

/** The two fields of a Geocoder result this page reads. */
type GeoResult = {
  formatted_address?: string;
  geometry?: { location?: { lat: () => number; lng: () => number } };
};

type FenceRun = { id: string; ft: number };
/**
 * A ledger opening. `seg`/`t`/`x`/`y` are its PLACEMENT on the traced map
 * surface and are absent for an opening added straight from the Gate/Door
 * popover with nothing drawn: `seg` is the index of the traced segment it rides
 * and `t` its 0..1 position along it, or `x`/`y` are free local-feet coords when
 * it was dropped away from any run. `run` is the ledger ordinal that placement
 * resolves to ("Run 3"), which is the only one of them the row renders.
 */
type FenceOpening = {
  id: string;
  type: string;
  run: number | null;
  seg?: number;
  t?: number;
  x?: number;
  y?: number;
};
type FenceState = {
  mode: string;
  material: string;
  height: number;
  demo: boolean;
  runs: FenceRun[];
  openings: FenceOpening[];
};

export function initFenceEstimatorContent(
  content: HTMLElement,
  opts: FenceEstimatorOptions,
): () => void {
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const root = content;
  const main = content.closest<HTMLElement>(".main");
  const disposers: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const on = (
    target: EventTarget,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  /** setTimeout that survives nothing: every pending id is cleared on unmount. */
  const after = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // Dismiss Lead Center banners (smooth height + gap collapse) — inert on this
  // page (no banner in the markup), kept for donor parity with shared shells.
  $$(".banner-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = btn.closest<HTMLElement>(".banner");
      if (!b || b.classList.contains("closing")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        b.classList.add("hidden");
        return;
      }
      b.style.height = b.offsetHeight + "px";
      b.style.transitionDelay = "0ms";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          b.classList.add("closing");
          b.style.height = "0px";
        }),
      );
      b.addEventListener("transitionend", function te(e) {
        if (e.propertyName !== "height") return;
        b.classList.add("hidden");
        b.removeEventListener("transitionend", te);
      });
    });
  });

  // ================= FENCE STUDIO: STATE =================
  // MATERIALS / HEIGHTS / OPENINGS / DEMO_PER_FT live in ./fence-estimator-data
  // — the RATE CARD, which is real reference data and stays.
  //
  // The donor opened on nine runs and one gate. That fixture is GONE. It existed
  // to make a static mockup look inhabited, and once "Convert to proposal"
  // reaches the database it stops being a mockup: an untouched page would have
  // written a 222 ft cedar fence nobody measured into a real proposal. The page
  // now opens empty, `#runsEmpty` says so, and every foot on the ticket got
  // there by being traced on the map or typed into a run row.
  //
  // The sequence counters are per-mount; ids only have to be unique within one
  // visit, and a navigation away rebuilds the module's whole closure.
  let runSeq = 0,
    opSeq = 0;
  const fs: FenceState = {
    mode: 'draw', material: 'composite', height: 6, demo: false,
    runs: [],
    openings: []
  };

  function money(n: number) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function mat(): Material { return MATERIALS.find(function (m) { return m.id === fs.material; }) || MATERIALS[0]; }
  function heightMult() { const h = HEIGHTS.find(function (x) { return x.ft === fs.height; }); return h ? h.mult : 1; }
  function opType(id: string): OpeningType { return OPENINGS.find(function (o) { return o.id === id; }) || OPENINGS[0]; }
  function totalFt() { return fs.runs.reduce(function (a, r) { return a + (r.ft || 0); }, 0); }
  function price() {
    const ft = totalFt();
    const perFt = mat().base * heightMult();
    const fence = ft * perFt;
    const ops = fs.openings.reduce(function (a, o) { return a + opType(o.type).price; }, 0);
    const demo = fs.demo ? ft * DEMO_PER_FT : 0;
    const total = fence + ops + demo;
    return { ft: ft, perFt: perFt, fence: fence, ops: ops, demo: demo, total: total, perAll: ft ? total / ft : 0 };
  }

  /** The donor rebuilt this strip in two places — the markup is identical. */
  function statStripHtml() {
    return '<div class="stat-cell"><div class="kpi-lbl">Total</div><div class="stat-v accent">' + Math.round(totalFt()) + ' ft</div></div>' +
      '<div class="stat-cell"><div class="kpi-lbl">Runs</div><div class="stat-v">' + fs.runs.length + '</div></div>' +
      '<div class="stat-cell"><div class="kpi-lbl">Openings</div><div class="stat-v">' + fs.openings.length + '</div></div>';
  }

  // ================= RENDER =================
  function renderTicket() {
    const p = price();
    const tkTotal = $('#tkTotal');
    const tkSub = $('#tkSub');
    const tkLines = $('#tkLines');
    if (!tkTotal || !tkSub || !tkLines) return;
    // Nothing measured is not "$0" — a zero total reads like a priced job that
    // came to nothing. The donor's own em-dash is the honest resting state, and
    // it is what the markup ships with.
    if (p.ft <= 0 && !fs.openings.length) {
      tkTotal.textContent = '—';
      tkSub.textContent = 'Nothing measured yet';
      tkLines.innerHTML = '';
      return;
    }
    tkTotal.textContent = money(p.total);
    tkSub.textContent = Math.round(p.ft) + ' lf · ' + money(p.perAll) + '/lf';
    const groups: Record<string, number> = {};
    fs.openings.forEach(function (o) {
      const t = opType(o.type);
      groups[t.label] = (groups[t.label] || 0) + 1;
    });
    // The fence line only exists once there is fence. Reaching here with no
    // footage means an opening was added before any run was measured, and
    // "Composite · 6 ft · 0 lf — $0" is a line about nothing.
    let html = p.ft > 0
      ? '<li><span>' + mat().label + ' · ' + fs.height + ' ft · ' + Math.round(p.ft) + ' lf</span><span>' + money(p.fence) + '</span></li>'
      : '';
    Object.keys(groups).forEach(function (k) {
      // The keys came out of `opType(...).label`, so the lookup always hits.
      const t = OPENINGS.find(function (o) { return o.label === k; }) as OpeningType;
      html += '<li><span>' + k + ' × ' + groups[k] + '</span><span>' + money(t.price * groups[k]) + '</span></li>';
    });
    if (p.demo > 0) html += '<li><span>Demolition &amp; haul · ' + money(DEMO_PER_FT) + '/lf</span><span>' + money(p.demo) + '</span></li>';
    tkLines.innerHTML = html;
  }
  // ---- one row's markup, so a row can be ADDED or PATCHED without rebuilding
  // the list it lives in. Every edit on this page used to call renderStudio(),
  // which replaced the innerHTML of all four lists — and the observer on the
  // runs and materials lists then replayed the entrance cascade. Adding a run,
  // deleting a line or picking a material therefore looked like the whole rail
  // reloading. ----
  function runRowHtml(r: FenceRun, i: number) {
    return '<li data-run="' + r.id + '"><span class="run-n">Run ' + (i + 1) + '</span>' +
      '<input class="run-in" type="number" min="1" step="1" value="' + r.ft + '" data-run-ft>' +
      '<span class="run-u">ft</span>' +
      '<button class="row-x" type="button" data-del-run aria-label="Remove run">×</button></li>';
  }
  /** Grouped by kind, so the native menu shows a labelled rule between the gates
   *  and the doors instead of one flat list of seven look-alike entries. */
  function openOptionsHtml(selected: string) {
    return (['gate', 'door'] as const).map(function (kind) {
      const items = OPENINGS.filter(function (x) { return x.kind === kind; });
      if (!items.length) return '';
      return '<optgroup label="' + (kind === 'gate' ? 'Gates' : 'Doors') + '">' +
        items.map(function (x) {
          return '<option value="' + x.id + '"' + (x.id === selected ? ' selected' : '') + '>' +
            x.label + ' · ' + x.width + ' ft</option>';
        }).join('') +
        '</optgroup>';
    }).join('');
  }
  function openRowHtml(o: FenceOpening) {
    const t = opType(o.type);
    return '<li data-op="' + o.id + '"><span class="op-ic"><svg class="ic"><use href="#' +
      (t.kind === 'gate' ? 'i-door-open' : 'i-door-closed') + '"/></svg></span>' +
      // The shared blueprint select. `.op-sel` moves onto the `.bp-sel`
      // WRAPPER, not the control: the wrapper is what the grid now places at
      // `1 / 2`, and a select cannot carry the pseudo-element that draws the
      // chevron. `.bp-sel-in` (blueprint-global.css) owns the appearance
      // reset; the row's height and inset stay in fence-estimator.module.css.
      // `data-op-type` stays on the <select> — the document-level 'change'
      // delegate matches it there and walks up to `[data-op]`.
      '<span class="bp-sel op-sel"><select class="bp-sel-in" data-op-type aria-label="Opening type">' +
      openOptionsHtml(o.type) + '</select></span>' +
      '<span class="op-price">' + money(t.price) + '</span>' +
      '<button class="row-x" type="button" data-del-op aria-label="Remove opening">×</button>' +
      '<span class="op-sub">' + t.width + ' ft · ' + (o.run ? 'Run ' + o.run : 'Free') + '</span></li>';
  }
  /** Re-read one opening row's derived cells after its type changed. */
  function paintOpenRow(li: HTMLElement, o: FenceOpening) {
    const t = opType(o.type);
    const use = li.querySelector<SVGUseElement>('.op-ic use');
    use?.setAttribute('href', t.kind === 'gate' ? '#i-door-open' : '#i-door-closed');
    const price = li.querySelector<HTMLElement>('.op-price');
    if (price) price.textContent = money(t.price);
    const sub = li.querySelector<HTMLElement>('.op-sub');
    if (sub) sub.textContent = t.width + ' ft · ' + (o.run ? 'Run ' + o.run : 'Free');
  }
  /** After a run is deleted the survivors' ordinals shift. */
  function renumberRuns() {
    $$('#runsList [data-run]').forEach(function (li, i) {
      const n = li.querySelector<HTMLElement>('.run-n');
      if (n) n.textContent = 'Run ' + (i + 1);
    });
  }
  function renderStrip() {
    const strip = $('#statStrip');
    if (strip) strip.innerHTML = statStripHtml();
  }
  /** The figures every edit touches: the ticket and the stat strip. Text only —
   *  no list is rebuilt, so nothing re-animates. */
  function renderFigures() {
    renderTicket();
    renderStrip();
    syncRunsEmpty();
    // Material, height and openings are the 3D scene's inputs too. No-op until
    // the scene is mounted, and `modelGates()` keeps the array identity stable
    // so a keystroke in a run-length box does not rebuild it.
    pushModel();
  }
  function syncOpenEmpty() {
    $('#openEmpty')?.classList.toggle('is-hidden', fs.openings.length !== 0);
  }
  /** Counts the rows ON SCREEN, not the ones in `fs.runs`: a row that is
   *  mid-`leaveRow` has already left the model but is still fading, and
   *  printing "No runs yet" underneath it would flash. `leaveRow` calls its
   *  commit AFTER removing the node, so the last exit re-runs this and the
   *  empty line arrives exactly when the row does leave. */
  function syncRunsEmpty() {
    const showing = $$('#runsList [data-run]').length > 0 || fs.runs.length > 0;
    $('#runsEmpty')?.classList.toggle('is-hidden', showing);
  }
  function renderLedger() {
    const runs = $('#runsList');
    const list = $('#openList');
    if (!runs || !list) return;
    renderStrip();
    runs.innerHTML = fs.runs.map(runRowHtml).join('');
    list.innerHTML = fs.openings.map(openRowHtml).join('');
    syncOpenEmpty();
    syncRunsEmpty();
  }
  function renderControls() {
    const matList = $('#matList');
    const heights = $('#heights');
    const demoTgl = $('#demoTgl');
    if (!matList || !heights || !demoTgl) return;
    matList.innerHTML = MATERIALS.map(function (m) {
      return '<li class="' + (fs.material === m.id ? 'on' : '') + '" data-mat="' + m.id +
        '" role="option" tabindex="0" aria-selected="' + (fs.material === m.id ? 'true' : 'false') + '">' +
        '<span class="mat-sw" style="background:' + m.color + '"></span>' +
        '<span class="mat-name">' + m.label + '</span>' +
        '<span class="mat-rate">' + money(m.base) + '/lf</span></li>';
    }).join('');
    heights.innerHTML = HEIGHTS.map(function (h) {
      return '<button class="seg-btn' + (fs.height === h.ft ? ' on' : '') + '" type="button" data-h="' + h.ft + '">' + h.ft + ' ft</button>';
    }).join('');
    demoTgl.classList.toggle('on', fs.demo);
  }
  function renderPops() {
    ['gate', 'door'].forEach(function (kind) {
      const box = $(kind === 'gate' ? '#popGate' : '#popDoor');
      if (!box) return;
      // Each entry carries its own icon and the list is ruled between items, so
      // "Single gate / Double gate / Slide gate" stop reading as one block of
      // near-identical text. The icon is the door glyph the ledger row uses for
      // the same opening, so the popover and the row agree.
      box.innerHTML = OPENINGS.filter(function (o) { return o.kind === kind; }).map(function (o) {
        return '<button class="tp-item" type="button" data-add-open="' + o.id + '">' +
          '<span class="tp-ic"><svg class="ic"><use href="#' +
            (o.kind === 'gate' ? 'i-door-open' : 'i-door-closed') + '"/></svg></span>' +
          '<span class="tp-t"><span class="tp-n">' + o.label + '</span>' +
          '<span class="tp-w">' + o.width + ' ft wide</span></span>' +
          '<span class="tp-p">' + money(o.price) + '</span></button>';
      }).join('');
    });
  }
  function closePops() {
    $$('.tool-pop').forEach(function (p) { p.classList.remove('open'); });
  }
  function renderStudio() { renderTicket(); renderLedger(); renderControls(); renderPops(); }

  /** Installed by the motion module below; null under reduced motion. Called
   *  ONLY where a list genuinely re-lists (Clear, Reset, first paint). */
  let playStagger: (() => void) | null = null;

  /**
   * Append one row and let just that row arrive. The rest of the list is not
   * touched, so nothing else moves.
   */
  function appendRow(list: HTMLElement | null, html: string) {
    if (!list) return;
    const tmp = document.createElement('ul');
    tmp.innerHTML = html;
    const row = tmp.firstElementChild as HTMLElement | null;
    if (!row) return;
    list.appendChild(row);
    staggerIn([row]);
  }

  /** `leaveRow` takes `(ms, fn)`; this module's tracked timeout is `(fn, ms)`. */
  const afterMs = (ms: number, fn: () => void) => after(fn, ms);
  /** One row leaves: it fades out on its own and the rows below close the gap. */
  function leave(row: HTMLElement, commit: () => void) {
    leaveRow(row, commit, afterMs, { leaveClass: 'row--leaving' });
  }

  /** One pick path for mouse and keyboard. The list is patched in place (no
   *  re-render), so `aria-selected` must move with the `on` class. */
  function pickMaterial(m: HTMLElement) {
    fs.material = m.dataset.mat || '';
    $$('#matList [data-mat]').forEach(function (li) {
      const picked = li === m;
      li.classList.toggle('on', picked);
      li.setAttribute('aria-selected', picked ? 'true' : 'false');
    });
    renderFigures();
  }

  // ================= EVENTS =================
  on(document, 'click', function (e) {
    if (!(e.target instanceof Element)) return;
    const target = e.target;
    const md = target.closest<HTMLElement>('[data-mode]');
    if (md) {
      fs.mode = md.dataset.mode || '';
      $$('#modeSwitch .vsw-btn').forEach(function (b) { b.classList.toggle('active', b === md); });
      // An armed tool with the map hidden has nothing to click on.
      if (fs.mode === '3d' && armed) setArmed(null);
      // Swaps the panels AND, the first time 3D is opened with something traced,
      // loads and mounts the scene.
      syncStage();
      return;
    }
    // Material / height / demo change the PRICE, not the lists. Mark the picked
    // option in place and repaint the figures — rebuilding `#matList` here is
    // what made choosing a material re-cascade the whole material list.
    const m = target.closest<HTMLElement>('[data-mat]');
    if (m) {
      pickMaterial(m);
      return;
    }
    const h = target.closest<HTMLElement>('[data-h]');
    if (h) {
      fs.height = Number(h.dataset.h);
      $$('#heights [data-h]').forEach(function (b) { b.classList.toggle('on', b === h); });
      renderFigures();
      return;
    }
    if (target.closest('#demoTgl')) {
      fs.demo = !fs.demo;
      $('#demoTgl')?.classList.toggle('on', fs.demo);
      renderFigures();
      return;
    }

    const menuBtn = target.closest<HTMLElement>('[data-menu]');
    if (menuBtn) {
      const box = $(menuBtn.dataset.menu === 'gate' ? '#popGate' : '#popDoor');
      if (!box) return;
      const wasOpen = box.classList.contains('open');
      closePops();
      if (!wasOpen) box.classList.add('open');
      return;
    }
    const addOpen = target.closest<HTMLElement>('[data-add-open]');
    if (addOpen) {
      const pick = addOpen.dataset.addOpen || '';
      closePops();
      // With a live surface and something traced, picking a type ARMS the map:
      // the next click seats the opening on a run, which is what makes the row's
      // "Run 3" mean anything. With no key, or nothing drawn yet, it still drops
      // straight into the ledger the way it always did.
      if (mapApi && mapPoints.length >= 2) {
        const t = opType(pick);
        setArmed({
          kind: (t.kind === 'door' ? 'door' : 'gate') as OpeningKind,
          variant: pick,
          widthFt: t.width,
        });
        return;
      }
      opSeq += 1;
      const o: FenceOpening = {
        id: 'o' + opSeq,
        type: pick,
        run: fs.runs.length ? 1 : null,
      };
      fs.openings.push(o);
      appendRow($('#openList'), openRowHtml(o));
      syncOpenEmpty();
      renderFigures();
      return;
    }
    if (!target.closest('.tool-pop')) closePops();

    const act = target.closest<HTMLElement>('[data-act]');
    if (act) {
      const kind = act.dataset.act;
      // Add run APPENDS one row. It used to rebuild the list, so every existing
      // run faded out and cascaded back in just to make room for the new one.
      if (kind === 'add-run') {
        runSeq += 1;
        const r: FenceRun = { id: 'r' + runSeq, ft: 20 };
        fs.runs.push(r);
        appendRow($('#runsList'), runRowHtml(r, fs.runs.length - 1));
        renderFigures();
        return;
      }
      // Once a trace owns the ledger these three drive the MAP, and the ledger
      // follows from the path it commits. Driving `fs.runs` directly here would
      // make the two disagree the moment the next vertex landed.
      if (kind === 'close-loop') {
        if (mapOwnsRuns && mapApi) { mapApi.closeLoop(); return; }
        if (fs.runs.length) {
          runSeq += 1;
          const r: FenceRun = { id: 'r' + runSeq, ft: Math.round(totalFt() * 0.12) || 12 };
          fs.runs.push(r);
          appendRow($('#runsList'), runRowHtml(r, fs.runs.length - 1));
        }
        renderFigures();
        return;
      }
      // Undo drops the last run — one row leaving, so it leaves like one.
      if (kind === 'undo') {
        if (mapOwnsRuns && mapApi) { mapApi.undo(); return; }
        // The donor stopped at one run because an empty ledger was not a state
        // it could render. It is now (`#runsEmpty`), so undo goes all the way.
        if (!fs.runs.length) return;
        const last = $$('#runsList [data-run]').pop();
        if (!last) return;
        leave(last, function () {
          fs.runs.pop();
          renumberRuns();
          renderFigures();
        });
        return;
      }
      // Clear and Reset genuinely re-list everything, so those DO cascade.
      if (kind === 'clear') {
        fs.runs = []; fs.openings = []; renderStudio(); playStagger?.();
        setArmed(null);
        mapApi?.clear();
        return;
      }
      // Align is a MODE on the surface, so the button rests in an active state
      // instead of flashing a confirmation. Without a surface it falls through
      // to the donor's [data-flash] tick below.
      if (kind === 'align' && mapApi) {
        aligning = !aligning;
        mapApi.setAlign(aligning);
        if (aligning) setArmed(null);
        act.classList.toggle('on', aligning);
        syncHint();
        return;
      }
      // The ReportAll boundary raster — a MODE like Align, so the button rests
      // active. Tiles ride an ALLTIME quota; the layer mounts only on demand.
      if (kind === 'lot-lines') {
        lotLines = !lotLines;
        act.classList.toggle('on', lotLines);
        act.setAttribute('aria-pressed', String(lotLines));
        pushMap();
        return;
      }
    }
    const delRun = target.closest<HTMLElement>('[data-del-run]');
    if (delRun) {
      const li = delRun.closest<HTMLElement>('[data-run]');
      if (!li) return;
      leave(li, function () {
        fs.runs = fs.runs.filter(function (r) { return r.id !== li.dataset.run; });
        renumberRuns();
        renderFigures();
      });
      return;
    }
    const delOp = target.closest<HTMLElement>('[data-del-op]');
    if (delOp) {
      const li = delOp.closest<HTMLElement>('[data-op]');
      if (!li) return;
      leave(li, function () {
        fs.openings = fs.openings.filter(function (o) { return o.id !== li.dataset.op; });
        syncOpenEmpty();
        renderFigures();
      });
      return;
    }
    if (target.closest('#resetBtn')) {
      // Reset used to reinstate a 3-run demo fixture. With the ledger backed by
      // a real trace there is nothing to reinstate: reset is "start this
      // property over", so the geometry goes and the SPEC (material, height,
      // teardown) returns to the page's defaults.
      fs.runs = [];
      fs.openings = [];
      fs.demo = false;
      fs.material = 'composite';
      fs.height = 6;
      renderStudio();
      playStagger?.();
      mapOwnsRuns = false;
      mapPoints = [];
      siteBuildings = [];
      // Takes the 3D scene down with it — there is no longer a fence to show.
      syncStage();
      setArmed(null);
      if (aligning && mapApi) {
        aligning = false;
        mapApi.setAlign(false);
        $$('[data-act="align"]').forEach(function (b) { b.classList.remove('on'); });
        syncHint();
      }
      mapApi?.clear();
      return;
    }
    // Drives the map, then falls through so the button still flashes its tick.
    const zoomBtn = target.closest<HTMLElement>('[data-zoom]');
    if (zoomBtn) mapApi?.zoomBy(Number(zoomBtn.dataset.zoom));
    const flashIcon = target.closest<HTMLElement>('[data-flash-icon]');
    if (flashIcon && !flashIcon.dataset.busy) {
      flashIcon.dataset.busy = '1';
      flashIcon.classList.add('done');
      after(function () { flashIcon.classList.remove('done'); delete flashIcon.dataset.busy; }, 500);
      return;
    }
    const fl = target.closest<HTMLElement>('[data-flash]');
    if (fl && !fl.dataset.busy) {
      fl.dataset.busy = '1';
      const old = fl.innerHTML;
      fl.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>' + fl.dataset.flash;
      after(function () { fl.innerHTML = old; delete fl.dataset.busy; }, 1400);
      return;
    }
    if (target.closest('#findBtn')) {
      const btn = target.closest<HTMLElement>('#findBtn');
      if (!btn || btn.dataset.busy) return;
      // With a browser key configured, Find geocodes whatever is typed — so a
      // full address resolves even when the user never picks a suggestion.
      if (isMapsBrowserEnabled()) { void geocodeTyped(btn); return; }
      btn.dataset.busy = '1';
      const old = btn.innerHTML;
      btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>No map key';
      after(function () { btn.innerHTML = old; delete btn.dataset.busy; }, 1600);
      return;
    }
    if (target.closest('#parcelBtn')) {
      const btn = target.closest<HTMLElement>('#parcelBtn');
      if (!btn || btn.dataset.busy) return;
      void loadParcel(btn);
      return;
    }
    const conv = target.closest<HTMLElement>('#convertBtn');
    if (conv && !conv.dataset.busy) {
      void convertToProposal(conv);
    }
  });
  // Enter/Space on a material row selects it exactly like a click — the rows
  // are focusable options, not buttons, so the key path is wired by hand.
  on(document, 'keydown', function (e) {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (!(ev.target instanceof Element)) return;
    const m = ev.target.closest<HTMLElement>('[data-mat]');
    if (m) {
      ev.preventDefault(); // Space must select, not scroll the page.
      pickMaterial(m);
    }
  });

  on(document, 'input', function (e) {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.matches('[data-run-ft]')) {
      const li = t.closest<HTMLElement>('[data-run]');
      if (!li) return;
      const r = fs.runs.find(function (x) { return x.id === li.dataset.run; });
      if (r) { r.ft = Math.max(0, parseInt(t.value, 10) || 0); }
      renderTicket();
      const strip = $('#statStrip');
      if (strip) strip.innerHTML = statStripHtml();
    }
  });
  on(document, 'change', function (e) {
    const t = e.target;
    if (!(t instanceof HTMLSelectElement)) return;
    if (t.matches('[data-op-type]')) {
      const li = t.closest<HTMLElement>('[data-op]');
      if (!li) return;
      const o = fs.openings.find(function (x) { return x.id === li.dataset.op; });
      if (!o) return;
      o.type = t.value;
      // Patch this row's icon, width and price. Re-rendering the list here
      // destroyed the <select> the user had just used — which also stole focus
      // from it — and re-cascaded every other opening.
      paintOpenRow(li, o);
      renderFigures();
    }
  });

  // ================= MAP SURFACE (React island) =================
  // The draw surface is the studio's existing React component,
  // components/estimator/fence/FenceDrawMap, mounted here through the island
  // bridge rather than re-derived as imperative DOM. It carries the editable
  // google.maps.Polyline plumbing, the pixel-radius vertex magnets, the armed-
  // opening ghost and the marker-drag maths — none of which is design, and all
  // of which would otherwise exist twice.
  //
  // The page keeps its own chrome: `.stage-tools`, `.stage-zoom` and
  // `.stage-hint` are the blueprint design, so the surface mounts with
  // `chrome: false` and this module drives it through the api it hands back.
  //
  // THE TWO VOCABULARIES
  //   surface → `points: PathPoint[]`, LOCAL FEET about the searched address.
  //             Fence exists between points[i] and points[i+1] UNLESS
  //             points[i+1].gap marks a run break (a second, disconnected fence).
  //   ledger  → `fs.runs`, a flat list of lengths.
  // One traced SEGMENT is one ledger run — the same numbering the old studio's
  // ledger used — so the mapping is: every non-gap segment, in trace order,
  // becomes one `fs.runs` row carrying its length in feet.

  let mapIsland: Island<FenceDrawMapProps> | null = null;
  let mapApi: FenceDrawMapApi | null = null;
  /** The traced path in local feet. The surface owns it; this is the mirror. */
  let mapPoints: PathPoint[] = [];
  /**
   * Bumped whenever THIS module produces the path instead of the surface (the
   * parcel ring). It is the only thing that makes the surface re-seed its
   * polylines from `points` — during a trace the surface is the owner and
   * ignores the prop, which is what stops a commit from feeding back into it.
   */
  let mapRev = 0;
  let mapOrigin: { lat: number; lng: number } | null = null;
  let armed: ArmedOpening | null = null;
  let aligning = false;
  // ── Cadastral parcel (ReportAll via /api/parcels) ──
  /** The lot's outer ring as surveyed, [lat, lng] — full resolution. */
  let parcelRingPts: RingPoint[] | null = null;
  /** The same ring in the map's vocabulary — the polygon overlay's path. */
  let parcelRing: Array<{ lat: number; lng: number }> | null = null;
  /** Readable walls: consecutive collinear segments merged (lib/parcels
   *  groupSides), so a 22-segment survey lists as 4–8 rows. */
  let parcelSides: ParcelSide[] = [];
  /** Which sides count toward "Use N ft" — the street side defaults to off,
   *  but only when the geometry singles one out (see detectFrontSide). */
  let parcelChecked: boolean[] = [];
  /** Hovered row in the sides list — highlighted on the map. */
  let parcelHover: number | null = null;
  /** ReportAll raster boundary tiles (the "Lot lines" tool). */
  let lotLines = false;
  let parcelBusy = false;
  /**
   * True once a trace has produced at least one segment. Until then the donor's
   * demo ledger stands: the first click on the map lays ONE vertex and no
   * segment, and taking that literally would blank the ledger and the price
   * before anything had been drawn.
   */
  let mapOwnsRuns = false;

  const hintEl = $('.stage-hint');
  const hintIdle = hintEl?.textContent ?? '';

  /** Resolve a design token off `.content`, where the page declares them —
   *  the Maps SDK needs a concrete colour string and must not be handed a
   *  literal that would drift from the token.
   *
   *  Resolved ONCE per name: `mapProps()` runs on every committed drag frame,
   *  and `getComputedStyle` there would force a style recalc 60×/second for two
   *  values that cannot change while the page is mounted. */
  const tokenCache = new Map<string, string | undefined>();
  function token(name: string): string | undefined {
    if (!tokenCache.has(name)) {
      tokenCache.set(name, getComputedStyle(root).getPropertyValue(name).trim() || undefined);
    }
    return tokenCache.get(name);
  }

  /** Every non-gap segment of the trace, in order. `seg` indexes `mapPoints`. */
  function tracedSegments(pts: PathPoint[]): Array<{ seg: number; ft: number }> {
    const out: Array<{ seg: number; ft: number }> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (b.gap) continue; // run break — no fence across the connector
      const ft = Math.hypot(b.x - a.x, b.y - a.y);
      if (ft > 0.05) out.push({ seg: i, ft });
    }
    return out;
  }

  /** Ledger ordinal ("Run 3") for a segment index, or null when it isn't one. */
  function runOrdinal(seg: number): number | null {
    const k = tracedSegments(mapPoints).findIndex(function (s) { return s.seg === seg; });
    return k >= 0 ? k + 1 : null;
  }

  /** One traced segment → one ledger run. Whole feet: the row's input is
   *  `step="1"` and the ticket rounds, so the number in the box is the number
   *  the estimate charges for. */
  function toRun(s: { seg: number; ft: number }): FenceRun {
    return { id: 'm' + s.seg, ft: Math.max(0, Math.round(s.ft)) };
  }

  function isPlaced(o: FenceOpening): boolean {
    return typeof o.seg === 'number' || (typeof o.x === 'number' && typeof o.y === 'number');
  }

  /** A ledger opening → the surface's GateSpec. The two share one vocabulary
   *  for the type ('single' … 'slatted' are both the OPENINGS ids and the
   *  surface's built-in variants), and the WIDTH comes from this page's rate
   *  card, because that is the width the ticket charges for. */
  function toGateSpec(o: FenceOpening): GateSpec {
    const t = opType(o.type);
    return {
      id: o.id,
      segmentIndex: typeof o.seg === 'number' ? o.seg : -1,
      t: typeof o.t === 'number' ? o.t : 0.5,
      widthFt: t.width,
      kind: (t.kind === 'door' ? 'door' : 'gate') as OpeningKind,
      variant: o.type,
      x: o.x,
      y: o.y,
    };
  }

  function mapProps(): FenceDrawMapProps {
    return {
      lat: mapOrigin?.lat,
      lng: mapOrigin?.lng,
      points: mapPoints,
      revision: mapRev,
      onChange: onTraceChange,
      className: 'map-live-in',
      gates: fs.openings.filter(isPlaced).map(toGateSpec),
      armed: armed,
      // The custom catalog belongs to the old studio's store; this page's types
      // are the fixed OPENINGS rate card, so there are none to offer.
      customOpenings: [],
      // Arming is the page's job — the Gate/Door popovers in `.stage-tools` do
      // it. The surface's own pickers are not rendered (chrome: false).
      onArm: function () {},
      onDropOpening: onDropOpening,
      onUpdateGate: onUpdateGate,
      onDisarm: function () { setArmed(null); },
      chrome: false,
      onApi: function (api) { mapApi = api; },
      accentColor: token('--blueprint'),
      doorColor: token('--muted'),
      parcel: parcelRing ? { ring: parcelRing, highlight: hoveredSidePath() } : null,
      parcelTiles: lotLines,
    };
  }

  function pushMap() { mapIsland?.update(mapProps()); }

  function setArmed(next: ArmedOpening | null) {
    armed = next;
    syncHint();
    pushMap();
  }

  /** `.stage-hint` is the page's instruction line; while a tool is armed or the
   *  outline is being aligned it says what THAT mode does, then returns to the
   *  donor's tracing copy. A transient note (a parcel result) outranks both. */
  let hintNote: string | null = null;
  function syncHint() {
    if (!hintEl) return;
    hintEl.textContent = hintNote
      ? hintNote
      : armed
        ? 'Placing a ' + opType(armed.variant).label.toLowerCase() +
          ' — click a fence line to snap it on, or open ground to drop it free · Esc to cancel'
        : aligning
          ? 'Drag the whole outline to line it up with the lot — shape and size stay locked'
          : hintIdle;
  }
  /** Say something sentence-length under the stage. A button label cannot carry
   *  "Regrid rejected the key — the token is likely expired", and swallowing it
   *  would leave a failure with no explanation anywhere on screen. */
  function sayHint(msg: string) {
    hintNote = msg;
    syncHint();
    after(function () {
      if (hintNote !== msg) return; // a newer note replaced it
      hintNote = null;
      syncHint();
    }, 6000);
  }

  /** Rebuild `#runsList` wholesale. Only for the moment the demo fixture is
   *  replaced by a real trace, and only there: a genuine re-list, so it plays
   *  the entrance cascade. */
  function relistRuns() {
    const list = $('#runsList');
    if (!list) return;
    list.innerHTML = fs.runs.map(runRowHtml).join('');
    staggerIn(Array.from(list.querySelectorAll<HTMLElement>('li')));
  }

  /** Patch `#runsList` to match `fs.runs` WITHOUT rebuilding it: surviving rows
   *  are re-labelled and re-valued in place, an added segment arrives as one
   *  row, a removed one leaves as one row. A rebuild here would replay the whole
   *  entrance cascade on every committed drag frame. */
  function syncRunRows() {
    const list = $('#runsList');
    if (!list) return;
    const rows = $$('#runsList [data-run]').filter(function (li) { return !li.dataset.leaving; });
    fs.runs.forEach(function (r, i) {
      const li = rows[i];
      if (!li) { appendRow(list, runRowHtml(r, i)); return; }
      li.dataset.run = r.id;
      const n = li.querySelector<HTMLElement>('.run-n');
      if (n) n.textContent = 'Run ' + (i + 1);
      const input = li.querySelector<HTMLInputElement>('[data-run-ft]');
      // Never overwrite the field the user is typing in.
      if (input && document.activeElement !== input) input.value = String(r.ft);
    });
    // The data is already correct; these rows only have to leave the DOM. The
    // commit still re-checks the empty line — erasing the last traced segment
    // is exactly when it has to come back.
    for (let i = fs.runs.length; i < rows.length; i++) leave(rows[i], syncRunsEmpty);
  }

  /** After the geometry changes an opening's segment can shift, split or vanish.
   *  Re-resolve the ordinal each row shows; an opening whose segment is gone
   *  keeps its price and becomes a free-standing opening, which is exactly what
   *  the row's "Free" label already means. */
  function reseatOpenings() {
    const segs = tracedSegments(mapPoints);
    fs.openings.forEach(function (o) {
      if (typeof o.seg !== 'number') return;
      const k = segs.findIndex(function (s) { return s.seg === o.seg; });
      if (k < 0) { o.seg = undefined; o.t = undefined; o.run = null; }
      else o.run = k + 1;
      const li = $('#openList [data-op="' + o.id + '"]');
      if (li) paintOpenRow(li, o);
    });
  }

  /** The surface committed a new path. This is the one place the trace becomes
   *  the ledger — and therefore the price. */
  function onTraceChange(pts: PathPoint[]) {
    mapPoints = pts;
    const segs = tracedSegments(pts);
    if (!mapOwnsRuns) {
      if (!segs.length) { pushMap(); return; }
      mapOwnsRuns = true;
      fs.runs = segs.map(toRun);
      relistRuns();
    } else {
      fs.runs = segs.map(toRun);
      syncRunRows();
    }
    reseatOpenings();
    renderFigures();
    pushMap();
    // The 3D scene reads the same `mapPoints`, so it follows the trace — and
    // mounts here if the user is already sitting on the 3D panel.
    syncStage();
  }

  /** Seed the surface AND the ledger from a path THIS module produced (the
   *  parcel ring). The revision bump is what re-seeds the polylines; from there
   *  it is an ordinary trace and the surface owns it again. */
  function applyTracedPath(pts: PathPoint[]) {
    mapRev += 1;
    onTraceChange(pts); // updates the ledger, then pushes the bumped revision
  }

  /** A click placed the armed opening: on a run when it landed close enough to
   *  magnet, otherwise free at the clicked spot. */
  function onDropOpening(segmentIndex: number, t: number, x?: number, y?: number) {
    const a = armed;
    if (!a) return;
    opSeq += 1;
    const attached = segmentIndex >= 0;
    const o: FenceOpening = {
      id: 'o' + opSeq,
      type: a.variant,
      run: attached ? runOrdinal(segmentIndex) : null,
      seg: attached ? segmentIndex : undefined,
      t: attached ? t : undefined,
      x: x,
      y: y,
    };
    fs.openings.push(o);
    appendRow($('#openList'), openRowHtml(o));
    syncOpenEmpty();
    renderFigures();
    setArmed(null);
  }

  /** A marker was dragged. POSITION ONLY: this page's rate card owns an
   *  opening's width (a Single gate is 4 ft at $350), so the surface's edge
   *  handles cannot resize it — a dragged width would disagree with the price
   *  on the row right next to it. */
  function onUpdateGate(id: string, patch: Partial<GateSpec>) {
    const o = fs.openings.find(function (x) { return x.id === id; });
    if (!o) return;
    if (typeof patch.segmentIndex === 'number') {
      const attached = patch.segmentIndex >= 0;
      o.seg = attached ? patch.segmentIndex : undefined;
      o.run = attached ? runOrdinal(patch.segmentIndex) : null;
    }
    if (typeof patch.t === 'number') o.t = patch.t;
    if ('x' in patch) o.x = patch.x;
    if ('y' in patch) o.y = patch.y;
    const li = $('#openList [data-op="' + o.id + '"]');
    if (li) paintOpenRow(li, o);
    renderFigures();
    pushMap();
  }

  /** Mount the surface into `#mapSlot`. Without a browser key nothing mounts and
   *  the donor's placeholder stands, which is still the honest state. */
  function mountMap() {
    if (!isMapsBrowserEnabled()) return;
    const slot = $('#mapSlot');
    if (!slot) return;
    // The island needs a node this module never writes to again. `.map-slot-in`
    // is the placeholder `showSite` fills, so the surface gets its OWN empty
    // sibling and the placeholder is taken out of the flow behind it.
    slot.querySelector<HTMLElement>('.map-slot-in')?.classList.add('is-hidden');
    const host = document.createElement('div');
    host.className = 'map-live';
    slot.appendChild(host);
    mapIsland = mountIsland(host, FenceDrawMap, mapProps());
    disposers.push(function () {
      mapIsland?.destroy();
      mapIsland = null;
      mapApi = null;
      // The host is this module's node, so this module takes it back out — and
      // the placeholder underneath returns, which is what an unmounted surface
      // honestly looks like. AFTER React's unmount: `destroy()` defers that to a
      // microtask, and microtasks run in order, so this one lands second.
      queueMicrotask(function () {
        host.remove();
        slot.querySelector<HTMLElement>('.map-slot-in')?.classList.remove('is-hidden');
      });
    });
  }

  // ================= 3D PREVIEW (React island, loaded on demand) =============
  // The "3D" switch used to swap one placeholder for another whose copy promised
  // a scene that "renders live from the ledger". Nothing rendered.
  //
  // It now mounts the studio's existing components/estimator/fence/FenceModel3D
  // — instanced posts / pickets / rails, gate leaves, chain-link infill and real
  // neighbouring buildings — driven by THE SAME `mapPoints` the ledger is
  // derived from. It is not a second source of truth: no geometry, no scene.
  //
  // Loaded with a dynamic import, so a visitor who never opens 3D never
  // downloads Three.js on a page whose primary job is a map.

  type ModelProps = Parameters<typeof FenceModel3D>[0];

  let modelIsland: Island<ModelProps> | null = null;
  let modelHost: HTMLElement | null = null;
  let modelLoading = false;
  let torndown = false;
  /** Real nearby footprints, in the same local-feet frame as the trace. Filled
   *  by "Load property lines"; the parcel lookup already returns them. */
  let siteBuildings: BuildingFootprint[] = [];

  // FenceModel3D re-applies its whole scene whenever a prop CHANGES IDENTITY, so
  // the gate array has to stay the same array until an opening actually moves.
  // Rebuilt from a signature rather than on every push: `renderFigures` runs on
  // each keystroke in a run-length box, and a fresh `[]` there would tear down
  // and rebuild the scene per character.
  let gatesSig = '';
  let gatesArr: GateSpec[] = [];
  function modelGates(): GateSpec[] {
    const placed = fs.openings.filter(isPlaced);
    const sig = placed
      .map(function (o) { return [o.id, o.type, o.seg, o.t, o.x, o.y].join(':'); })
      .join('|');
    if (sig !== gatesSig) {
      gatesSig = sig;
      gatesArr = placed.map(toGateSpec);
    }
    return gatesArr;
  }

  function modelProps(): ModelProps {
    return {
      points: mapPoints,
      height: fs.height,
      material: fs.material,
      // This page's swatch, so the 3D fence is the colour of the material chip
      // the user picked in the rail.
      materialColor: mat().color,
      gates: modelGates(),
      // No segment-selection UI on this page, so nothing is ever highlighted.
      selectedSegment: null,
      buildings: siteBuildings,
      active: fs.mode === '3d',
      className: 'model-live-in',
    };
  }

  function pushModel() {
    if (!modelIsland) return;
    modelIsland.update(modelProps());
  }

  /** Mount the scene, once, the first time it is both wanted and possible. */
  async function ensureModel() {
    if (modelIsland || modelLoading) return;
    const slot = $('#stage3d');
    if (!slot) return;
    modelLoading = true;
    try {
      const mod = await import("@/components/estimator/fence/FenceModel3D");
      // The page can be navigated away from while the chunk is in flight.
      if (torndown) return;
      const host = document.createElement('div');
      host.className = 'model-live';
      slot.appendChild(host);
      modelHost = host;
      modelIsland = mountIsland(host, mod.FenceModel3D, modelProps());
      // The scene is opaque and covers the slot, so the placeholder underneath
      // it goes. `unmountModel` puts it back.
      slot.querySelector<HTMLElement>('.map-slot-in')?.classList.add('is-hidden');
    } catch (err) {
      console.error('[fence-estimator] 3D preview failed to load:', err);
      sayHint('The 3D preview could not be loaded. The map, the ledger and the price are unaffected.');
    } finally {
      modelLoading = false;
    }
  }

  /** Take the scene back down and return the panel to its "nothing traced yet"
   *  copy. Cheaper than it looks: the dynamic import is memoised, so a remount
   *  after the next trace does not re-fetch Three.js.
   *
   *  Unmounting rather than hiding is deliberate — `.is-hidden` is
   *  `display: none`, and a WebGL canvas measured at 0×0 comes back wrong. */
  function unmountModel() {
    if (!modelIsland) return;
    modelIsland.destroy();
    modelIsland = null;
    const host = modelHost;
    modelHost = null;
    // AFTER React's unmount — `destroy()` defers that to a microtask, and
    // microtasks run in order, so this one lands second.
    if (host) queueMicrotask(function () { host.remove(); });
    $('#stage3d .map-slot-in')?.classList.remove('is-hidden');
  }

  /** Which stage panel is showing, and whether the scene should exist at all.
   *  Two points is the minimum that makes a fence: below that the panel keeps
   *  its "nothing traced yet" copy instead of showing an empty field, because a
   *  3D view of nothing is the kind of thing that reads as broken. */
  function syncStage() {
    const show3d = fs.mode === '3d';
    $('#mapSlot')?.classList.toggle('is-hidden', show3d);
    $('#stage3d')?.classList.toggle('is-hidden', !show3d);
    if (mapPoints.length < 2) unmountModel();
    else if (show3d) void ensureModel();
    pushModel();
  }

  /** The PNG the proposal carries. `FenceModel3D` builds its renderer with
   *  `preserveDrawingBuffer`, so its canvas can be read directly and this page
   *  does not need an imperative handle across the island boundary. Null until
   *  the user has opened the 3D view — the proposal simply goes without. */
  function captureModel(): string | null {
    const canvas = modelHost?.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  disposers.push(function () {
    // Set BEFORE the unmount: it is also what stops an in-flight `import()`
    // from mounting a scene into a page that has already gone.
    torndown = true;
    unmountModel();
  });

  // ================= ADDRESS SEARCH =================
  // Real Places suggestions on the studio's address bar. The browser key
  // (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) was already configured and already in
  // use by the React roof form; this field was plain text and ignored it. The
  // picked place is held here so the map layer can consume it once the Google
  // Maps surface is mounted in `#mapSlot`.
  let sitePlace: PickedPlace | null = null;

  const addrInput = root.querySelector<HTMLInputElement>('#addrInput');
  if (addrInput) {
    disposers.push(
      attachPlacesSuggest(addrInput, {
        onPick(p) {
          // Free typing reports `typed`; only a resolved place is a site.
          if (p.typed) return;
          sitePlace = p;
          showSite(p);
        },
      }),
    );
  }

  /** Moves the draw surface to the resolved address, and keeps the placeholder
   *  underneath it in step — that placeholder is the only feedback there is when
   *  no browser key is configured and no surface mounted. */
  function showSite(p: PickedPlace) {
    const t = $('.map-slot-in .ms-t');
    const h = $('.map-slot-in .ms-h');
    if (t) t.textContent = p.formatted || p.address;
    if (h) {
      h.textContent = [p.city, p.state, p.zip].filter(Boolean).join(", ") ||
        "Address resolved — trace the run on this layer.";
    }
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      // The local-feet frame is defined by this origin, so the surface rebuilds
      // its map on it (its own effect depends on lat/lng).
      mapOrigin = { lat: p.lat, lng: p.lng };
      pushMap();
      // The parcel lookup keys off the same point. Fired here — not from a
      // button — so the boundary and the sides list are already waiting by the
      // time the contractor looks down from the address field. Cache-first on
      // the server, so a repeat search costs no quota.
      void loadParcelForOrigin();
    }
  }

  /** The Find button: geocode the typed text directly. */
  async function geocodeTyped(btn: HTMLElement) {
    const q = (addrInput?.value || '').trim();
    if (!q || btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const old = btn.innerHTML;
    btn.innerHTML = '<svg class="ic"><use href="#i-search"/></svg>Finding…';
    try {
      const g = await loadMapsLibrary<{ Geocoder: new () => { geocode: (r: unknown) => Promise<{ results: GeoResult[] }> } }>("geocoding");
      const { results } = await new g.Geocoder().geocode({ address: q, region: 'us' });
      const r = results?.[0];
      if (r) {
        const formatted = String(r.formatted_address ?? q).replace(/,\s*USA$/, '');
        const loc = r.geometry?.location;
        sitePlace = {
          address: formatted.split(',')[0] || formatted,
          city: '', state: '', zip: '', formatted,
          // Without these the Find button would resolve an address the map
          // never moved to.
          lat: loc ? loc.lat() : undefined,
          lng: loc ? loc.lng() : undefined,
        };
        if (addrInput) addrInput.value = formatted;
        showSite(sitePlace);
        btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Found';
      } else {
        btn.innerHTML = '<svg class="ic"><use href="#i-search"/></svg>No match';
      }
    } catch (err) {
      console.error('[fence-estimator] geocode failed:', err);
      btn.innerHTML = '<svg class="ic"><use href="#i-search"/></svg>Lookup failed';
    }
    after(function () { btn.innerHTML = old; delete btn.dataset.busy; }, 1600);
  }

  // ================= PROPERTY LINES (ReportAll) =================
  // The parcel now comes from /api/parcels — ReportAll USA cadastral polygons
  // behind a permanent server-side cache (the account quota is ALLTIME, so a
  // repeat address costs nothing). The boundary is NOT dumped into the trace
  // any more: it renders as a display-only polygon overlay, and every side
  // becomes a checkbox row in `#parcelPanel`. The checked sides — the front is
  // unchecked by default — are what "Use N ft in estimate" seeds into the
  // trace/ledger through the ordinary `applyTracedPath` pipeline.
  //
  // Building footprints still come from the OLD `fetchPropertyBoundary` action
  // (Regrid may be dead, but its OSM half fails soft and still returns the
  // neighbourhood): they are the 3D view's spatial context, fetched in parallel
  // and never allowed to block or fail the parcel.

  interface ParcelApiHit {
    found: true;
    cached: boolean;
    parcel: {
      robustId: string;
      owner: string | null;
      address: string | null;
      acreage: number | null;
    };
    rings: RingPoint[][];
  }

  /** The ring that contains the origin, else the longest one — a MULTIPOLYGON
   *  parcel (a lot split by a road) returns several. */
  function pickRing(rings: RingPoint[][], o: { lat: number; lng: number }): RingPoint[] | null {
    let best: RingPoint[] | null = null;
    for (const r of rings) {
      if (r.length < 3) continue;
      if (pointInRing(o.lat, o.lng, r.map(function (p) { return { lat: p[0], lng: p[1] }; }))) return r;
      if (!best || r.length > best.length) best = r;
    }
    return best;
  }

  /** The side a contractor usually does NOT fence: the street-facing front.
   *  Heuristic — the side whose midpoint sits closest to the geocoded address
   *  point, which Google places at the rooftop/street side of the lot. Wrong
   *  sometimes; that is what the checkbox is for. */
  /** The surveyed vertices a listed side actually runs through — one listed
   *  side can span several segments, so the hover highlight is a PATH. */
  function sidePath(i: number): Array<{ lat: number; lng: number }> | null {
    const ring = parcelRingPts;
    const s = parcelSides[i];
    if (!ring || !s) return null;
    const out: Array<{ lat: number; lng: number }> = [];
    for (let k = 0; k <= s.span; k++) {
      const p = ring[(s.start + k) % ring.length];
      out.push({ lat: p[0], lng: p[1] });
    }
    return out;
  }

  function hoveredSidePath(): Array<{ lat: number; lng: number }> | null {
    return parcelHover === null ? null : sidePath(parcelHover);
  }

  function hideParcelPanel() {
    parcelRingPts = null;
    parcelRing = null;
    parcelSides = [];
    parcelChecked = [];
    parcelHover = null;
    $('#parcelPanel')?.classList.add('is-hidden');
  }

  async function loadParcelForOrigin() {
    const o = mapOrigin;
    if (!o || parcelBusy) return;
    parcelBusy = true;
    try {
      // ONE call, started first and awaited last: it carries the 3D view's
      // building footprints AND the OSM street centrelines the front-side
      // decision reads. Fail-soft on both counts.
      const osmPromise = fetchPropertyBoundary(o.lat, o.lng);
      osmPromise
        .then(function (res) {
          const ringPts = parcelRing
            ? parcelRing.map(function (ll) { return latLngToLocalFeet(o, ll); })
            : null;
          siteBuildings = buildingsToFootprints(res.buildings, o, ringPts);
          pushModel();
        })
        .catch(function () {});

      const res = await fetch(
        '/api/parcels?lat=' + encodeURIComponent(o.lat) + '&lon=' + encodeURIComponent(o.lng),
      );
      if (res.status === 404) {
        const body = (await res.json().catch(function () { return {}; })) as {
          nearest?: { address: string | null; city: string | null } | null;
        };
        hideParcelPanel();
        pushMap();
        const near = body.nearest?.address
          ? ' Nearest lot on record: ' + body.nearest.address +
            (body.nearest.city ? ', ' + body.nearest.city : '') + '.'
          : '';
        sayHint('Parcel not found at this point.' + near + ' Trace the fence manually on the map.');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(function () { return {}; })) as { error?: string };
        hideParcelPanel();
        pushMap();
        sayHint(body.error || 'Parcel lookup failed — trace the fence manually.');
        return;
      }
      const data = (await res.json()) as ParcelApiHit;
      const ring = pickRing(data.rings, o);
      if (!ring) {
        hideParcelPanel();
        pushMap();
        sayHint('Parcel geometry was empty — trace the fence manually.');
        return;
      }
      parcelRingPts = ring;
      parcelRing = ring.map(function (p) { return { lat: p[0], lng: p[1] }; });
      parcelSides = groupSides(ring);
      parcelChecked = parcelSides.map(function () { return true; });
      parcelHover = null;
      // The lot draws immediately; the sides list waits for the streets, which
      // are already in flight. Doing it the other way round would show a panel
      // whose checkboxes change under the contractor's cursor a second later.
      pushMap();

      // The street side comes off by default — a contractor does not fence the
      // frontage. A corner lot faces two streets and loses both.
      const osm = await osmPromise.catch(function () { return null; });
      const fronts = osm ? detectFrontSides(parcelSides, osm.roads) : [];
      fronts.forEach(function (f) { parcelChecked[f.index] = false; });
      renderParcelPanel(data, fronts);
      if (!fronts.length) {
        sayHint(
          osm && osm.roads.length
            ? 'No street runs close enough to call a frontage here — check the sides yourself before using the footage.'
            : 'Street data was unavailable, so no side was marked as frontage — uncheck the street side manually.',
        );
      }
    } catch (err) {
      console.error('[fence-estimator] parcel lookup failed:', err);
      sayHint('Parcel lookup failed — trace the fence manually.');
    } finally {
      parcelBusy = false;
    }
  }

  /** Indices of the stubs — real boundary, too small to be worth a row. */
  function shortSideIndices(): number[] {
    const out: number[] = [];
    parcelSides.forEach(function (s, i) { if (s.short) out.push(i); });
    return out;
  }

  /** Escape a value that came from OSM before it goes into innerHTML — a street
   *  name is third-party text, not a literal. */
  function esc(s: string): string {
    return s.replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }

  function renderParcelPanel(data: ParcelApiHit, fronts: FrontSideMatch[]) {
    const panel = $('#parcelPanel');
    const meta = $('#parcelMeta');
    const list = $('#parcelSides');
    if (!panel || !meta || !list) return;
    const bits: string[] = [];
    if (data.parcel.owner) bits.push(data.parcel.owner);
    if (typeof data.parcel.acreage === 'number') bits.push(data.parcel.acreage.toFixed(2) + ' ac');
    if (data.cached) bits.push('cached');
    meta.textContent = bits.join(' · ') || '—';

    const frontBy = new Map<number, FrontSideMatch>();
    fronts.forEach(function (f) { frontBy.set(f.index, f); });

    // Only the walls get rows, numbered as they read (1..N), not by their index
    // in the surveyed ring.
    let n = 0;
    let html = parcelSides
      .map(function (s, i) {
        if (s.short) return '';
        n += 1;
        const front = frontBy.get(i);
        // The street's own name is the contractor's confirmation that the right
        // side was dropped; the compass bearing is the fallback when OSM has no
        // name for it (common on service roads).
        const trailing = front && front.streetName
          ? '<span class="ps-street">' + esc(front.streetName) + '</span>'
          : '<span class="ps-dir">' + bearingLabel(s.bearing) + '</span>';
        return (
          '<li class="ps-row" data-side="' + i + '">' +
          '<label class="ps-label">' +
          '<input type="checkbox" data-side-check="' + i + '"' + (parcelChecked[i] ? ' checked' : '') + ' />' +
          '<span class="ps-name">Side ' + n + '</span>' +
          (front ? '<span class="ps-tag">street</span>' : '') +
          '<span class="ps-ft">' + Math.round(s.feet) + ' ft</span>' +
          trailing +
          '</label></li>'
        );
      })
      .join('');

    // The stubs, as ONE row. They stay in the geometry (dropping them would
    // open gaps at the corners they connect) and default to included.
    const shorts = shortSideIndices();
    if (shorts.length) {
      const ft = shorts.reduce(function (sum, i) { return sum + parcelSides[i].feet; }, 0);
      const on = shorts.every(function (i) { return parcelChecked[i]; });
      html +=
        '<li class="ps-row ps-row--short" data-side-short="1">' +
        '<label class="ps-label">' +
        '<input type="checkbox" data-side-short-check="1"' + (on ? ' checked' : '') + ' />' +
        '<span class="ps-name">+' + shorts.length + ' short segments</span>' +
        '<span class="ps-ft">' + Math.round(ft) + ' ft</span>' +
        '<span class="ps-dir">—</span>' +
        '</label></li>';
    }

    list.innerHTML = html;
    panel.classList.remove('is-hidden');
    staggerIn(Array.from(list.querySelectorAll<HTMLElement>('li')));
    updateParcelSum();
  }

  function checkedParcelFt(): number {
    return parcelSides.reduce(function (sum, s, i) {
      return sum + (parcelChecked[i] ? s.feet : 0);
    }, 0);
  }

  function updateParcelSum() {
    const lbl = $('#parcelUseLbl');
    const btn = $('#parcelUse') as HTMLButtonElement | null;
    const ft = Math.round(checkedParcelFt());
    if (lbl) lbl.textContent = 'Use ' + ft + ' ft in estimate';
    if (btn) btn.disabled = ft <= 0;
  }

  /** Checked sides → the trace. Consecutive checked sides share vertices, so
   *  they arrive as one polyline; an unchecked side between two checked ones
   *  becomes a run break (`gap` on the next group's first point) — the same
   *  encoding a hand-drawn multi-run trace uses. Wrap-around is honoured: side
   *  n-1 flowing into side 0 is one continuous run when both are checked. */
  function applyParcelSelection() {
    const o = mapOrigin;
    if (!o || !parcelSides.length) return;
    const n = parcelSides.length;
    if (!parcelChecked.some(Boolean)) return;

    // Group indices of maximal consecutive checked runs, in ring order.
    let groups: number[][] = [];
    let current: number[] = [];
    for (let i = 0; i < n; i++) {
      if (parcelChecked[i]) {
        current.push(i);
      } else if (current.length) {
        groups.push(current);
        current = [];
      }
    }
    if (current.length) groups.push(current);
    // Wrap: last group ends at n-1 AND first begins at 0 → one run (unless it
    // is the same group, i.e. every side is checked — a closed loop).
    if (
      groups.length > 1 &&
      groups[0][0] === 0 &&
      groups[groups.length - 1][groups[groups.length - 1].length - 1] === n - 1
    ) {
      groups = [groups.pop()!.concat(groups.shift()!)].concat(groups);
    }

    // One vertex per listed side — the merged wall's END POINTS, not every
    // surveyed kink between them. That is both what gets built (a fence runs
    // straight between its end posts) and what keeps the ledger legible: one
    // ledger run per row in the panel.
    const pts: PathPoint[] = [];
    groups.forEach(function (g, gi) {
      const start = parcelSides[g[0]].from;
      const startPt = latLngToLocalFeet(o, { lat: start[0], lng: start[1] });
      pts.push(gi === 0 ? startPt : { ...startPt, gap: true });
      g.forEach(function (i) {
        const to = parcelSides[i].to;
        pts.push(latLngToLocalFeet(o, { lat: to[0], lng: to[1] }));
      });
    });
    // NOTE: when every side is checked the last vertex coincides with the
    // first. It STAYS — that duplicate is what closes the loop and what makes
    // the final side exist. Popping it (as this did) silently dropped one whole
    // side of the lot from the estimate.
    applyTracedPath(pts);
    sayHint(
      'Fence seeded from ' + Math.round(checkedParcelFt()) +
      ' ft of property line — drag the dots to fine-tune, or add gates and doors.',
    );
  }

  // Panel wiring — delegated, registered once (the panel node is in the initial
  // markup; only its LIST is rebuilt per parcel).
  const parcelPanelEl = $('#parcelPanel');
  if (parcelPanelEl) {
    on(parcelPanelEl, 'change', function (e) {
      const el = e.target as HTMLElement;
      const box = el.closest<HTMLInputElement>('[data-side-check]');
      if (box) {
        parcelChecked[Number(box.dataset.sideCheck)] = box.checked;
        updateParcelSum();
        return;
      }
      // The stubs move together — they are one row, so they are one decision.
      const shortBox = el.closest<HTMLInputElement>('[data-side-short-check]');
      if (shortBox) {
        shortSideIndices().forEach(function (i) { parcelChecked[i] = shortBox.checked; });
        updateParcelSum();
      }
    });
    on(parcelPanelEl, 'click', function (e) {
      if ((e.target as HTMLElement).closest('#parcelUse')) applyParcelSelection();
    });
    on(parcelPanelEl, 'mouseover', function (e) {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-side]');
      const next = row ? Number(row.dataset.side) : null;
      if (next !== parcelHover) { parcelHover = next; pushMap(); }
    });
    on(parcelPanelEl, 'mouseleave', function () {
      if (parcelHover !== null) { parcelHover = null; pushMap(); }
    });
  }

  /** The old "Load property lines" button — now a manual retrigger of the same
   *  ReportAll flow (useful after a miss, or to re-open the sides panel). */
  async function loadParcel(btn: HTMLElement) {
    const say = (icon: string, label: string) => {
      btn.innerHTML = '<svg class="ic"><use href="#' + icon + '"/></svg>' + label;
    };
    const old = btn.innerHTML;
    btn.dataset.busy = '1';
    if (!mapIsland) {
      // No browser key → no surface to draw a parcel on. Checked FIRST: without
      // a key the address search cannot resolve either, so "search an address"
      // would send the user after something that can't happen.
      say('i-board', 'Map layer required');
    } else if (!mapOrigin) {
      // The parcel is looked up BY POINT: without a resolved address the only
      // point available is the surface's sample lot, which is someone else's.
      say('i-pin', 'Search an address');
      sayHint('Search the property address first — property lines are looked up from that point.');
    } else {
      say('i-board', 'Loading…');
      await loadParcelForOrigin();
      say(parcelRing ? 'i-check' : 'i-board', parcelRing ? 'Lines loaded' : 'No parcel data');
    }
    after(function () { btn.innerHTML = old; delete btn.dataset.busy; }, 1800);
  }

  // ================= CONVERT TO PROPOSAL =================
  // The last leg of the flow, and the only one that writes. It used to be a
  // 1.8-second "Proposal created" flash over a setTimeout — the button reported
  // a record that was never created.
  //
  // It now runs the SAME path the sage studio's Convert button runs:
  // `buildFenceLineItems` (components/estimator/fence/fencePricing) turns the
  // spec into `{name, quantity, unitPrice, unit}` rows in exactly the shape
  // `convertFenceEstimateToProposal`'s zod schema takes, and that action creates
  // the Proposal, its line items and its deposit/completion installments,
  // applying the org's markup and default tax on the server.
  //
  // WHAT MAKES THE NUMBERS AGREE. `buildFenceLineItems` takes the rate card as
  // an argument, so it is given THIS PAGE'S card (below) rather than the
  // library's defaults. The proposal's pre-markup subtotal is therefore the
  // ticket total to the cent, and editing fence-estimator-data.ts moves both.
  // (The org's hidden markup and tax are added on top by the server — that is
  // the app's designed behaviour, and it is why the proposal's grand total can
  // read higher than the ticket.)

  /** This page's rate card, in the shared pricing engine's shape. */
  function pageRateCard(): FencePricingConfig {
    const materialPerFt: Record<string, number> = {};
    MATERIALS.forEach(function (m) { materialPerFt[m.id] = m.base; });
    const openingPrice: FencePricingConfig['openingPrice'] = { gate: {}, door: {} };
    OPENINGS.forEach(function (o) {
      openingPrice[o.kind === 'door' ? 'door' : 'gate'][o.id] = o.price;
    });
    return { materialPerFt: materialPerFt, openingPrice: openingPrice, demolitionPerFt: DEMO_PER_FT };
  }

  /** `n gate(s)` / `n door(s)`, or nothing when there are none of that kind. */
  function countPhrase(n: number, word: string) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  async function convertToProposal(btn: HTMLElement) {
    const old = btn.innerHTML;
    const say = (icon: string, label: string) => {
      btn.innerHTML = '<svg class="ic"><use href="#' + icon + '"/></svg>' + label;
    };
    const restore = () => {
      after(function () { btn.innerHTML = old; delete btn.dataset.busy; }, 2200);
    };
    btn.dataset.busy = '1';

    const p = price();
    if (p.ft <= 0) {
      // No footage means no fence. The old fixture hid this case by always
      // having 222 ft on the books.
      say('i-file', 'Nothing to convert');
      sayHint('Trace the fence on the map, or add a run and type its length, before converting.');
      restore();
      return;
    }

    say('i-file', 'Creating…');
    try {
      const lengthFt = p.ft;
      const { materials, labor } = buildFenceLineItems(
        {
          lengthFt: lengthFt,
          height: fs.height,
          material: fs.material,
          openings: fs.openings.map(function (o) {
            const t = opType(o.type);
            return { kind: (t.kind === 'door' ? 'door' : 'gate') as OpeningKind, variant: o.type };
          }),
          demolition: fs.demo,
        },
        pageRateCard(),
        // Only the material label is overridden: leaving `opening` unset lets the
        // engine build "Single gate" from the variant, which is already this
        // page's own label for it. Passing OPENINGS' label would read "Single
        // gate gate".
        { material: mat().label },
      );

      const where = sitePlace ? (sitePlace.formatted || sitePlace.address) : '';
      const lf = Math.round(lengthFt);
      const gateN = fs.openings.filter(function (o) { return opType(o.type).kind === 'gate'; }).length;
      const doorN = fs.openings.length - gateN;
      const openingNote = [
        gateN > 0 ? countPhrase(gateN, 'gate') : '',
        doorN > 0 ? countPhrase(doorN, 'door') : '',
      ].filter(Boolean).join(', ');

      const res = await convertFenceEstimateToProposal({
        title: mat().label + ' fence · ' + lf + ' lf',
        scope: 'Supply and install ' + lf + ' linear ft of ' + mat().label.toLowerCase() +
          ' fence at ' + fs.height + ' ft tall' + (where ? ' at ' + where : '') + '.',
        materials: materials,
        labor: labor,
        assumptions: [
          mat().label + ' fence, ' + fs.height + ' ft tall',
          lf + ' linear ft across ' + countPhrase(fs.runs.length, 'run'),
          openingNote || 'No gates or doors',
          fs.demo
            ? 'Includes removal and haul-away of the existing fence'
            : 'No demolition included',
        ].concat(where ? ['Site: ' + where] : []),
        // The 3D scene renders with `preserveDrawingBuffer`, so its canvas can be
        // read straight off the island host — the same PNG the sage studio
        // attaches. Only present once the user has actually opened the 3D view.
        previewDataUrl: captureModel() ?? undefined,
      });

      // No `restore()`: the router is about to unmount this page, and the
      // teardown clears every pending timer anyway. The label stays on "created"
      // for the frame or two before the detail route paints.
      say('i-check', 'Proposal created');
      opts.navigate(PROPOSAL_ROUTE + res.id);
    } catch (err) {
      console.error('[fence-estimator] convert failed:', err);
      if (isPlanLimitError(err)) {
        // The upgrade dialog lives in the classic (dashboard) layout and is not
        // mounted on this route, so the limit has to be readable HERE or it is
        // silent.
        say('i-file', 'Plan limit');
        sayHint(PLAN_LIMIT_MESSAGE + ' — this organization is at its proposal cap for the period.');
      } else {
        say('i-file', "Couldn't convert");
        // The action's own message when it has a usable one. A production build
        // redacts thrown server errors into a paragraph about digests, so
        // anything that long is replaced rather than printed under the stage.
        const msg = err instanceof Error ? err.message.trim() : '';
        sayHint(msg && msg.length <= 160
          ? msg
          : 'The proposal could not be created. Try again, or check that this account is allowed to create proposals.');
      }
      restore();
    }
  }

  // ================= INITIALIZATION =================
  renderStudio();
  mountMap();

  // The matchMedia polyfill, mobile nav drawer and FLUID SCALE belong to the
  // persistent chrome and live in
  // components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // The row cascade's curve now lives in blueprint-shell/list-motion.

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: a slow scroll gets the full 420ms
    // animation, a fast one a shorter pass (down to 200ms) — never lagging,
    // still visible.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost)
      on(
        scrollHost,
        'scroll',
        () => {
          const now = performance.now();
          scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
          velLastY = scrollHost.scrollTop;
          velLastT = now;
        },
        { passive: true },
      );
    // The local <Sprite /> is skipped: it is a `.content` child only because the
    // port moved the donor's <body>-level sprite inside the mounted root, and it
    // is not one of the donor's four reveal blocks. Leaving it in would hand a
    // 0×0 `position: absolute` <svg> an `opacity: 0` it can never intersect its
    // way out of.
    const blocks = $$('.content > *').filter((el) => !(el instanceof SVGElement));
    blocks.forEach((el, i) => {
      el.classList.add('rv');
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = '1';
      el.style.transitionDelay = initial ? i * 60 + 'ms' : '200ms';
    });
    // The donor's second reveal layer targets `.kpi`, which this page does not
    // use — the layer was silently absent there too. Kept verbatim so it stays
    // absent here.
    const cells = $$('.kpi');
    cells.forEach((el, i) => {
      el.classList.add('rv-cell');
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = '1';
      el.style.transitionDelay = initial ? 160 + (i % 8) * 45 + 'ms' : '200ms';
    });
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target as HTMLElement;
          if (el.dataset.rvScroll) {
            // below the fold: duration follows the current scroll speed
            const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
            el.style.transitionDuration = dur + 'ms';
          }
          el.classList.add('rv-in');
          io.unobserve(el);
          el.addEventListener('transitionend', function te() {
            el.style.transitionDelay = '';
            el.style.transitionDuration = '';
            el.removeEventListener('transitionend', te);
          });
        });
      },
      { threshold: 0, rootMargin: '0px 0px 60px 0px' },
    );
    blocks.concat(cells).forEach((el) => io.observe(el));
    disposers.push(() => io.disconnect());

    // (Sidebar cascade lives in the shell — it plays once, on first load.)

    // Entrance cascade — first paint, plus Clear and Reset, which really do
    // re-list the studio. It used to hang off a MutationObserver on the runs and
    // materials lists, which is why adding a run, deleting a line or picking a
    // material replayed it. See blueprint-shell/list-motion for the reasoning.
    playStagger = () => {
      ['runsList', 'matList'].forEach((id) => {
        const list = $('#' + id);
        if (!list) return;
        staggerIn(Array.from(list.querySelectorAll<HTMLElement>('li')));
      });
    };
    playStagger();

    // Numeral count-up — the donor aims this at `.kpi-val`, a class this page
    // does not render (its headline figure is `.tk-total`, which the ticket
    // rewrites on every edit). Kept verbatim, therefore inert, exactly as in
    // the donor.
    $$('.kpi-val').forEach((el) => {
      const raw = (el.textContent || '').trim();
      const isMoney = raw.charAt(0) === '$';
      const target = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = (isMoney ? '$' : '') + Math.round(target * e).toLocaleString('en-US');
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects — delegated to `root` so nodes injected after init
    // (menu items, JS-rendered buttons, innerHTML re-renders) still press.
    function pressify(sel: string, cls: string) {
      on(root, 'click', (e) => {
        const el = (e.target as Element).closest<HTMLElement>(sel);
        if (!el || !root.contains(el)) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      });
      on(root, 'animationend', (e) => {
        const el = e.target as HTMLElement;
        if (el.matches && el.matches(sel)) el.classList.remove(cls);
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
    pressify('.btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open, .tool, .zoom-btn, .seg-btn, .vsw-btn, .fs-find, .tp-item, .row-x', 'pressed');
    pressify('.week-strip .day', 'day-pressed');

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    disposers.forEach((d) => d());
  };
}
