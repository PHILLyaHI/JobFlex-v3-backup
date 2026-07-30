// Advanced AI (Smart Proposal) blueprint — runtime behaviors, ported verbatim
// from the donor file's <script> (jobflex-smart-proposal-blueprint_4.html).
// Every duration, easing, stagger, interval, formula and generated HTML string
// is the donor's exact value. Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor's chrome modules (matchMedia polyfill, mobile nav drawer, FLUID
//   SCALE, the sidebar entry cascade, the sliding active indicator and the
//   graph-paper parallax) are NOT ported here — the shared shell
//   (components/v3/blueprint-shell/shell-behavior.ts) already owns all of them;
// - the donor's `safe(name, fn)` try/catch wrapper is dropped: the modules it
//   guarded are either shell-owned or replaced by strict null checks below;
// - `undefined + string` concatenations the donor relies on are written as
//   `String(x) + …`, which produces the byte-identical result under TypeScript.

import { attachPlacesSuggest } from "@/components/v3/blueprint-shell/places-suggest";
import { PROJECT_TYPES, STATES, SAMPLES, SEED, STAGES, type Line } from "./advanced-ai-data";

type Snapshot = { materials: Line[]; labor: Line[]; scope: string };
type Delta = { kind: string; group: string; title: string; detail: string };
type Pending = { instructions: string; before: Snapshot; deltas: Delta[] };

export function initAdvancedAiContent(content: HTMLElement): () => void {
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const root = content;
  const main = content.closest<HTMLElement>(".main");
  const disposers: Array<() => void> = [];
  const on = (
    target: EventTarget,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  // Tracked timers — the "Really start over?" confirm window, the "Proposal
  // created" flash and the generation ticker all outlive a click, so an
  // unmount mid-flight must not fire them into a detached tree.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const intervals = new Set<ReturnType<typeof setInterval>>();
  disposers.push(() => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    intervals.forEach((id) => clearInterval(id));
    intervals.clear();
  });
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  /** The donor's `document.getElementById(id)`, scoped to the mounted root. */
  const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>("#" + id);

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

  // ================= SMART PROPOSAL: STATE =================
  // A per-mount COPY of every mutable field. `sp.materials` / `sp.labor` are
  // cloned out of SEED on generate, so the module-level fixture is never
  // written through.
  const sp: {
    step: string;
    type: string | null;
    locState: string;
    otherWork: string;
    busy: boolean;
    materials: Line[];
    labor: Line[];
    scope: string;
    assumptions: string[];
    margin: number;
    pending: Pending | null;
    undo: Snapshot | null;
    lineSeq: number;
    confirmReset: boolean;
  } = {
    step: "intake", type: null, locState: "", otherWork: "", busy: false,
    materials: [], labor: [], scope: "", assumptions: [],
    margin: 18, pending: null, undo: null, lineSeq: 100, confirmReset: false,
  };

  function money(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function lineTotal(l: Line) { return l.qty * l.price; }
  function sum(list: Line[]) { return list.reduce(function (a, l) { return a + lineTotal(l); }, 0); }
  function clone(list: Line[]): Line[] { return list.map(function (l) { return Object.assign({}, l); }); }

  // ================= INTAKE CONSOLE =================
  function renderIntake() {
    const ptypes = byId("ptypes");
    if (ptypes) {
      ptypes.innerHTML = PROJECT_TYPES.map(function (t) {
        return '<button class="ptype' + (sp.type === t.id ? ' on' : '') + '" type="button" data-type="' + t.id + '">' +
          '<svg class="ic"><use href="#' + t.icon + '"/></svg>' + t.label + '</button>';
      }).join('') + (sp.type === 'other'
        ? '<label class="other-field"><span class="est-lbl">What kind of work?</span>' +
          '<input class="est-in" id="otherWork" placeholder="Skylights, pergola, storm repair…" value="' +
          sp.otherWork.replace(/"/g, '&quot;') + '"></label>'
        : '');
    }
    const sel = byId<HTMLSelectElement>("locState");
    if (sel && !sel.options.length) {
      sel.innerHTML = '<option value="" selected>State…</option>' +
        STATES.map(function (st) { return '<option value="' + st[0] + '">' + st[0] + ' — ' + st[1] + '</option>'; }).join('');
    }
    const samples = byId("samples");
    if (samples) {
      samples.innerHTML = SAMPLES.map(function (x, i) {
        return '<button class="sample" type="button" data-sample="' + i + '">' + x + '</button>';
      }).join('');
    }
    syncGenerate();
  }
  function syncGenerate() {
    const briefEl = byId<HTMLTextAreaElement>("brief");
    const locTextEl = byId<HTMLInputElement>("locText");
    if (!briefEl || !locTextEl) return;
    const brief = briefEl.value.trim();
    const otherOk = sp.type !== 'other' || sp.otherWork.trim().length > 0;
    const ok = !!sp.type && otherOk && brief.length > 0 && !sp.busy;
    const genBtn = byId<HTMLButtonElement>("genBtn");
    if (genBtn) genBtn.disabled = !ok;
    $$(".est-step").forEach(function (st, i) {
      const done =
        (i === 0 && sp.type !== null && (sp.type !== 'other' || sp.otherWork.trim() !== '')) ||
        (i === 1 && locTextEl.value.trim() !== '') ||
        (i === 2 && brief !== '');
      st.classList.toggle('done', !!done);
    });
  }

  // ================= STUDIO =================
  function renderLines(which: string) {
    const list = which === 'materials' ? sp.materials : sp.labor;
    const body = byId(which === 'materials' ? 'matBody' : 'labBody');
    if (body) {
      body.innerHTML = list.map(function (l) {
        return '<tr data-line="' + l.id + '" data-grp="' + which + '">' +
          '<td><input class="li-in" data-f="name" value="' + l.name.replace(/"/g, '&quot;') + '">' +
            (l.link ? '<a class="li-link" href="#">Retail link<svg class="ic"><use href="#i-ext"/></svg></a>' : '') + '</td>' +
          '<td class="num"><input class="li-in num" data-f="qty" type="number" min="0" step="0.5" value="' + l.qty + '"></td>' +
          '<td><input class="li-in" data-f="unit" value="' + l.unit + '"></td>' +
          '<td class="num"><input class="li-in num" data-f="price" type="number" min="0" step="1" value="' + l.price + '"></td>' +
          '<td class="num"><span class="li-total">' + money(lineTotal(l)) + '</span></td>' +
          '<td class="num"><button class="icon-sq" type="button" data-del-line aria-label="Remove line"><svg class="ic"><use href="#i-trash"/></svg></button></td>' +
        '</tr>';
      }).join('');
    }
    const sumEl = byId(which === 'materials' ? 'matSum' : 'labSum');
    if (sumEl) sumEl.textContent = money(sum(list));
  }
  function renderTotals() {
    const mat = sum(sp.materials), lab = sum(sp.labor);
    const sub = mat + lab;
    const margin = sub * (sp.margin / 100);
    const totals = byId("totals");
    if (!totals) return;
    totals.innerHTML =
      '<div class="tot-row"><span>Materials</span><span>' + money(mat) + '</span></div>' +
      '<div class="tot-row"><span>Labor</span><span>' + money(lab) + '</span></div>' +
      '<div class="tot-row"><span>Subtotal</span><span>' + money(sub) + '</span></div>' +
      '<div class="tot-margin"><div class="tot-margin-row"><span class="kpi-lbl">Margin</span>' +
        '<input id="marginIn" type="number" min="0" max="60" step="1" value="' + sp.margin + '"></div>' +
        '<div class="tot-margin-row" style="margin-top:8px"><span class="diff-m">Added to the client price</span>' +
        '<span class="li-total">' + money(margin) + '</span></div></div>' +
      '<div class="tot-row grand"><span>Client price</span><span>' + money(sub + margin) + '</span></div>';
  }
  function renderAssumptions() {
    const assump = byId("assump");
    if (!assump) return;
    assump.innerHTML = sp.assumptions.map(function (a) {
      return '<li>' + a + '</li>';
    }).join('');
  }
  function renderRefine() {
    const card = byId("refineCard");
    if (!card) return;
    if (sp.pending) {
      card.innerHTML =
        '<div class="st-card-head"><span class="kpi-lbl">Review changes</span></div>' +
        '<div class="rf-pad">' +
          '<div class="rf-note">“' + sp.pending.instructions + '”</div>' +
          '<ul class="diff-list">' + sp.pending.deltas.map(function (d) {
            return '<li class="' + d.kind + '"><div class="diff-grp">' + d.group + '</div>' +
              '<div class="diff-t">' + d.title + '</div>' +
              '<div class="diff-m">' + d.detail + '</div></li>';
          }).join('') + '</ul>' +
          '<div class="rf-act">' +
            '<button class="btn btn-ghost btn--sm" type="button" data-act="discard">Discard</button>' +
            '<button class="btn btn-primary btn--sm" type="button" data-act="apply"><svg class="ic"><use href="#i-check"/></svg>Apply</button>' +
          '</div>' +
        '</div>';
      return;
    }
    card.innerHTML =
      '<div class="st-card-head"><span class="kpi-lbl">Refine</span></div>' +
      '<div class="rf-pad">' +
        '<div class="rf-note">Ask for a change in plain words — the estimate is re-priced and shown as a diff before anything is applied.</div>' +
        '<textarea class="rf-area" id="refineBox" placeholder="e.g. Use 30-year shingles instead of 25-year, drop the ridge vents, add a 10% discount…"></textarea>' +
        '<div class="rf-act"><button class="btn btn-primary btn--sm" type="button" data-act="refine"><svg class="ic"><use href="#i-bulb"/></svg>Apply changes</button></div>' +
      '</div>';
  }
  function renderStudio() {
    const briefEl = byId<HTMLTextAreaElement>("brief");
    const locTextEl = byId<HTMLInputElement>("locText");
    if (!briefEl || !locTextEl) return;
    const stTitle = byId("stTitle");
    if (stTitle) stTitle.textContent = briefEl.value.trim().split('\n')[0].slice(0, 90) || 'New estimate';
    const loc = locTextEl.value.trim();
    const found = PROJECT_TYPES.find(function (t) { return t.id === sp.type; });
    const typeLabel = sp.type === 'other' && sp.otherWork.trim()
      ? sp.otherWork.trim()
      : found
        ? found.label
        : undefined;
    const stKicker = byId("stKicker");
    if (stKicker) {
      stKicker.textContent = String(typeLabel) +
        (loc ? ' · ' + loc + (sp.locState ? ', ' + sp.locState : '') : '');
    }
    const scopeBox = byId<HTMLTextAreaElement>("scopeBox");
    if (scopeBox) scopeBox.value = sp.scope;
    renderLines('materials'); renderLines('labor');
    renderAssumptions(); renderTotals(); renderRefine();
    const undoBtn = byId<HTMLButtonElement>("undoBtn");
    if (undoBtn) undoBtn.disabled = !sp.undo;
  }
  function goStudio() {
    sp.step = 'studio';
    $$(".ppanel").forEach(function (p) { p.classList.toggle('is-hidden', p.dataset.panel !== 'studio'); });
    renderStudio();
  }
  function goIntake() {
    sp.step = 'intake';
    $$(".ppanel").forEach(function (p) { p.classList.toggle('is-hidden', p.dataset.panel !== 'intake'); });
  }

  // ================= GENERATION (narrated stage by stage) =================
  function generate() {
    if (sp.busy) return;
    sp.busy = true;
    const btn = byId<HTMLButtonElement>("genBtn");
    const status = byId("estStatus");
    const genLabel = byId("genLabel");
    if (!btn || !status || !genLabel) return;
    btn.disabled = true;
    status.classList.add('run');
    let i = 0;
    status.textContent = STAGES[0];
    genLabel.textContent = 'Working…';
    const tick = setInterval(function () {
      i += 1;
      if (i < STAGES.length) { status.textContent = STAGES[i]; return; }
      clearInterval(tick);
      intervals.delete(tick);
      sp.materials = clone(SEED.materials);
      sp.labor = clone(SEED.labor);
      sp.scope = SEED.scope;
      sp.assumptions = SEED.assumptions.slice();
      sp.undo = null;
      sp.busy = false;
      status.textContent = '';
      status.classList.remove('run');
      genLabel.textContent = 'Generate estimate';
      goStudio();
    }, 620);
    intervals.add(tick);
  }

  // refine: compute the real diff and wait for confirmation
  function refine(text: string) {
    const before: Snapshot = { materials: clone(sp.materials), labor: clone(sp.labor), scope: sp.scope };
    const deltas: Delta[] = [];
    const m1 = sp.materials.find(function (l) { return l.id === 'm1'; });
    if (m1) {
      deltas.push({ kind: 'chg', group: 'Materials', title: m1.name,
        detail: 'Unit price <s>' + money(m1.price) + '</s> → ' + money(Math.round(m1.price * 1.12)) });
    }
    const l3 = sp.labor.find(function (l) { return l.id === 'l3'; });
    if (l3) {
      deltas.push({ kind: 'chg', group: 'Labor', title: l3.name,
        detail: 'Unit price <s>' + money(l3.price) + '</s> → ' + money(l3.price + 8) });
    }
    deltas.push({ kind: 'add', group: 'Materials', title: 'Starter strip shingles',
      detail: '6 bundle × ' + money(38) + ' — added' });
    deltas.push({ kind: 'rem', group: 'Materials', title: 'Roofing nails, coil', detail: 'Rolled into labor — removed' });
    sp.pending = { instructions: text, before: before, deltas: deltas };
    renderRefine();
  }
  function applyPending() {
    sp.undo = { materials: clone(sp.materials), labor: clone(sp.labor), scope: sp.scope };
    const m1 = sp.materials.find(function (l) { return l.id === 'm1'; });
    if (m1) m1.price = Math.round(m1.price * 1.12);
    const l3 = sp.labor.find(function (l) { return l.id === 'l3'; });
    if (l3) l3.price = l3.price + 8;
    sp.lineSeq += 1;
    sp.materials.push({ id: 'm' + sp.lineSeq, name: 'Starter strip shingles', qty: 6, unit: 'bundle', price: 38, link: true });
    sp.materials = sp.materials.filter(function (l) { return l.id !== 'm6'; });
    sp.pending = null;
    renderStudio();
  }

  // ================= EVENTS =================
  on(document, "click", function (ev) {
    const src = ev.target instanceof Element ? ev.target : null;
    if (!src) return;
    const t = src.closest<HTMLElement>('[data-type]');
    if (t) { sp.type = t.dataset.type ?? null; renderIntake(); return; }
    const smp = src.closest<HTMLElement>('[data-sample]');
    if (smp) {
      const briefEl = byId<HTMLTextAreaElement>("brief");
      if (briefEl) briefEl.value = SAMPLES[Number(smp.dataset.sample)];
      if (!sp.type) sp.type = Number(smp.dataset.sample) === 1 ? 'fence' : Number(smp.dataset.sample) === 2 ? 'deck' : Number(smp.dataset.sample) === 3 ? 'gutters' : 'roof';
      renderIntake();
      return;
    }
    if (src.closest('#genBtn')) { generate(); return; }
    const add = src.closest<HTMLElement>('[data-add]');
    if (add) {
      sp.lineSeq += 1;
      const line: Line = { id: 'n' + sp.lineSeq, name: 'New line', qty: 1, unit: 'each', price: 0, link: false };
      if (add.dataset.add === 'materials') sp.materials.push(line); else sp.labor.push(line);
      renderLines(add.dataset.add ?? ''); renderTotals();
      return;
    }
    const del = src.closest<HTMLElement>('[data-del-line]');
    if (del) {
      const row = del.closest<HTMLElement>('[data-line]');
      if (!row) return;
      const grp = row.dataset.grp ?? '';
      if (grp === 'materials') sp.materials = sp.materials.filter(function (l) { return l.id !== row.dataset.line; });
      else sp.labor = sp.labor.filter(function (l) { return l.id !== row.dataset.line; });
      renderLines(grp); renderTotals();
      return;
    }
    const act = src.closest<HTMLElement>('[data-act]');
    if (act) {
      const kind = act.dataset.act;
      if (kind === 'refine') {
        const box = byId<HTMLTextAreaElement>("refineBox");
        if (!box) return;
        const text = box.value.trim();
        if (!text) { box.focus(); return; }
        refine(text);
        return;
      }
      if (kind === 'apply') { applyPending(); return; }
      if (kind === 'discard') { sp.pending = null; renderRefine(); return; }
    }
    if (src.closest('#undoBtn')) {
      if (!sp.undo) return;
      sp.materials = clone(sp.undo.materials);
      sp.labor = clone(sp.undo.labor);
      sp.scope = sp.undo.scope;
      sp.undo = null;
      renderStudio();
      return;
    }
    if (src.closest('#resetBtn')) {
      const btn = byId("resetBtn");
      if (!btn) return;
      if (!sp.confirmReset) {
        sp.confirmReset = true;
        btn.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>Really start over?';
        after(3000, function () {
          sp.confirmReset = false;
          btn.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>Start over';
        });
        return;
      }
      sp.confirmReset = false;
      sp.materials = []; sp.labor = []; sp.scope = ''; sp.assumptions = []; sp.pending = null; sp.undo = null;
      btn.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>Start over';
      goIntake();
      return;
    }
    const conv = src.closest<HTMLElement>('#convertBtn');
    if (conv && !conv.dataset.busy) {
      conv.dataset.busy = '1';
      const old = conv.innerHTML;
      conv.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>Proposal created';
      after(1800, function () { conv.innerHTML = old; delete conv.dataset.busy; });
    }
  });

  on(document, "input", function (ev) {
    const src = ev.target instanceof HTMLElement ? ev.target : null;
    if (!src) return;
    if (src.id === 'brief' || src.id === 'locText') { syncGenerate(); return; }
    if (src.id === 'otherWork') { sp.otherWork = (src as HTMLInputElement).value; syncGenerate(); return; }
    if (src.id === 'scopeBox') { sp.scope = (src as HTMLTextAreaElement).value; return; }
    if (src.id === 'marginIn') {
      sp.margin = Math.max(0, Math.min(60, Number((src as HTMLInputElement).value) || 0));
      renderTotals();
      const el = byId<HTMLInputElement>("marginIn");
      if (el) { el.focus(); el.value = String(sp.margin); }
      return;
    }
    const f = src.closest<HTMLInputElement>('[data-f]');
    if (f) {
      const row = f.closest<HTMLElement>('[data-line]');
      if (!row) return;
      const list = row.dataset.grp === 'materials' ? sp.materials : sp.labor;
      const line = list.find(function (l) { return l.id === row.dataset.line; });
      if (!line) return;
      const key = f.dataset.f;
      if (key === 'qty' || key === 'price') line[key] = parseFloat(f.value) || 0;
      else if (key === 'name' || key === 'unit') line[key] = f.value;
      const totalEl = row.querySelector<HTMLElement>('.li-total');
      if (totalEl) totalEl.textContent = money(lineTotal(line));
      const sumEl = byId(row.dataset.grp === 'materials' ? 'matSum' : 'labSum');
      if (sumEl) sumEl.textContent = money(sum(list));
      renderTotals();
    }
  });
  on(document, "change", function (ev) {
    const src = ev.target instanceof HTMLElement ? ev.target : null;
    if (!src) return;
    if (src.id === 'locState') { setLocState((src as HTMLSelectElement).value); }
  });

  // ================= LOCATION =================
  /** Keeps the state in `sp`, on the <select>, and on the `data-empty` flag the
   *  CSS reads to grey out an unpicked "State…" placeholder. */
  function setLocState(v: string) {
    sp.locState = v;
    const sel = byId<HTMLSelectElement>("locState");
    if (!sel) return;
    if (sel.value !== v) sel.value = v;
    sel.dataset.empty = v ? "0" : "1";
  }

  // Real Google Places suggestions on the location field. The browser key
  // (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) was already configured — this field
  // was a plain text input that never used it, so "regional pricing" relied on
  // the user typing a city correctly. Picking a suggestion now also fills the
  // State select, because the pick already knows the state.
  const locTextEl = byId<HTMLInputElement>("locText");
  if (locTextEl) {
    disposers.push(
      attachPlacesSuggest(locTextEl, {
        onPick(p) {
          if (!p.typed && p.state) setLocState(p.state);
          syncGenerate();
        },
      }),
    );
  }

  // ================= INITIALISATION =================
  renderIntake();

  // (FLUID SCALE lives in the shell — it owns <html> zoom and the eff-* classes.)

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: a slow scroll gets the full 420ms
    // animation, a fast one a shorter pass — never lagging, still visible.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost)
      on(
        scrollHost,
        "scroll",
        () => {
          const now = performance.now();
          scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
          velLastY = scrollHost.scrollTop;
          velLastT = now;
        },
        { passive: true },
      );
    const blocks = Array.from(root.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the donor's layer is silently empty. Kept
    // verbatim rather than re-pointed, so the arrival matches the donor file.
    const cells = $$(".kpi");
    cells.forEach((el, i) => {
      el.classList.add("rv-cell");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? 160 + (i % 8) * 45 + "ms" : "200ms";
    });
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          const target = en.target as HTMLElement;
          if (target.dataset.rvScroll) {
            // below the fold: duration follows the current scroll speed
            const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
            target.style.transitionDuration = dur + "ms";
          }
          target.classList.add("rv-in");
          io.unobserve(target);
          target.addEventListener("transitionend", function te() {
            target.style.transitionDelay = "";
            target.style.transitionDuration = "";
            target.removeEventListener("transitionend", te);
          });
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.concat(cells).forEach((el) => io.observe(el));
    disposers.push(() => io.disconnect());

    // (Sidebar cascade lives in the shell — it plays once, on first load.)

    // Row stagger on list (re)render
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".est-step, .assump li"));
      rows.forEach((r, i) => {
        r.style.opacity = "0";
        r.style.transform = "translateY(8px)";
        r.style.transition =
          "opacity 300ms " + EASE + " " + i * 45 + "ms, transform 300ms " + EASE + " " + i * 45 + "ms";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            r.style.opacity = "1";
            r.style.transform = "none";
          }),
        );
      });
    }
    ["matBody", "labBody", "assump"].forEach((id) => {
      const list = byId(id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up — Overview's `.kpi-val`. This page has none, so the
    // donor's loop is a no-op here; kept verbatim.
    $$(".kpi-val").forEach((el) => {
      const raw = (el.textContent || "").trim();
      const isMoney = raw.charAt(0) === "$";
      const target = parseInt(raw.replace(/[^0-9]/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = (isMoney ? "$" : "") + Math.round(target * e).toLocaleString("en-US");
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects
    function pressify(sel: string, cls: string) {
      $$(sel).forEach((el) => {
        el.addEventListener("click", () => {
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        });
        el.addEventListener("animationend", () => el.classList.remove(cls));
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
    pressify(
      ".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open",
      "pressed",
    );
    pressify(".week-strip .day", "day-pressed");

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
  };
}
