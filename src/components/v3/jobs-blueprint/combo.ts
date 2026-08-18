// A blueprint COMBOBOX on a plain <input> — the create dialog's client and
// proposal fields.
//
// WHY THIS EXISTS
//
// `blueprint-shell/places-suggest` already draws this list; it is bound to
// Google Places and cannot take a local array, so the SHAPE is reused rather
// than re-derived: the same `.bp-sug` markup and the same published CSS in
// dashboard-blueprint/blueprint-global.css, appended to <body> for the same
// two reasons (a `.mdl` is a stacking context with its own scroll, and FLUID
// SCALE zooms the shell root — a fixed popup positioned from a zoomed
// getBoundingClientRect must not ALSO be inside the zoomed subtree, or the
// scale lands twice).
//
// It is a combobox and not a <select> because the field has to accept a value
// that is NOT in the list: a client the contractor has not booked yet is typed,
// and the dialog creates them. The proposal field uses the same control with
// `strict: true` — free text there means "no proposal", since a Job.proposalId
// can only ever point at a row that exists.

export type ComboItem = {
  /** The value handed back on pick. */
  id: string;
  /** The line the field takes, and what a query matches against. */
  label: string;
  /** The quiet mono line under it — "Elena Diaz · Accepted · $12,400". */
  sub?: string;
  /** Sprite symbol id, without the `#`. */
  icon?: string;
};

export type ComboOptions = {
  /** The input the list hangs off. */
  input: HTMLInputElement;
  /** Optional caret button that opens the full list. */
  toggle?: HTMLElement | null;
  /** Sprite symbol for rows that carry no icon of their own. */
  icon?: string;
  /** Empty-list copy. */
  emptyText?: string;
  /**
   * Free text is not a value: the field clears itself when what is typed
   * matches nothing. Used by the proposal picker.
   */
  strict?: boolean;
  /** The book, read fresh on every open so a caller can grow it. */
  items: () => ComboItem[];
  /** Picked from the list. `null` when the field was cleared or free-typed. */
  onPick: (item: ComboItem | null) => void;
};

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let seq = 0;

/**
 * Attach the combobox. Returns a disposer that removes the list and every
 * listener — call it from the behavior module's `disposers`.
 */
export function attachCombo(opts: ComboOptions): () => void {
  const { input } = opts;
  const listId = "bp-combo-list-" + ++seq;
  const list = document.createElement("ul");
  list.className = "bp-sug";
  list.id = listId;
  list.setAttribute("role", "listbox");
  document.body.appendChild(list);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);
  input.setAttribute("autocomplete", "off");

  const offs: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, fn: EventListener, o?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn, o);
    offs.push(() => t.removeEventListener(ev, fn, o));
  };

  let shown: ComboItem[] = [];
  let cursor = -1;
  let open = false;
  /** The last row the user actually picked — free typing invalidates it. */
  let picked: ComboItem | null = null;

  function place() {
    // FLUID SCALE zooms the shell root. `getBoundingClientRect` is already in
    // zoomed (screen) pixels and the list lives on <body>, OUTSIDE the zoom, so
    // the rect is used as-is — no division here, unlike a popup that renders
    // inside the zoomed subtree (see openMenu in jobs-behavior).
    const r = input.getBoundingClientRect();
    const w = Math.max(200, r.width);
    list.style.width = w + "px";
    list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    // Flip above when the field sits low enough that the list would run off.
    const h = list.offsetHeight;
    const below = r.bottom + 5;
    list.style.top =
      below + h > window.innerHeight - 8 && r.top - h - 5 > 8
        ? r.top - h - 5 + "px"
        : below + "px";
  }

  function paint() {
    Array.from(list.querySelectorAll<HTMLElement>(".bp-sug-item")).forEach((el, i) => {
      el.classList.toggle("on", i === cursor);
      el.setAttribute("aria-selected", i === cursor ? "true" : "false");
    });
  }

  function render(query: string) {
    const q = query.trim().toLowerCase();
    const all = opts.items();
    shown = q
      ? all.filter(
          (it) =>
            it.label.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q),
        )
      : all;
    if (!shown.length) {
      // A state line, not a row: inert and quiet. Inline, because `.bp-sug`
      // lives on <body> and this page's stylesheet is scoped to `.content` —
      // publishing a global class for one empty state would be the drift
      // blueprint-global.css exists to prevent.
      list.innerHTML =
        '<li><span class="bp-sug-item" style="pointer-events:none;opacity:.55">' +
        '<span class="bp-sug-txt"><span class="bp-sug-main">' +
        esc(opts.emptyText || "No matches") +
        "</span></span></span></li>";
      cursor = -1;
      return;
    }
    list.innerHTML = shown
      .map(
        (it, i) =>
          '<li><button class="bp-sug-item" type="button" role="option" aria-selected="false" data-i="' +
          i +
          '"><svg class="bp-sug-ic" aria-hidden="true"><use href="#' +
          (it.icon || opts.icon || "i-user") +
          '"/></svg><span class="bp-sug-txt"><span class="bp-sug-main">' +
          esc(it.label) +
          "</span>" +
          (it.sub ? '<span class="bp-sug-sub">' + esc(it.sub) + "</span>" : "") +
          "</span></button></li>",
      )
      .join("");
    cursor = -1;
    paint();
  }

  function show(query: string) {
    render(query);
    list.classList.add("open");
    open = true;
    input.setAttribute("aria-expanded", "true");
    list.scrollTop = 0;
    place();
  }

  function hide() {
    if (!open) return;
    list.classList.remove("open");
    open = false;
    cursor = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function commit(item: ComboItem) {
    picked = item;
    input.value = item.label;
    hide();
    opts.onPick(item);
  }

  /** Leaving the field. Free text is either the value (loose) or nothing
   *  (strict); an exact label match is promoted to a real pick either way, so
   *  typing a client's full name is the same as clicking their row. */
  function settle() {
    const typed = input.value.trim();
    if (!typed) {
      picked = null;
      opts.onPick(null);
      return;
    }
    const exact = opts
      .items()
      .find((it) => it.label.toLowerCase() === typed.toLowerCase());
    if (exact) {
      picked = exact;
      input.value = exact.label;
      opts.onPick(exact);
      return;
    }
    if (opts.strict) {
      input.value = "";
      picked = null;
      opts.onPick(null);
      return;
    }
    picked = null;
    opts.onPick(null);
  }

  on(input, "focus", () => show(""));
  on(input, "input", () => {
    // Typing invalidates the pick — the caller's stored id has to drop with it,
    // or a proposal picked and then typed over would still be attached.
    // (`commit` writes `input.value` programmatically, which fires no `input`
    // event, so this cannot undo a pick it just made.)
    if (picked) opts.onPick(null);
    picked = null;
    show(input.value);
  });
  on(input, "keydown", (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (!open) {
        show(input.value);
        return;
      }
      if (!shown.length) return;
      ev.preventDefault();
      cursor =
        ev.key === "ArrowDown"
          ? (cursor + 1) % shown.length
          : (cursor - 1 + shown.length) % shown.length;
      paint();
      list.querySelectorAll<HTMLElement>(".bp-sug-item")[cursor]?.scrollIntoView({
        block: "nearest",
      });
      return;
    }
    if (ev.key === "Enter") {
      if (open && cursor >= 0 && shown[cursor]) {
        // Enter inside the list picks; it must not also submit the dialog.
        ev.preventDefault();
        commit(shown[cursor]);
      }
      return;
    }
    if (ev.key === "Escape" && open) {
      // Swallowed so the dialog behind the field stays open — Escape closes
      // the list first, the dialog on the second press.
      ev.preventDefault();
      ev.stopPropagation();
      hide();
    }
  });
  // `blur` would fire before the list's own click and swallow the pick, so the
  // outside-click check is what dismisses instead. `mousedown` on the list is
  // suppressed to keep focus in the field while a row is being clicked.
  on(list, "mousedown", (e) => e.preventDefault());
  on(list, "click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".bp-sug-item[data-i]");
    if (!btn) return;
    const it = shown[Number(btn.dataset.i)];
    if (it) {
      commit(it);
      input.focus();
    }
  });
  if (opts.toggle) {
    on(opts.toggle, "click", (e) => {
      e.preventDefault();
      if (open) hide();
      else {
        input.focus();
        show("");
      }
    });
  }
  on(document, "pointerdown", (e) => {
    const t = e.target as HTMLElement;
    if (t === input || list.contains(t) || (opts.toggle && opts.toggle.contains(t))) return;
    if (open) {
      hide();
      settle();
    }
  });
  on(window, "resize", () => (open ? place() : undefined), { passive: true } as AddEventListenerOptions);
  on(window, "scroll", () => (open ? place() : undefined), { passive: true, capture: true } as AddEventListenerOptions);

  return () => {
    offs.forEach((f) => f());
    list.remove();
  };
}

/** Programmatic reset — used when the dialog re-opens. */
export function resetCombo(input: HTMLInputElement | null) {
  if (input) input.value = "";
}
