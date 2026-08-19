// Blueprint select field — the shared option-list popover.
//
// WHY THIS EXISTS
// `.bp-sel` (dashboard-blueprint/blueprint-global.css) restyles the CLOSED
// select — border, chevron, type — but the open option list is still the OS
// menu, which no stylesheet can reach. Inside the blueprint dialogs that menu
// is the one surface left off-system. Replacing the control is the only way to
// style the panel; this module is that replacement, written the way
// date-popover.ts already replaced the native date panel for the same reason.
//
// THE SELECT IS THE STATE
// The native `<select>` stays in the DOM as the value holder — hidden, not
// removed — so every existing consumer keeps working untouched: `field.value`
// reads, `field.value = '0'` resets, `form.reset()`, and the delegated
// input/change listeners pages hang off `.content`. This module holds no copy
// of the value — it reads the select when the panel opens and writes through it
// on pick, firing bubbling `input` + `change` so those listeners see a user
// edit. A page that resets the select programmatically should follow with a
// bubbling `change` (announcements' openDialog does), and the trigger label
// follows automatically.
//
// WHERE THE PANEL LIVES
// Same constraint and same answer as date-popover: `.mdl-box` clips and
// `.mdl-body` scrolls, so the panel is appended to the `.mdl` overlay (or
// `.sheet`, or the field wrapper outside a dialog) and positioned in that
// layer's own coordinates, divided by the shell's FLUID SCALE zoom.
//
// The stylesheet is a plain global sheet anchored under `.jf-blueprint
// .content` with the `spk-` prefix — see date-popover.css's header for why a
// page module cannot serve a shared control.

import "./select-popover.css";

/** One field to upgrade. */
export interface SelectFieldSpec {
  /** Selector for the `<select>` inside the page root, e.g. `"#annPriority"`. */
  sel: string;
  /** What the field is, for the panel's accessible name. */
  label: string;
  /** Optional option-value → CSS color; drawn as a small square before the
   *  option's text, e.g. a priority's banner accent. */
  swatches?: Record<string, string>;
}

/** Gap between the field and the panel, in the page's own CSS px. */
const GAP = 7;
/** Must stay in step with the `.spk-pop` transition in select-popover.css. */
const EXIT_MS = 160;

let popSeq = 0;

/** The shell's FLUID SCALE zoom factor — same read as date-popover. */
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

interface Popover {
  close(silent?: boolean): void;
  destroy(): void;
}

function attach(select: HTMLSelectElement, spec: SelectFieldSpec, peers: Set<Popover>): Popover | null {
  const owner = select.parentElement; // the `.bp-sel` wrapper
  if (!owner) return null;

  /* --- the field itself ------------------------------------------- */
  // The select keeps its classes but leaves the page: the trigger button takes
  // its place INSIDE `.bp-sel`, and takes the select's own class list, so the
  // wrapper's drawn chevron and every page-local geometry rule (`.af
  // .bp-sel-in { height: 38px }`) land on the button unchanged.
  const prevDisplay = select.style.display;
  select.style.display = "none";
  select.setAttribute("aria-hidden", "true");
  const prevTabIndex = select.tabIndex;
  select.tabIndex = -1;

  const popId = "spkPop" + ++popSeq;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = select.className + " spk-btn";
  btn.id = popId + "Btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", popId);
  btn.setAttribute("aria-label", spec.label);
  btn.innerHTML = '<span class="spk-lbl"></span>';
  owner.insertBefore(btn, select);
  const lbl = btn.querySelector<HTMLElement>(".spk-lbl")!;

  function syncLabel(): void {
    const o = select.selectedOptions[0];
    lbl.textContent = o ? o.text : "";
  }
  syncLabel();

  /* --- the panel --------------------------------------------------- */
  const layer =
    select.closest<HTMLElement>(".mdl") ?? select.closest<HTMLElement>(".sheet") ?? owner;

  const pop = document.createElement("div");
  pop.className = "spk-pop";
  pop.id = popId;
  pop.setAttribute("role", "listbox");
  pop.setAttribute("aria-label", spec.label);
  // Closed panels are display:none, not just transparent — see date-popover on
  // the dialogs' `offsetParent !== null` tab-trap filter.
  pop.style.display = "none";
  layer.appendChild(pop);

  let open = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const live: Array<() => void> = [];

  function render(): void {
    pop.innerHTML = Array.from(select.options)
      .map(function (o) {
        const sel = o.value === select.value;
        const color = spec.swatches ? spec.swatches[o.value] : undefined;
        return (
          '<button class="spk-item' + (sel ? " sel" : "") + '" type="button" role="option"' +
          ' aria-selected="' + (sel ? "true" : "false") + '"' +
          ' data-spk-val="' + esc(o.value) + '">' +
          (color ? '<span class="spk-swatch" style="background:' + esc(color) + '"></span>' : "") +
          '<span class="spk-item-lbl">' + esc(o.text) + "</span>" +
          '<svg class="ic spk-check"><use href="#i-check"/></svg>' +
          "</button>"
        );
      })
      .join("");
  }

  /** Put the panel under the field, in the layer's own (unzoomed) coordinates. */
  function place(): void {
    const z = currentZoom(owner as HTMLElement);
    const field = btn.getBoundingClientRect();
    const host = layer.getBoundingClientRect();
    pop.style.maxWidth = Math.max(140, host.width / z - 8) + "px";
    pop.style.minWidth = field.width / z + "px";
    const box = pop.getBoundingClientRect();

    let left = (field.left - host.left) / z;
    let top = (field.bottom - host.top) / z + GAP;

    // Flip above the field when the list would run off the bottom of the window.
    const below = window.innerHeight - field.bottom;
    const above = field.top;
    if (below < box.height + GAP * z && above > below) {
      top = (field.top - host.top) / z - box.height / z - GAP;
    }

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

  function items(): HTMLElement[] {
    return Array.from(pop.querySelectorAll<HTMLElement>(".spk-item"));
  }

  function focusSelected(): void {
    (pop.querySelector<HTMLElement>(".spk-item.sel") ?? items()[0])?.focus();
  }

  /** Write through the select so every existing consumer sees a normal edit. */
  function commit(value: string): void {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncLabel();
  }

  function openPop(): void {
    if (open) return;
    peers.forEach(function (p) {
      if (p !== popover) p.close(true);
    });
    open = true;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    render();
    pop.style.display = "";
    void pop.offsetWidth;
    pop.classList.add("is-open");
    owner!.classList.add("spk-open");
    btn.setAttribute("aria-expanded", "true");
    place();
    bindLive();
  }

  function closePop(silent?: boolean): void {
    if (!open) return;
    open = false;
    unbindLive();
    pop.classList.remove("is-open");
    owner!.classList.remove("spk-open");
    btn.setAttribute("aria-expanded", "false");
    const hide = function () {
      hideTimer = null;
      if (!open) pop.style.display = "none";
    };
    if (reducedMotion()) hide();
    else hideTimer = setTimeout(hide, EXIT_MS);
    if (!silent) btn.focus();
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
    // Capture — Escape must close the panel, not the dialog under it.
    document.addEventListener("keydown", key, true);
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
    if (pop.contains(t) || btn.contains(t)) return;
    closePop(true);
  }

  function onKey(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePop();
      return;
    }
    if (e.key === "Tab") {
      closePop(true);
      return;
    }
    const t = e.target as Node | null;
    if (!t || !pop.contains(t)) return;
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === "ArrowDown" ? Math.min(list.length - 1, at + 1) : Math.max(0, at - 1);
      list[next]?.focus();
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      (e.key === "Home" ? list[0] : list[list.length - 1])?.focus();
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

  bind(btn, "click", function () {
    if (open) closePop();
    else {
      openPop();
      focusSelected();
    }
  });

  // ArrowDown on the closed trigger is the keyboard's way in, matching both the
  // native select and the date field beside it.
  bind(btn, "keydown", function (e) {
    const ev = e as KeyboardEvent;
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    if (!open) openPop();
    focusSelected();
  });

  bind(pop, "click", function (e) {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-spk-val]");
    if (!item) return;
    commit(item.dataset.spkVal || "");
    closePop();
  });

  // Programmatic resets (openDialog's `value = '0'` + change) and form.reset()
  // land here, so the trigger label never goes stale.
  bind(select, "change", syncLabel);

  bind(document, "focusout", function (e) {
    if (!open) return;
    const next = (e as FocusEvent).relatedTarget as Node | null;
    if (!next) return;
    if (pop.contains(next) || btn.contains(next)) return;
    closePop(true);
  });

  const popover: Popover = {
    close: closePop,
    destroy: function () {
      unbindLive();
      off.splice(0).forEach(function (fn) {
        fn();
      });
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      pop.remove();
      btn.remove();
      // Put the field back the way it was found — see date-popover on why a
      // teardown must leave no wrapper or ready flag behind.
      select.style.display = prevDisplay;
      select.removeAttribute("aria-hidden");
      select.tabIndex = prevTabIndex;
      select.removeAttribute("data-spk-ready");
    },
  };
  return popover;
}

/* ── public entry point ───────────────────────────────────────────── */

/**
 * Upgrade every listed `<select>` inside `root` to the blueprint option
 * popover. Missing selectors are skipped.
 *
 * @returns the teardown to push onto the page's own disposer list.
 */
export function initSelectPopovers(root: HTMLElement, fields: SelectFieldSpec[]): () => void {
  const popovers = new Set<Popover>();
  fields.forEach(function (spec) {
    const select = root.querySelector<HTMLSelectElement>(spec.sel);
    if (!select || select.dataset.spkReady === "1") return;
    select.dataset.spkReady = "1";
    const popover = attach(select, spec, popovers);
    if (popover) popovers.add(popover);
  });
  return function () {
    popovers.forEach(function (p) {
      p.destroy();
    });
    popovers.clear();
  };
}
