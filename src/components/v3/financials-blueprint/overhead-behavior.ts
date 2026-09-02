// Overhead tab — runtime behavior.
//
// Its own module rather than more lines in financials-behavior.ts: the two
// share nothing but the tab strip. This one owns a month cursor, eleven fixed
// inputs plus any custom lines, three dollars-or-percent toggles and one write;
// the financials module owns the chart, the gauge and three books.
//
// The whole month strip arrives from the server — twelve months of job money
// and every sheet the org has saved — so walking months is instant and only
// SAVING crosses the wire.

import { saveMonthlyOverhead } from "@/actions/overhead";
import {
  OVERHEAD_CUSTOM_MAX,
  OVERHEAD_FIXED,
  OVERHEAD_SCALING,
  emptyOverheadSheet,
  overheadTotals,
  type OverheadCustomLine,
  type OverheadMonth,
  type OverheadSheet,
} from "./financials-data";

export type OverheadOptions = {
  /** Oldest first, 12 of them — the same run the chart draws. */
  months: OverheadMonth[];
  /** Saved sheets keyed "YYYY-MM". A month with no entry is simply absent. */
  sheets: Record<string, OverheadSheet>;
  /** Fired after every recompute so the Overview strip's "After overhead"
   *  card tracks the sheet without a reload. */
  onTotals?: (t: {
    key: string;
    total: number;
    left: number;
    covered: boolean;
    empty: boolean;
  }) => void;
};

/** Server actions reject with a message written for the user. Show that text;
 *  fall back to a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** The most one line may hold — the server's own ceiling (actions/overhead.ts),
 *  applied here as well so a run-on keystroke cannot paint a 40-digit figure
 *  across the sheet before the server refuses it. A percent line tops out at
 *  the whole of revenue. */
const MAX_LINE = 100_000_000;
const MAX_PCT = 100;

/** How long after the last keystroke a month is written. Long enough to type
 *  "4200" as one figure, short enough that leaving the tab never loses it. */
const SAVE_AFTER_MS = 700;

/** Ids for custom lines. Not a database id — the row is stored as JSON, so
 *  this only has to be unique within one sheet. */
function lineId(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function initOverheadPanel(root: HTMLElement, opts: OverheadOptions): () => void {
  const found = root.querySelector<HTMLElement>('[data-panel="overhead"]');
  if (!found) return () => {};
  // Bound to a const so the null-narrowing survives into the closures below;
  // `found` itself stays a `HTMLElement | null` to TypeScript inside them.
  const panel: HTMLElement = found;

  const disposers: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, fn: EventListener) => {
    t.addEventListener(ev, fn);
    disposers.push(() => t.removeEventListener(ev, fn));
  };
  const $ = (sel: string) => panel.querySelector<HTMLElement>(sel);

  const months = opts.months.slice();
  if (!months.length) return () => {};

  // Local, mutable copies. Edits live here the moment they are typed, so
  // stepping to last month and back does not lose what was half-entered — and
  // a successful save replaces the copy with the server's own row.
  const sheets: Record<string, OverheadSheet> = {};
  for (const m of months) {
    const saved = opts.sheets[m.key];
    sheets[m.key] = saved
      ? { ...saved, custom: (saved.custom ?? []).map((c) => ({ ...c })) }
      : emptyOverheadSheet(m.year, m.month);
  }
  /** Months edited since their last save. Drives the "Unsaved" note. */
  const dirty = new Set<string>();

  // Opens on the newest month — the one being lived in, not the oldest on file.
  let idx = months.length - 1;

  // Autosave bookkeeping, per month key. A month is written SAVE_AFTER_MS
  // after its last edit; an edit that lands while its write is on the wire
  // marks it to go again as soon as that write returns, so the last keystroke
  // always wins and no two writes for one month overlap.
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();
  const again = new Set<string>();
  /** Months written during THIS visit — "Saved" is a receipt, not a state. */
  const everSaved = new Set<string>();

  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const esc = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const month = () => months[idx];
  const sheet = () => sheets[month().key];

  // ================= INPUT ROWS =================
  // Built once. Only their VALUES change afterwards, so typing never rebuilds
  // the field under the caret.
  function icon(id: string) {
    return '<svg class="ic oh-ic"><use href="#' + id + '"></use></svg>';
  }

  function fieldRow(key: string, label: string, ic: string, pctKey?: string) {
    return (
      '<label class="oh-row" data-row="' + key + '">' +
      icon(ic) +
      '<span class="oh-lbl">' + esc(label) + "</span>" +
      '<span class="oh-in">' +
      '<i class="oh-unit" data-unit="' + key + '">$</i>' +
      '<input class="pinput oh-input" type="number" min="0" max="' + MAX_LINE + '" step="1" inputmode="decimal" ' +
      'data-k="' + key + '" placeholder="0" aria-label="' + esc(label) + '">' +
      "</span>" +
      (pctKey
        ? '<span class="oh-tog" data-tog="' + pctKey + '">' +
          '<button type="button" class="oh-tog-b" data-pct="0">$</button>' +
          '<button type="button" class="oh-tog-b" data-pct="1">%</button>' +
          "</span>"
        : "") +
      "</label>"
    );
  }

  /** A custom line: the name is typed too, so the label is an input. */
  function customRow(c: OverheadCustomLine) {
    return (
      '<div class="oh-row oh-row--custom" data-cid="' + esc(c.id) + '">' +
      icon("i-tag") +
      '<input class="oh-name" type="text" maxlength="40" placeholder="Name this cost" ' +
      'data-cfield="label" value="' + esc(c.label) + '" aria-label="Custom cost name">' +
      '<span class="oh-in">' +
      '<i class="oh-unit">$</i>' +
      '<input class="pinput oh-input" type="number" min="0" max="' + MAX_LINE + '" step="1" inputmode="decimal" ' +
      'data-cfield="amount" placeholder="0" value="' + (c.amount ? esc(String(c.amount)) : "") + '" ' +
      'aria-label="Custom cost amount">' +
      "</span>" +
      '<button type="button" class="oh-x" data-remove aria-label="Remove line">' +
      icon("i-x") +
      "</button>" +
      "</div>"
    );
  }

  const fixedWrap = $("#ohFixed");
  const varWrap = $("#ohVar");
  const customWrap = $("#ohCustom");
  if (fixedWrap) {
    fixedWrap.innerHTML = OVERHEAD_FIXED.map((f) => fieldRow(f.key, f.label, f.icon)).join("");
  }
  if (varWrap) {
    varWrap.innerHTML = OVERHEAD_SCALING.map((f) =>
      fieldRow(f.key, f.label, f.icon, f.pctKey),
    ).join("");
  }

  /** Rebuilt only when the SET of custom lines changes (month step, add,
   *  remove) — never on a keystroke, so the caret stays where it is. */
  function paintCustom() {
    if (!customWrap) return;
    const lines = sheet().custom;
    customWrap.innerHTML = lines.map(customRow).join("");
    const add = $("#ohAddLine") as HTMLButtonElement | null;
    if (add) add.disabled = lines.length >= OVERHEAD_CUSTOM_MAX;
  }

  // ================= RENDER =================
  function paintInputs() {
    const s = sheet();
    panel.querySelectorAll<HTMLInputElement>(".oh-input[data-k]").forEach((input) => {
      const k = input.dataset.k as keyof OverheadSheet | undefined;
      if (!k) return;
      const v = Number(s[k] ?? 0);
      // Leave an untouched field EMPTY rather than printing a 0 the user has to
      // clear before typing. The placeholder already reads "0".
      const next = v ? String(v) : "";
      if (document.activeElement !== input && input.value !== next) input.value = next;
    });
    for (const f of OVERHEAD_SCALING) {
      const isPct = Boolean(s[f.pctKey]);
      const tog = panel.querySelector<HTMLElement>('[data-tog="' + f.pctKey + '"]');
      tog?.querySelectorAll<HTMLElement>(".oh-tog-b").forEach((b) => {
        b.classList.toggle("on", (b.dataset.pct === "1") === isPct);
      });
      const unit = panel.querySelector<HTMLElement>('[data-unit="' + f.key + '"]');
      if (unit) unit.textContent = isPct ? "%" : "$";
      const row = panel.querySelector<HTMLElement>('[data-row="' + f.key + '"]');
      row?.classList.toggle("is-pct", isPct);
    }
    paintCustom();
  }

  function paintTotals() {
    const m = month();
    const t = overheadTotals(sheet(), m);

    const setText = (sel: string, txt: string) => {
      const el = $(sel);
      if (el && el.textContent !== txt) el.textContent = txt;
    };

    setText("#ohMonth", m.label);
    setText("#ohFixedSum", money(t.fixed));
    setText("#ohVarSum", money(t.variable));
    setText("#ohSumFixed", money(t.fixed));
    setText("#ohSumVar", money(t.variable));
    setText("#ohTotal", money(t.total));

    // Coverage bar. The fill is the share of the bills the work paid; the tone
    // is the whole point of the page, so it is the loudest thing on it. An
    // EMPTY sheet is neither covered nor short — zero bills are "paid" only by
    // arithmetic — so it draws no fill and no tone at all.
    const fill = $("#ohFill");
    if (fill) {
      fill.style.width = t.empty ? "0%" : t.pct.toFixed(1) + "%";
      fill.classList.toggle("is-ok", t.covered && !t.empty);
    }
    const verdict = $("#ohVerdict");
    if (verdict) {
      verdict.classList.toggle("is-ok", t.covered && !t.empty);
      verdict.classList.toggle("is-empty", t.empty);
      verdict.innerHTML = t.empty
        ? "<b>Nothing entered</b><span>Fill the sheet</span>"
        : t.covered
          ? "<b>Overhead covered</b><span>" +
            (t.left > 0 ? money(t.left) + " is true profit" : "Broke even") +
            "</span>"
          : "<b>" + Math.round(t.pct) + "% covered</b><span>" + money(-t.left) + " short</span>";
    }

    const figs = $("#ohFigs");
    if (figs) {
      const cells: Array<[string, string, string]> = [
        ["Net from jobs", money(t.net), ""],
        ["Overhead", money(t.total), ""],
        // No tone on an empty sheet: a green $0 "true profit" is the same lie
        // as a green bar.
        [
          t.left >= 0 ? "True profit" : "Shortfall",
          money(Math.abs(t.left)),
          t.empty ? "" : t.left >= 0 ? "ok" : "bad",
        ],
      ];
      figs.innerHTML = cells
        .map(
          ([l, v, tone]) =>
            '<div class="oh-fig"><span class="oh-fig-l">' +
            l +
            '</span><b class="' +
            (tone ? "tone-" + tone : "") +
            '">' +
            v +
            "</b></div>",
        )
        .join("");
    }

    // The scope line is where the bar's arithmetic is spelled out, and it is
    // LIVE: the bar only moves when the work's net moves, so as the sheet is
    // typed this is what changes — the target the month has to clear.
    const scope = $("#ohScope");
    if (scope) {
      const inflow =
        m.revenue > 0
          ? money(m.revenue) + " in, " + money(m.expenses) + " job costs"
          : "No revenue booked this month";
      scope.textContent = t.empty ? inflow : inflow + " · needs " + money(t.total) + " net to cover";
    }

    // Month cursor ends.
    const prev = $("#ohPrev") as HTMLButtonElement | null;
    const next = $("#ohNext") as HTMLButtonElement | null;
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx >= months.length - 1;

    if (inFlight.has(m.key)) note("Saving…", "");
    else if (!dirty.has(m.key) && everSaved.has(m.key)) note("Saved", "ok");
    else if (!dirty.has(m.key)) note("", "");

    opts.onTotals?.({ key: m.key, total: t.total, left: t.left, covered: t.covered, empty: t.empty });
  }

  function note(txt: string, tone: "" | "warn" | "bad" | "ok") {
    const el = $("#ohNote");
    if (!el) return;
    el.textContent = txt;
    el.className = "oh-note" + (txt ? "" : " is-hidden") + (tone ? " is-" + tone : "");
  }

  function render() {
    paintInputs();
    paintTotals();
  }

  // ================= EVENTS =================
  /** Read a typed figure, clamped. When the clamp bites, the field is rewritten
   *  so what is shown is what is stored — the user sees the ceiling, not a
   *  figure the sheet silently ignored. */
  function readFigure(input: HTMLInputElement, max: number): number {
    const raw = Number(input.value);
    let v = Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (v > max) {
      v = max;
      input.value = String(max);
    }
    return v;
  }

  function touched() {
    const key = month().key;
    dirty.add(key);
    paintTotals();
    scheduleSave(key);
  }

  on(panel, "input", (e) => {
    const target = e.target as HTMLInputElement;

    // A custom line — name or amount.
    const crow = target.closest<HTMLElement>("[data-cid]");
    if (crow && target.dataset.cfield) {
      const line = sheet().custom.find((c) => c.id === crow.dataset.cid);
      if (!line) return;
      if (target.dataset.cfield === "label") line.label = target.value.slice(0, 40);
      else line.amount = readFigure(target, MAX_LINE);
      touched();
      return;
    }

    const input = target.closest<HTMLInputElement>(".oh-input[data-k]");
    if (!input || !input.dataset.k) return;
    const s = sheet();
    const row = input.closest<HTMLElement>(".oh-row");
    const isPct = Boolean(row?.classList.contains("is-pct"));
    (s as unknown as Record<string, number>)[input.dataset.k] = readFigure(
      input,
      isPct ? MAX_PCT : MAX_LINE,
    );
    touched();
  });

  on(panel, "click", (e) => {
    const el = e.target as Element;

    const tog = el.closest<HTMLElement>(".oh-tog-b");
    if (tog) {
      // The toggle sits inside a <label>, which would forward the click to the
      // input and steal focus mid-tap.
      e.preventDefault();
      const key = tog.closest<HTMLElement>(".oh-tog")?.dataset.tog;
      if (!key) return;
      const s = sheet() as unknown as Record<string, boolean | number>;
      const wantPct = tog.dataset.pct === "1";
      if (Boolean(s[key]) === wantPct) return;
      s[key] = wantPct;
      // 40000 dollars is not 40000 percent. Switching units clears the figure
      // rather than reading it as an absurdity in the other unit.
      const amountKey = OVERHEAD_SCALING.find((f) => f.pctKey === key)?.key;
      if (amountKey) s[amountKey] = 0;
      dirty.add(month().key);
      render();
      scheduleSave(month().key);
      return;
    }

    if (el.closest("#ohAddLine")) {
      const lines = sheet().custom;
      if (lines.length >= OVERHEAD_CUSTOM_MAX) return;
      const line: OverheadCustomLine = { id: lineId(), label: "", amount: 0 };
      lines.push(line);
      paintCustom();
      // Straight into the name — the click said "I have a cost to add". An
      // empty line is not worth a write; the first keystroke into it is.
      panel
        .querySelector<HTMLInputElement>('[data-cid="' + line.id + '"] .oh-name')
        ?.focus();
      paintTotals();
      return;
    }

    const rm = el.closest<HTMLElement>("[data-remove]");
    if (rm) {
      const cid = rm.closest<HTMLElement>("[data-cid]")?.dataset.cid;
      if (!cid) return;
      const s = sheet();
      s.custom = s.custom.filter((c) => c.id !== cid);
      paintCustom();
      touched();
      return;
    }

    const step = el.closest<HTMLElement>("#ohPrev, #ohNext");
    if (step) {
      // Leaving a month writes it now rather than in 700ms: the cursor is a
      // deliberate act, and a write that is due should not trail behind it.
      flush(month().key);
      idx = Math.max(0, Math.min(months.length - 1, idx + (step.id === "ohNext" ? 1 : -1)));
      render();
      return;
    }
  });

  // ================= AUTOSAVE =================
  function scheduleSave(key: string) {
    const t = saveTimers.get(key);
    if (t) clearTimeout(t);
    saveTimers.set(
      key,
      setTimeout(() => {
        saveTimers.delete(key);
        void save(key);
      }, SAVE_AFTER_MS),
    );
  }

  /** Write a month that has a pending timer immediately. */
  function flush(key: string) {
    const t = saveTimers.get(key);
    if (!t) return;
    clearTimeout(t);
    saveTimers.delete(key);
    void save(key);
  }

  async function save(key: string) {
    if (!dirty.has(key)) return;
    if (inFlight.has(key)) {
      again.add(key);
      return;
    }
    const s = sheets[key];
    inFlight.add(key);
    if (key === month().key) note("Saving…", "");
    try {
      const saved = await saveMonthlyOverhead({ ...s, year: s.year, month: s.month });
      // Only the SERVER'S shape replaces the local copy (dropped empty custom
      // lines, clamped percents) — and only if nothing was typed meanwhile.
      // If something was, the local copy is newer and goes out again next.
      if (!again.has(key)) {
        sheets[key] = { ...saved, custom: (saved.custom ?? []).map((c) => ({ ...c })) };
        dirty.delete(key);
        everSaved.add(key);
        if (key === month().key) render();
      }
    } catch (err) {
      if (key === month().key) note(actionError(err), "bad");
      // Left dirty: the next edit reschedules, and so does leaving the month.
      inFlight.delete(key);
      again.delete(key);
      return;
    }
    inFlight.delete(key);
    if (again.has(key)) {
      again.delete(key);
      void save(key);
    } else if (key === month().key) {
      note("Saved", "ok");
    }
  }

  // A hidden tab or a closing window fires no more keystrokes; whatever is
  // due goes out on its way to the background.
  on(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") for (const k of Array.from(saveTimers.keys())) flush(k);
  });

  render();

  return () => {
    for (const k of Array.from(saveTimers.keys())) flush(k);
    disposers.forEach((d) => d());
  };
}
