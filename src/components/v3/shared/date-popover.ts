// Blueprint date field — the shared month-grid popover.
//
// WHY THIS EXISTS
// A native `<input type="date">` opens an OS panel that CSS cannot reach: no
// border, no radius, no shadow, no type — nothing about it is ours. Five fields
// across three pages were still native (#jfStart / #jfEnd, #pjfStart / #pjfEnd,
// #annExpires), so five surfaces dropped out of the blueprint the moment the
// user asked for a date. Replacing the CONTROL is the only way to style the
// panel; this module is that replacement, written once for all three pages.
//
// RELATION TO THE CALENDAR PAGE
// calendar-blueprint's `.dtp` is the visual reference and this reproduces its
// grammar 1:1 (month head + 24px nav squares, 7-column grid, 26px mono day
// cells, today = blueprint ring, selected = ink fill, beige footer bar). It is
// NOT extracted from there, deliberately: `.dtp` is a date-TIME picker fused to
// `cal.form` — an all-day switch, a SNAP_MIN time column, a duration readout,
// an end that follows the start and clamps against it. None of that has meaning
// for a lone date field, and pulling it out would have meant either dragging the
// clock half into the shared module or gutting the calendar. What the two share
// is the design, not the state machine. The icon pairing is deliberately the
// calendar's own (DTP_ICON: start = i-clock, end = i-hourglass) so the two pages
// name the same thing the same way.
//
// THE INPUT IS THE STATE
// The field stays a real, focusable, typable `<input>` whose `.value` is the
// same "YYYY-MM-DD" string the native control produced, so every existing
// consumer keeps working untouched: jobs' parseDay/longDate/relLabel, projects'
// shortDate, announcements' preview, `form.reset()`, and the delegated
// input/change listeners announcements hangs off `.content`. This module holds
// no copy of the value — it reads the input on open and writes it on commit,
// firing bubbling `input` + `change` so those listeners see a user edit.
//
// WHERE THE PANEL LIVES
// `.mdl-box` is `overflow: hidden` and `.mdl-body` is `overflow-y: auto`, so a
// popover parented to the field would be clipped by the dialog. It is appended
// to the `.mdl` overlay instead — fixed, full-viewport, no overflow and no
// transform of its own — and positioned there in the overlay's own coordinates.
// The shell scales the whole page with CSS `zoom` (FLUID SCALE), so every
// measured rect is divided by that factor before it becomes a `left`/`top`;
// skipping this is the "context menu lands 200px off at 1440px" bug.
//
// The stylesheet is a PLAIN global sheet, not a page module: a module's `.bp`
// hash is per page, so one module cannot serve three pages, and
// blueprint-shell.tsx (where the page modules are registered) is reserved.
// Every rule is anchored under `.jf-blueprint .content`, exactly like
// calendar-global.css, and every class carries the `dpk-` prefix so it cannot
// collide with the calendar's `dtp-` set.

import "./date-popover.css";

/** One field to upgrade. */
export interface DateFieldSpec {
  /** Selector for the `<input>` inside the page root, e.g. `"#jfStart"`. */
  sel: string;
  /** Sprite symbol for the field's leading identity icon, e.g. `"i-clock"`. */
  icon: string;
  /** What the field is, for the trigger's and panel's accessible names. */
  label: string;
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
/** Gap between the field and the panel, in the page's own CSS px. */
const GAP = 7;
/** Must stay in step with the `.dpk-pop` transition in date-popover.css. */
const EXIT_MS = 160;

let popSeq = 0;

/* ── date arithmetic ──────────────────────────────────────────────── */

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/**
 * The wire format, built from LOCAL calendar fields. `toISOString()` would be
 * wrong here for the same reason `new Date("2026-07-30")` is wrong on the way
 * back in: it goes through UTC, and in every negative-offset timezone that
 * shifts the date by a day. jobs-behavior and projects-behavior parse this
 * string field by field for exactly that reason.
 */
export function toISODate(d: Date): string {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/** Inverse of `toISODate`. Returns null for anything that is not a real day. */
export function fromISODate(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day);
  // `new Date(2026, 1, 31)` silently rolls forward to March 3 — round-tripping
  // the fields is what rejects an impossible date instead of moving it.
  return d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day ? d : null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
/** Sunday-first, matching the calendar page's own grid. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const LONG_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const FULL_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/* ── environment ──────────────────────────────────────────────────── */

/**
 * The shell's FLUID SCALE zoom factor. Same read as blueprint-shell's
 * list-motion, which keeps that helper private — four lines is cheaper than
 * editing a reserved module to export it.
 */
function currentZoom(from: Element): number {
  const host = from.closest<HTMLElement>(".jf-blueprint") ?? document.documentElement;
  const z = parseFloat(getComputedStyle(host).zoom);
  return isFinite(z) && z > 0 ? z : 1;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── one field ────────────────────────────────────────────────────── */

interface Picker {
  close(silent?: boolean): void;
  destroy(): void;
}

function attach(input: HTMLInputElement, spec: DateFieldSpec, peers: Set<Picker>): Picker | null {
  const owner = input.parentElement;
  if (!owner) return null;

  /* --- the field itself ------------------------------------------- */
  // The page's own input class (.pinput / .af-in) is left in place, so the
  // field keeps that page's height, border and focus ring; the shared sheet
  // only adds the mono type and the room the two icons need.
  const wrap = document.createElement("div");
  wrap.className = "dpk";
  owner.insertBefore(wrap, input);
  wrap.appendChild(input);

  // Defensive: the markup already ships `type="text"`, but a native date input
  // handed to this module would otherwise keep its OS panel one click away.
  if (input.type !== "text") input.type = "text";
  input.classList.add("dpk-in");
  input.autocomplete = "off";
  input.maxLength = 10;
  input.spellcheck = false;
  // Deliberately NOT `inputMode="numeric"`: "2026-07-30" needs a hyphen, and a
  // numeric soft keyboard has none — the field would stop being typable on the
  // one class of device where the popover is hardest to hit precisely.
  if (!input.placeholder) input.placeholder = "YYYY-MM-DD";

  const lead = document.createElement("span");
  lead.className = "dpk-lead";
  lead.setAttribute("aria-hidden", "true");
  lead.innerHTML = '<svg class="ic"><use href="#' + esc(spec.icon) + '"/></svg>';
  wrap.insertBefore(lead, input);

  const popId = "dpkPop" + ++popSeq;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dpk-tgl";
  toggle.id = popId + "Tgl";
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", popId);
  toggle.setAttribute("aria-label", "Choose " + spec.label.toLowerCase() + " date");
  toggle.innerHTML = '<svg class="ic dpk-chev"><use href="#i-chev"/></svg>';
  wrap.appendChild(toggle);

  /* --- the panel --------------------------------------------------- */
  // `.mdl` is fixed, inset 0, no overflow and no transform, so an absolutely
  // positioned child of it escapes the dialog box's clipping without leaving
  // the token scope tokens are declared on (`.content`). `.sheet` is the same
  // shape on the calendar-style panels; the field wrapper is the last resort
  // and behaves like the calendar's own inline pop.
  const layer =
    input.closest<HTMLElement>(".mdl") ?? input.closest<HTMLElement>(".sheet") ?? wrap;

  const pop = document.createElement("div");
  pop.className = "dpk-pop";
  pop.id = popId;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", spec.label + " date");
  // Closed panels are display:none, not just transparent: jobs' and projects'
  // Tab traps collect `button, input, …` from the whole dialog and filter on
  // `offsetParent !== null`, which a merely invisible panel passes — six dead
  // tab stops per dialog.
  pop.style.display = "none";
  layer.appendChild(pop);

  let open = false;
  /** First of the month currently drawn. */
  let cursor = startOfMonth(new Date());
  /** The keyboard's day — also the single tab stop inside the grid. */
  let active = startOfDay(new Date());
  /** Set while this module writes the input, so its own event is not re-read. */
  let writing = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const live: Array<() => void> = [];

  function headHtml(): string {
    return (
      '<div class="dpk-head">' +
      '<button class="dpk-nav" type="button" data-dpk-nav="-1" aria-label="Previous month">' +
      '<svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<span class="dpk-month">' +
      esc(MONTH_YEAR.format(cursor)) +
      "</span>" +
      '<button class="dpk-nav" type="button" data-dpk-nav="1" aria-label="Next month">' +
      '<svg class="ic rot-r"><use href="#i-chev"/></svg></button>' +
      "</div>"
    );
  }

  function render(): void {
    const sel = fromISODate(input.value);
    const today = startOfDay(new Date());
    const gridStart = startOfWeek(cursor);
    let days = "";
    for (let i = 0; i < 42; i++) {
      const day = addDays(gridStart, i);
      const iso = toISODate(day);
      const isSel = !!sel && sameDay(day, sel);
      const cls =
        "dpk-day" +
        (day.getMonth() !== cursor.getMonth() ? " out" : "") +
        (sameDay(day, today) ? " today" : "") +
        (isSel ? " sel" : "");
      days +=
        '<button class="' +
        cls +
        '" type="button" tabindex="' +
        (sameDay(day, active) ? "0" : "-1") +
        '" data-dpk-day="' +
        iso +
        '" aria-label="' +
        esc(FULL_DAY.format(day)) +
        '"' +
        (isSel ? ' aria-current="date"' : "") +
        ">" +
        day.getDate() +
        "</button>";
    }
    pop.innerHTML =
      '<div class="dpk-cal">' +
      headHtml() +
      '<div class="dpk-dow">' +
      DOW.map(function (d) {
        return "<span>" + d + "</span>";
      }).join("") +
      "</div>" +
      '<div class="dpk-grid">' +
      days +
      "</div></div>" +
      '<div class="dpk-foot">' +
      '<span class="dpk-val">' +
      (sel ? esc(LONG_DAY.format(sel)) : "No date") +
      "</span>" +
      '<span class="dpk-acts">' +
      '<button class="dpk-act" type="button" data-dpk-today="1">Today</button>' +
      '<button class="dpk-act" type="button" data-dpk-clear="1">Clear</button>' +
      "</span></div>";
  }

  /** Put the panel under the field, in the layer's own (unzoomed) coordinates. */
  function place(): void {
    const z = currentZoom(wrap);
    const field = wrap.getBoundingClientRect();
    const host = layer.getBoundingClientRect();
    // Never narrower than the field it belongs to — the panel has to read as
    // that control opening, not as a menu that happens to be nearby — and never
    // wider than the overlay it sits in. Both bounds are set here rather than
    // in CSS because `vw` inside the shell's zoomed subtree does not describe
    // the layer the panel is actually clamped by.
    pop.style.maxWidth = Math.max(180, host.width / z - 8) + "px";
    pop.style.minWidth = field.width / z + "px";
    const box = pop.getBoundingClientRect();

    let left = (field.left - host.left) / z;
    let top = (field.bottom - host.top) / z + GAP;

    // Flip above the field when the month grid would run off the bottom of the
    // window — the dialog docks to the bottom edge under 860px, where "below"
    // is almost never where the room is.
    const below = window.innerHeight - field.bottom;
    const above = field.top;
    if (below < box.height + GAP * z && above > below) {
      top = (field.top - host.top) / z - box.height / z - GAP;
    }

    // Then keep the whole panel on screen. The bound is the WINDOW, not the
    // layer: `.mdl` happens to span the viewport, but the fallback layer is the
    // field itself and clamping to that would pin every panel over its own
    // field. Expressed as layer-local coordinates so it composes with the
    // offsets above.
    const minLeft = -host.left / z + 4;
    const maxLeft = (window.innerWidth - host.left) / z - box.width / z - 4;
    if (left > maxLeft) left = maxLeft;
    if (left < minLeft) left = minLeft;
    const minTop = -host.top / z + 4;
    const maxTop = (window.innerHeight - host.top) / z - box.height / z - 4;
    if (top > maxTop) top = maxTop;
    if (top < minTop) top = minTop;

    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function focusActive(): void {
    pop.querySelector<HTMLElement>('.dpk-day[tabindex="0"]')?.focus();
  }

  function moveActive(step: number): void {
    active = addDays(active, step);
    cursor = startOfMonth(active);
    render();
    place();
    focusActive();
  }

  function moveMonth(step: number, keepFocus: boolean): void {
    cursor = addMonths(cursor, step);
    // The keyboard's day follows the month it can actually see.
    const maxDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    active = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(active.getDate(), maxDay));
    render();
    place();
    if (keepFocus) focusActive();
  }

  /** Write through the input so every existing consumer sees a normal edit. */
  function commit(value: string): void {
    if (input.value === value) return;
    writing = true;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    writing = false;
  }

  function openPop(): void {
    if (open) return;
    peers.forEach(function (p) {
      if (p !== picker) p.close(true);
    });
    open = true;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    const sel = fromISODate(input.value);
    active = sel ?? startOfDay(new Date());
    cursor = startOfMonth(active);
    render();
    pop.style.display = "";
    // Without the reflow the browser never sees a change of state and the
    // panel arrives with no transition at all.
    void pop.offsetWidth;
    pop.classList.add("is-open");
    wrap.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    place();
    bindLive();
  }

  function closePop(silent?: boolean): void {
    if (!open) return;
    open = false;
    unbindLive();
    pop.classList.remove("is-open");
    wrap.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    const hide = function () {
      hideTimer = null;
      if (!open) pop.style.display = "none";
    };
    if (reducedMotion()) hide();
    else hideTimer = setTimeout(hide, EXIT_MS);
    if (!silent) input.focus();
  }

  /* --- listeners that only exist while the panel is open ----------- */
  function bindLive(): void {
    const key = function (e: Event) {
      onKey(e as KeyboardEvent);
    };
    const down = function (e: Event) {
      onOutside(e);
    };
    const move = function () {
      if (open) place();
    };
    // Capture, so Escape reaches this before the dialog's own document-level
    // Escape handler — closing the picker must not also close the dialog.
    document.addEventListener("keydown", key, true);
    // pointerdown rather than click: the panel has to be gone before whatever
    // was clicked reacts. Targets inside the field are skipped, otherwise the
    // toggle would close here and immediately reopen on its click.
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    live.push(function () {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
    });
  }
  function unbindLive(): void {
    live.splice(0).forEach(function (stop) {
      stop();
    });
  }

  function onOutside(e: Event): void {
    const t = e.target as Node | null;
    if (!t) return;
    if (pop.contains(t) || wrap.contains(t)) return;
    closePop(true);
  }

  function onKey(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      // The dialog's own Escape listener sits on `document` in the bubble
      // phase; stopping here is what keeps one Escape from closing both.
      e.stopPropagation();
      closePop();
      return;
    }
    const t = e.target as Node | null;
    if (!t || !pop.contains(t)) return;
    const step =
      e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
    if (step) {
      e.preventDefault();
      e.stopPropagation();
      moveActive(step);
      return;
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      e.stopPropagation();
      moveMonth(e.key === "PageUp" ? -1 : 1, true);
    }
  }

  /* --- listeners that live as long as the field -------------------- */
  const off: Array<() => void> = [];
  function bind(target: EventTarget, ev: string, fn: EventListener, opts?: AddEventListenerOptions) {
    target.addEventListener(ev, fn, opts);
    off.push(function () {
      target.removeEventListener(ev, fn, opts);
    });
  }

  bind(toggle, "click", function (e) {
    // Defensive: a caller that leaves this field inside a wrapping `<label>`
    // would otherwise have the label's activation behaviour drag focus back to
    // the input on every click of the trigger. (None of the three pages do —
    // announcements' Expires cell was converted to an explicit `htmlFor` label
    // precisely because a `<label>` may not wrap a second interactive control.)
    e.preventDefault();
    if (open) closePop();
    else {
      openPop();
      input.focus();
    }
  });

  bind(pop, "click", function (e) {
    const t = e.target as HTMLElement;
    const nav = t.closest<HTMLElement>("[data-dpk-nav]");
    if (nav) {
      moveMonth(Number(nav.dataset.dpkNav), false);
      return;
    }
    const day = t.closest<HTMLElement>("[data-dpk-day]");
    if (day) {
      commit(day.dataset.dpkDay || "");
      closePop();
      return;
    }
    if (t.closest("[data-dpk-today]")) {
      commit(toISODate(new Date()));
      closePop();
      return;
    }
    if (t.closest("[data-dpk-clear]")) {
      commit("");
      closePop();
    }
  });

  // Typing stays a first-class way to fill the field; the grid just follows.
  bind(input, "input", function () {
    if (writing || !open) return;
    const typed = fromISODate(input.value);
    if (!typed) return;
    active = typed;
    cursor = startOfMonth(typed);
    render();
    place();
  });

  // ArrowDown is the keyboard's way in — and, once the panel is up, the way
  // from the text field into the grid.
  bind(input, "keydown", function (e) {
    const ev = e as KeyboardEvent;
    if (ev.key !== "ArrowDown") return;
    ev.preventDefault();
    if (!open) openPop();
    focusActive();
  });

  // Tabbing out of the panel closes it — otherwise it stays over a dialog the
  // keyboard has already left.
  bind(document, "focusout", function (e) {
    if (!open) return;
    const next = (e as FocusEvent).relatedTarget as Node | null;
    if (!next) return;
    if (pop.contains(next) || wrap.contains(next)) return;
    closePop(true);
  });

  const picker: Picker = {
    close: closePop,
    destroy: function () {
      unbindLive();
      off.splice(0).forEach(function (fn) {
        fn();
      });
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      pop.remove();
      // Put the field back the way it was found. React normally drops the whole
      // `.content` subtree on navigation and none of this matters — but a
      // teardown that leaves the wrapper and the ready flag behind would make a
      // second init on a surviving field either skip it or nest a second
      // wrapper, and that is the kind of thing that only shows up much later.
      if (wrap.parentElement) {
        wrap.parentElement.insertBefore(input, wrap);
        wrap.remove();
      }
      input.classList.remove("dpk-in");
      input.removeAttribute("data-dpk-ready");
    },
  };
  return picker;
}

/* ── public entry point ───────────────────────────────────────────── */

/**
 * Upgrade every listed `<input>` inside `root` to the blueprint date field.
 * Missing selectors are skipped, so a page can list a field it only sometimes
 * renders.
 *
 * @returns the teardown to push onto the page's own disposer list.
 */
export function initDatePopovers(root: HTMLElement, fields: DateFieldSpec[]): () => void {
  const pickers = new Set<Picker>();
  fields.forEach(function (spec) {
    const input = root.querySelector<HTMLInputElement>(spec.sel);
    if (!input || input.dataset.dpkReady === "1") return;
    input.dataset.dpkReady = "1";
    const picker = attach(input, spec, pickers);
    if (picker) pickers.add(picker);
  });
  return function () {
    pickers.forEach(function (p) {
      p.destroy();
    });
    pickers.clear();
  };
}
