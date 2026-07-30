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
import {
  MATERIALS,
  HEIGHTS,
  OPENINGS,
  DEMO_PER_FT,
  type Material,
  type OpeningType,
} from "./fence-estimator-data";

/** The one field of a Geocoder result this page reads. */
type GeoResult = { formatted_address?: string };

type FenceRun = { id: string; ft: number };
type FenceOpening = { id: string; type: string; run: number | null };
type FenceState = {
  mode: string;
  material: string;
  height: number;
  demo: boolean;
  runs: FenceRun[];
  openings: FenceOpening[];
};

export function initFenceEstimatorContent(content: HTMLElement): () => void {
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
  // MATERIALS / HEIGHTS / OPENINGS / DEMO_PER_FT live in ./fence-estimator-data.
  // The sequence counters and the working fixture are per-mount, so revisiting
  // the page starts from the donor's opening state instead of inheriting runs
  // added during the previous visit.
  let runSeq = 9,
    opSeq = 1;
  const fs: FenceState = {
    mode: 'draw', material: 'composite', height: 6, demo: false,
    runs: [
      { id: 'r1', ft: 50 }, { id: 'r2', ft: 40 }, { id: 'r3', ft: 22 },
      { id: 'r4', ft: 16 }, { id: 'r5', ft: 17 }, { id: 'r6', ft: 14 },
      { id: 'r7', ft: 25 }, { id: 'r8', ft: 19 }, { id: 'r9', ft: 19 }
    ],
    openings: [{ id: 'o1', type: 'single', run: 1 }]
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
    tkTotal.textContent = money(p.total);
    tkSub.textContent = Math.round(p.ft) + ' lf · ' + money(p.perAll) + '/lf';
    const groups: Record<string, number> = {};
    fs.openings.forEach(function (o) {
      const t = opType(o.type);
      groups[t.label] = (groups[t.label] || 0) + 1;
    });
    let html = '<li><span>' + mat().label + ' · ' + fs.height + ' ft · ' + Math.round(p.ft) + ' lf</span><span>' + money(p.fence) + '</span></li>';
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
      '<select class="op-sel" data-op-type aria-label="Opening type">' + openOptionsHtml(o.type) + '</select>' +
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
  }
  function syncOpenEmpty() {
    $('#openEmpty')?.classList.toggle('is-hidden', fs.openings.length !== 0);
  }
  function renderLedger() {
    const runs = $('#runsList');
    const list = $('#openList');
    if (!runs || !list) return;
    renderStrip();
    runs.innerHTML = fs.runs.map(runRowHtml).join('');
    list.innerHTML = fs.openings.map(openRowHtml).join('');
    syncOpenEmpty();
  }
  function renderControls() {
    const matList = $('#matList');
    const heights = $('#heights');
    const demoTgl = $('#demoTgl');
    if (!matList || !heights || !demoTgl) return;
    matList.innerHTML = MATERIALS.map(function (m) {
      return '<li class="' + (fs.material === m.id ? 'on' : '') + '" data-mat="' + m.id + '">' +
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

  // ================= EVENTS =================
  on(document, 'click', function (e) {
    if (!(e.target instanceof Element)) return;
    const target = e.target;
    const md = target.closest<HTMLElement>('[data-mode]');
    if (md) {
      fs.mode = md.dataset.mode || '';
      $$('#modeSwitch .vsw-btn').forEach(function (b) { b.classList.toggle('active', b === md); });
      $('#mapSlot')?.classList.toggle('is-hidden', fs.mode === '3d');
      $('#stage3d')?.classList.toggle('is-hidden', fs.mode !== '3d');
      return;
    }
    // Material / height / demo change the PRICE, not the lists. Mark the picked
    // option in place and repaint the figures — rebuilding `#matList` here is
    // what made choosing a material re-cascade the whole material list.
    const m = target.closest<HTMLElement>('[data-mat]');
    if (m) {
      fs.material = m.dataset.mat || '';
      $$('#matList [data-mat]').forEach(function (li) { li.classList.toggle('on', li === m); });
      renderFigures();
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
      opSeq += 1;
      const o: FenceOpening = {
        id: 'o' + opSeq,
        type: addOpen.dataset.addOpen || '',
        run: fs.runs.length ? 1 : null,
      };
      fs.openings.push(o);
      closePops();
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
      if (kind === 'close-loop') {
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
        if (fs.runs.length <= 1) return;
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
      if (kind === 'clear') { fs.runs = []; fs.openings = []; renderStudio(); playStagger?.(); return; }
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
      fs.runs = [{ id: 'r1', ft: 50 }, { id: 'r2', ft: 40 }, { id: 'r3', ft: 22 }];
      fs.openings = [{ id: 'o1', type: 'single', run: 1 }];
      fs.demo = false;
      renderStudio();
      playStagger?.();
      return;
    }
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
      btn.dataset.busy = '1';
      const old = btn.innerHTML;
      btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Map layer required';
      after(function () { btn.innerHTML = old; delete btn.dataset.busy; }, 1600);
      return;
    }
    const conv = target.closest<HTMLElement>('#convertBtn');
    if (conv && !conv.dataset.busy) {
      conv.dataset.busy = '1';
      const old = conv.innerHTML;
      conv.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Proposal created';
      after(function () { conv.innerHTML = old; delete conv.dataset.busy; }, 1800);
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

  /** Confirms the resolved address on the map slot, which is where the traced
   *  run will render once the Maps surface itself is wired up. */
  function showSite(p: PickedPlace) {
    const t = $('.map-slot-in .ms-t');
    const h = $('.map-slot-in .ms-h');
    if (t) t.textContent = p.formatted || p.address;
    if (h) {
      h.textContent = [p.city, p.state, p.zip].filter(Boolean).join(", ") ||
        "Address resolved — trace the run on this layer.";
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
        sitePlace = {
          address: formatted.split(',')[0] || formatted,
          city: '', state: '', zip: '', formatted,
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

  // ================= INITIALIZATION =================
  renderStudio();

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

    // Press effects
    function pressify(sel: string, cls: string) {
      $$(sel).forEach((el) => {
        el.addEventListener('click', () => {
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        });
        el.addEventListener('animationend', () => el.classList.remove(cls));
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
    pressify('.btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open', 'pressed');
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
