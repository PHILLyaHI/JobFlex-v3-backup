"use client";

// FOCUS CARD — the project and client pickers (route: /dashboard/manual-focus).
//
// Both are searchable popovers over a fixture list that can also CREATE a
// record inline. Inline, not in a dialog, for a reason specific to this
// variant: the page's whole argument is that you always know where you are
// because exactly one card is live. A modal layer would put a second thing on
// top of that one card and take the argument apart. So creating a client
// happens inside the card that asked for one, and the card is still the live
// card while you do it.
//
// The client field carries the live builder's three modes verbatim:
//   1. pick an existing client,
//   2. create one inline (name, email, phone, street, city, state, ZIP, tags),
//   3. type a PLAIN NAME for someone with no record at all — tagged honestly as
//      a one-off, with an escape back to the list.
// A chosen record prints its contact details, offers Edit, and shows the
// "No contact details on file." state when the record is thin. (The seeded
// fixture list contains exactly one such client so that state is one click
// away — see the header of ./manual-focus-data.ts.)
//
// FIXTURE-ONLY. `clients` and `projects` are component state owned by the
// content component; "creating" a record appends to that array and nothing
// else. No `@/actions/*`, no Prisma, no network.
//
// Modals in this repo are hand-rolled — no Radix — and these popovers follow
// the same in-house pattern: an absolutely positioned panel, outside-click and
// Escape to close, focus moved into the search field on open AND HANDED BACK to
// the control that opened it on close. Moving focus in without moving it back
// out is the WCAG 2.2 focus-transfer failure use-focus-column.ts exists to
// prevent one level up: the search input unmounts, focus falls to <body>, and a
// keyboard user has lost their place in a ten-card column.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientChoice, ClientRecord, ProjectRecord } from "./manual-focus-types";
import { newId } from "./manual-focus-math";
import { Field, Ic, IconBtn, LinkBtn, TextIn, cx } from "./focus-ui";
import styles from "./manual-focus.module.css";

/* ============================================================
   SHARED POPOVER PLUMBING
   ============================================================ */

/**
 * Close on an outside pointer-down or on Escape.
 *
 * `mousedown`, not `click`: a click fires after the pointer is released, and if
 * the press landed on a control that re-renders the tree the click's target is
 * gone by then and the popover never hears about it.
 */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return ref;
}

/**
 * Hand focus back to whatever opened the popover, after the close has painted.
 *
 * Returns [triggerRef, closePopover]. `triggerRef` goes on BOTH branches of a
 * picker's trigger — the "search" button when nothing is chosen, the chosen
 * row's "Change" button when something is — because only one of them is ever
 * mounted.
 *
 * The focus call is deliberately in an effect and not in the handler: picking an
 * option swaps the trigger button for the chosen-record row in the SAME render,
 * so a synchronous `focus()` would land on a node that is about to unmount and
 * drop the user on <body> regardless. The activeElement guard is for the
 * outside-mousedown path: if the press has already focused whatever it landed
 * on, that control keeps focus and this does nothing.
 */
function useTriggerRestore(open: boolean, setOpen: (next: boolean) => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const owed = useRef(false);

  const closePopover = useCallback(() => {
    owed.current = true;
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (open || !owed.current) return;
    owed.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) triggerRef.current?.focus();
  }, [open]);

  return [triggerRef, closePopover] as const;
}

/** Case-insensitive contains, over whatever fields a record wants searched. */
function matches(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f.toLowerCase().includes(q));
}

/** One line of "Austin, TX 78704" from whatever parts exist. */
export function cityLine(c: Pick<ClientRecord, "city" | "state" | "zip">): string {
  const left = [c.city, c.state].filter(Boolean).join(", ");
  return [left, c.zip].filter(Boolean).join(" ").trim();
}

/** The client's one-line postal address, or "" when the record is thin. */
export function fullAddress(c: ClientRecord): string {
  const tail = cityLine(c);
  return [c.address, tail].filter(Boolean).join(", ");
}

/* ============================================================
   PROJECT
   ============================================================ */

export function ProjectPicker({
  projects,
  projectId,
  onPick,
  onCreate,
}: {
  projects: ProjectRecord[];
  projectId: string;
  onPick: (id: string) => void;
  onCreate: (record: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** True once "Create project" has been pressed on an empty name. A control
   *  that silently does nothing is worse than one that refuses out loud. */
  const [nameError, setNameError] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const [triggerRef, closePopover] = useTriggerRestore(open, setOpen);

  const ref = useDismiss(open, closePopover);
  const chosen = projects.find((p) => p.id === projectId) ?? null;

  const list = useMemo(
    () => projects.filter((p) => matches(query, p.name, p.description)),
    [projects, query],
  );

  // The form REPLACES the trigger, so the caret has to be carried into it —
  // otherwise "New project" is one more control that drops focus on <body>.
  useEffect(() => {
    if (creating) nameRef.current?.focus();
  }, [creating]);

  function startCreate() {
    setOpen(false);
    setCreating(true);
    setName(query.trim());
    setDescription("");
    setNameError(false);
  }

  function commitCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      // Refuse VISIBLY, and put the caret where the fix is.
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    const record: ProjectRecord = { id: newId("pj"), name: trimmed, description: description.trim() };
    onCreate(record);
    onPick(record.id);
    setCreating(false);
    setNameError(false);
    setQuery("");
  }

  if (creating) {
    return (
      <div className={styles.miniForm}>
        <div className={styles.miniHead}>
          <Ic name="folder" />
          <span className={styles.miniTitle}>New project</span>
        </div>
        <div className={styles.stack}>
          <Field label="Project name" htmlFor="mc-pj-name">
            <TextIn
              id="mc-pj-name"
              inputRef={nameRef}
              value={name}
              onChange={(v) => {
                setName(v);
                if (nameError) setNameError(false);
              }}
              placeholder="Patel Residence — 2026 re-roof"
            />
            {nameError && (
              <span className={styles.needsName} role="alert">
                A name is required
              </span>
            )}
          </Field>
          <Field label="Description" optional htmlFor="mc-pj-desc">
            <TextIn
              id="mc-pj-desc"
              value={description}
              onChange={setDescription}
              placeholder="Full tear-off and re-roof, 24 squares"
            />
          </Field>
        </div>
        <div className={styles.miniActs}>
          <button type="button" className={styles.miniSave} onClick={commitCreate}>
            Create project
          </button>
          <LinkBtn onClick={() => setCreating(false)}>Cancel</LinkBtn>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pick} ref={ref}>
      {chosen ? (
        <div className={styles.chosen}>
          <span className={styles.chosenMark} aria-hidden="true">
            <Ic name="folder" />
          </span>
          <div className={styles.chosenBody}>
            <div className={styles.chosenName}>{chosen.name}</div>
            <div className={styles.chosenMeta}>
              {chosen.description || "No description on this project."}
            </div>
          </div>
          <div className={styles.chosenActs}>
            <IconBtn
              icon="search"
              label="Change project"
              onClick={() => setOpen(true)}
              buttonRef={triggerRef}
            />
            <IconBtn icon="x" label="Clear the project" onClick={() => onPick("")} />
          </div>
        </div>
      ) : (
        // The field's `<label>` is a plain span (it has no control to point at),
        // so the field NAME rides in here — and it keeps the visible text in
        // front of it, which is what WCAG 2.5.3 asks of a label in a name.
        <button
          type="button"
          className={styles.pickTrigger}
          ref={triggerRef}
          aria-label="Project · Search projects, or start a new one"
          onClick={() => setOpen(true)}
        >
          <Ic name="search" />
          <span>Search projects, or start a new one</span>
          <Ic name="chev" />
        </button>
      )}

      {open && (
        <div className={styles.pop}>
          <div className={styles.popBar}>
            <Ic name="search" />
            <input
              className={styles.popIn}
              value={query}
              autoFocus
              placeholder="Search projects"
              aria-label="Search projects"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className={styles.popList}>
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cx(styles.opt, p.id === projectId && styles.isActive)}
                onClick={() => {
                  onPick(p.id);
                  closePopover();
                  setQuery("");
                }}
              >
                <Ic name="folder" />
                <span className={styles.optBody}>
                  <span className={styles.optName}>{p.name}</span>
                  <span className={styles.optMeta}>{p.description || "No description"}</span>
                </span>
                {p.id === projectId && <Ic name="check" className={styles.optOn} />}
              </button>
            ))}
            {list.length === 0 && (
              <p className={styles.popEmpty}>
                No project matches “{query.trim()}”. Create it below.
              </p>
            )}
          </div>
          <div className={styles.popFoot}>
            <button type="button" className={styles.popFootBtn} onClick={startCreate}>
              <Ic name="plus" />
              New project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CLIENT — three modes
   ============================================================ */

/** A blank record to open the create form with. */
function blankClient(name: string): ClientRecord {
  return {
    id: newId("cl"),
    name,
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    tags: [],
  };
}

export function ClientPicker({
  clients,
  choice,
  onChange,
  onSaveClient,
}: {
  clients: ClientRecord[];
  choice: ClientChoice;
  onChange: (next: ClientChoice) => void;
  /**
   * Create-or-replace by id, and then select. ONE handler for create and edit,
   * and it also selects, because the caller has to see the record itself: the
   * chosen client's address auto-fills the job address and drives the tax
   * estimate, and a `clients` array that has only just been appended to is
   * still the previous one inside this component's closure.
   */
  onSaveClient: (record: ClientRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** null = not editing. Otherwise the record being created or edited. */
  const [form, setForm] = useState<ClientRecord | null>(null);
  const [isNew, setIsNew] = useState(false);
  /** True once the form has been submitted with an empty name. */
  const [nameError, setNameError] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const [triggerRef, closePopover] = useTriggerRestore(open, setOpen);

  const ref = useDismiss(open, closePopover);

  /** "Type as plain text" replaces the trigger with a text field rather than
   *  closing back onto it, so THAT is where focus is owed — same rule, the only
   *  path where the control to return to is not the one that opened. Guarded by
   *  a flag so arriving in free-text mode on first paint steals nothing. */
  const freeRef = useRef<HTMLInputElement>(null);
  const owedFreeFocus = useRef(false);
  const freeMode = choice.mode === "freeText";
  useEffect(() => {
    if (!freeMode || !owedFreeFocus.current) return;
    owedFreeFocus.current = false;
    freeRef.current?.focus();
  }, [freeMode]);

  const chosen =
    choice.mode === "record" ? (clients.find((c) => c.id === choice.id) ?? null) : null;

  const list = useMemo(
    () => clients.filter((c) => matches(query, c.name, c.email, c.city, c.state)),
    [clients, query],
  );

  // The form replaces the whole picker, so focus has to travel into it. Derived
  // into a boolean first: a computed expression in a dependency array cannot be
  // checked by the linter and is re-evaluated on every render anyway.
  const editing = form !== null;
  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  function startCreate() {
    setOpen(false);
    setIsNew(true);
    setNameError(false);
    setForm(blankClient(query.trim()));
  }

  function startEdit(record: ClientRecord) {
    setIsNew(false);
    setNameError(false);
    setForm({ ...record, tags: [...record.tags] });
  }

  function commitForm() {
    if (!form) return;
    const trimmed = form.name.trim();
    if (!trimmed) {
      // Refuse VISIBLY, and put the caret where the fix is.
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    const record: ClientRecord = { ...form, name: trimmed };
    onSaveClient(record);
    setForm(null);
    setNameError(false);
    setQuery("");
  }

  /* ── The inline create / edit form ──────────────────────── */
  if (form) {
    const patch = (p: Partial<ClientRecord>) => setForm((prev) => (prev ? { ...prev, ...p } : prev));
    return (
      <div className={styles.miniForm}>
        <div className={styles.miniHead}>
          <Ic name={isNew ? "userplus" : "pen"} />
          <span className={styles.miniTitle}>{isNew ? "New client" : "Edit client"}</span>
        </div>

        <div className={styles.stack}>
          <Field label="Name" htmlFor="mc-cl-name">
            <TextIn
              id="mc-cl-name"
              inputRef={nameRef}
              value={form.name}
              onChange={(v) => {
                patch({ name: v });
                if (nameError) setNameError(false);
              }}
              placeholder="Anjali Patel"
            />
            {nameError && (
              <span className={styles.needsName} role="alert">
                A name is required
              </span>
            )}
          </Field>

          <div className={styles.grid2}>
            <Field label="Email" optional htmlFor="mc-cl-email">
              <TextIn
                id="mc-cl-email"
                value={form.email}
                onChange={(v) => patch({ email: v })}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Phone" optional htmlFor="mc-cl-phone">
              <TextIn
                id="mc-cl-phone"
                value={form.phone}
                onChange={(v) => patch({ phone: v })}
                placeholder="(512) 555-0173"
              />
            </Field>
          </div>

          <Field label="Street address" optional htmlFor="mc-cl-street">
            <TextIn
              id="mc-cl-street"
              value={form.address}
              onChange={(v) => patch({ address: v })}
              placeholder="3411 Wild Cherry Dr"
            />
          </Field>

          <div className={styles.grid3}>
            <Field label="City" optional htmlFor="mc-cl-city">
              <TextIn id="mc-cl-city" value={form.city} onChange={(v) => patch({ city: v })} placeholder="Austin" />
            </Field>
            <Field label="State" optional htmlFor="mc-cl-state">
              <TextIn id="mc-cl-state" value={form.state} onChange={(v) => patch({ state: v })} placeholder="TX" />
            </Field>
            <Field label="ZIP" optional htmlFor="mc-cl-zip">
              <TextIn id="mc-cl-zip" value={form.zip} onChange={(v) => patch({ zip: v })} placeholder="78704" />
            </Field>
          </div>

          <Field
            label="Tags"
            optional
            htmlFor="mc-cl-tags"
            hint="Comma-separated — VIP, Repeat, Net 30."
          >
            <TextIn
              id="mc-cl-tags"
              value={form.tags.join(", ")}
              onChange={(v) =>
                patch({
                  tags: v
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="VIP"
            />
          </Field>
        </div>

        <div className={styles.miniActs}>
          <button type="button" className={styles.miniSave} onClick={commitForm}>
            {isNew ? "Create client" : "Save client"}
          </button>
          <LinkBtn onClick={() => setForm(null)}>Cancel</LinkBtn>
        </div>
      </div>
    );
  }

  /* ── Mode 3: a plain name typed onto the sheet ───────────── */
  if (choice.mode === "freeText") {
    return (
      <div className={styles.stack}>
        <TextIn
          inputRef={freeRef}
          value={choice.name}
          onChange={(v) => onChange({ mode: "freeText", name: v })}
          placeholder="Type the client's name"
          ariaLabel="Client name, typed as plain text"
        />
        <div className={styles.oneOffRow}>
          <span className={styles.oneOff}>One-off name · no client record</span>
          <LinkBtn icon="undo" onClick={() => onChange({ mode: "none" })}>
            Back to the client list
          </LinkBtn>
        </div>
      </div>
    );
  }

  /* ── Modes 1 and 2 ──────────────────────────────────────── */
  return (
    <div className={styles.pick} ref={ref}>
      {chosen ? (
        <div className={styles.chosen}>
          <span className={styles.chosenMark} aria-hidden="true">
            <Ic name="user" />
          </span>
          <div className={styles.chosenBody}>
            <div className={styles.chosenName}>{chosen.name}</div>
            {chosen.email || chosen.phone || fullAddress(chosen) ? (
              <div className={styles.chosenMeta}>
                {[chosen.email, chosen.phone].filter(Boolean).join("  ·  ")}
                {(chosen.email || chosen.phone) && fullAddress(chosen) && <br />}
                {fullAddress(chosen)}
              </div>
            ) : (
              <div className={cx(styles.chosenMeta, styles.isThin)}>
                No contact details on file.
              </div>
            )}
            {chosen.tags.length > 0 && (
              <div className={styles.tagRow}>
                {chosen.tags.map((t) => (
                  <span className={styles.tag} key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={styles.chosenActs}>
            <IconBtn icon="pen" label="Edit this client" onClick={() => startEdit(chosen)} />
            <IconBtn
              icon="search"
              label="Change client"
              onClick={() => setOpen(true)}
              buttonRef={triggerRef}
            />
            <IconBtn icon="x" label="Clear the client" onClick={() => onChange({ mode: "none" })} />
          </div>
        </div>
      ) : (
        // The field's `<label>` is a plain span (it has no control to point at),
        // so the field NAME rides in here, in front of the visible text.
        <button
          type="button"
          className={styles.pickTrigger}
          ref={triggerRef}
          aria-label="Client · Search clients, add one, or type a plain name"
          onClick={() => setOpen(true)}
        >
          <Ic name="search" />
          <span>Search clients, add one, or type a plain name</span>
          <Ic name="chev" />
        </button>
      )}

      {open && (
        <div className={styles.pop}>
          <div className={styles.popBar}>
            <Ic name="search" />
            <input
              className={styles.popIn}
              value={query}
              autoFocus
              placeholder="Search by name, email or city"
              aria-label="Search clients"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className={styles.popList}>
            {list.map((c) => {
              const active = choice.mode === "record" && choice.id === c.id;
              const meta = [c.email || c.phone, cityLine(c)].filter(Boolean).join("  ·  ");
              return (
                <button
                  key={c.id}
                  type="button"
                  className={cx(styles.opt, active && styles.isActive)}
                  onClick={() => {
                    onChange({ mode: "record", id: c.id });
                    closePopover();
                    setQuery("");
                  }}
                >
                  <Ic name="user" />
                  <span className={styles.optBody}>
                    <span className={styles.optName}>{c.name}</span>
                    <span className={styles.optMeta}>{meta || "No contact details on file"}</span>
                  </span>
                  {active && <Ic name="check" className={styles.optOn} />}
                </button>
              );
            })}
            {list.length === 0 && (
              <p className={styles.popEmpty}>
                No client matches “{query.trim()}”. Add them, or use a plain name.
              </p>
            )}
          </div>

          <div className={styles.popFoot}>
            <button type="button" className={styles.popFootBtn} onClick={startCreate}>
              <Ic name="userplus" />
              New client
            </button>
            <button
              type="button"
              className={styles.popFootBtn}
              onClick={() => {
                owedFreeFocus.current = true;
                onChange({ mode: "freeText", name: query.trim() });
                setOpen(false);
                setQuery("");
              }}
            >
              <Ic name="pen" />
              Type as plain text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
