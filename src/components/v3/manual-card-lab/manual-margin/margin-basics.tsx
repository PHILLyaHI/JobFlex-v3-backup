"use client";

// PRICE FIRST — CARD 03, who and where. (route: /dashboard/manual-margin)
//
// This card sits UNDER the price and under the line items, which is the whole
// money-first inversion: a name and an address do not change what the job is
// worth. They do one thing to the number, and the card head says exactly that
// — the address sets the tax-rate estimate, and nothing else in here touches a
// dollar.
//
// The page has ONE column and no modal layer, so every sub-task that the live
// builder opens a dialog for happens inline, where it was triggered: picking a
// project, creating one, picking a client, creating one, editing one, typing a
// plain-text name for a client with no record, and finding an address. Each is
// a popover anchored to its own trigger, or a blueprint-framed mini-form that
// replaces the field until it is done.
//
// Fixture-only: SEED_CLIENTS / SEED_PROJECTS / ADDRESS_SUGGESTIONS are plain
// constants, records created here live in React state and die with the tab.

import { useEffect, useRef, useState } from "react";
import type { ClientRecord, MarginDraft, ProjectRecord } from "./manual-margin-types";
import { ADDRESS_SUGGESTIONS, STATE_NAMES } from "./manual-margin-data";
import { Ic, cx } from "./margin-card";
import styles from "./manual-margin.module.css";

/** The blank a create/edit mini-form starts from. */
export type ClientFields = Omit<ClientRecord, "id">;

const EMPTY_CLIENT: ClientFields = {
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  tags: [],
};

/**
 * Closes a popover on an outside press or on Escape.
 *
 * `pointerdown` rather than `click`: a click fires after the mousedown has
 * already moved focus, so a picker that closes on click swallows the first
 * press on whatever is underneath it. Bound only while the popover is open, so
 * a page with three pickers never carries three idle listeners.
 */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  // The caller passes an inline arrow, so `close` is a new identity on every
  // render — and this page re-renders on every keystroke of every field. Held
  // in a ref so the listeners are bound ONCE per open/close, not swapped on
  // every character typed anywhere on the sheet.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!open) return;
    // `pointerdown` rather than `click`: a click fires after the mousedown has
    // already moved focus, so a picker that closes on click swallows the first
    // press on whatever is underneath it.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return ref;
}

/** A client record with nothing but a name is a legal, common state. It gets a
 *  sentence, not a blank space. */
function clientMeta(c: ClientRecord): { text: string; thin: boolean } {
  const lines = [
    c.email,
    c.phone,
    [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" · "),
  ].filter((s) => s && s.trim().length > 0);
  if (lines.length === 0) return { text: "No contact details on file.", thin: true };
  return { text: lines.join("\n"), thin: false };
}

/* ============================================================
   PROJECT
   ============================================================ */

function ProjectPicker({
  projects,
  projectId,
  onPick,
  onClear,
  onCreate,
}: {
  projects: ProjectRecord[];
  projectId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const ref = useDismiss(open, () => setOpen(false));

  const chosen = projects.find((p) => p.id === projectId) ?? null;
  const list = projects.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  if (making) {
    return (
      <div className={styles.miniForm}>
        <div className={styles.miniHead}>
          <Ic id="i-folder" />
          <span className={styles.miniTitle}>New project</span>
        </div>
        <div className={styles.stack}>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor="mc-pj-name">
              Project name
            </label>
            <input
              id="mc-pj-name"
              className={styles.in}
              value={name}
              placeholder="Reyes — Bluebonnet re-roof"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor="mc-pj-desc">
              Description<span className={styles.labOpt}> · optional</span>
            </label>
            <textarea
              id="mc-pj-desc"
              className={styles.ta}
              value={desc}
              placeholder="What this project covers, for your own records."
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.miniActs}>
          <button
            type="button"
            className={cx(styles.act, styles.actPrimary)}
            disabled={name.trim().length === 0}
            onClick={() => {
              onCreate(name.trim(), desc.trim());
              setMaking(false);
              setName("");
              setDesc("");
            }}
          >
            <Ic id="i-check" />
            Create project
          </button>
          <button
            type="button"
            className={styles.act}
            onClick={() => {
              setMaking(false);
              setName("");
              setDesc("");
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (chosen) {
    // The popover anchors to THIS wrapper, not to the record card inside it:
    // `.chosen` is a flex row, and an absolutely-positioned `left:0; right:0`
    // popover parented to a flex ITEM collapses to that item's width.
    return (
      <div className={styles.pick} ref={ref}>
        <div className={styles.chosen}>
          <span className={styles.chosenMark}>
            <Ic id="i-folder" />
          </span>
          <div className={styles.chosenBody}>
            <p className={styles.chosenName}>{chosen.name}</p>
            {chosen.description && <p className={styles.chosenMeta}>{chosen.description}</p>}
          </div>
          <div className={styles.chosenActs}>
            {/* "Change" reopens the picker, so it wears the picker's icon.
                The pencil is reserved for EDIT — on the client record it opens
                a form, and two controls that mean different things must not
                look the same. */}
            <button type="button" className={styles.iconBtn} onClick={() => setOpen((o) => !o)}>
              <Ic id="i-search" />
              <span className={styles.srOnly}>Change project</span>
            </button>
            <button type="button" className={cx(styles.iconBtn, styles.isDanger)} onClick={onClear}>
              <Ic id="i-x" />
              <span className={styles.srOnly}>Clear project</span>
            </button>
          </div>
        </div>
        {open && (
          <div className={styles.pop}>
            <div className={styles.popBar}>
              <Ic id="i-search" />
              <input
                className={styles.popIn}
                value={q}
                autoFocus
                placeholder="Search projects"
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className={styles.popList}>
              {list.length === 0 ? (
                <p className={styles.popEmpty}>No project matches &ldquo;{q}&rdquo;.</p>
              ) : (
                list.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cx(styles.opt, p.id === projectId && styles.isActive)}
                    onClick={() => {
                      onPick(p.id);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <Ic id="i-folder" />
                    <span className={styles.optBody}>
                      <span className={styles.optName}>{p.name}</span>
                      <span className={styles.optMeta}>{p.description || "No description"}</span>
                    </span>
                    {p.id === projectId && <Ic id="i-check" className={styles.optOn} />}
                  </button>
                ))
              )}
            </div>
            <div className={styles.popFoot}>
              <button
                type="button"
                className={styles.popFootBtn}
                onClick={() => {
                  setOpen(false);
                  setMaking(true);
                }}
              >
                <Ic id="i-plus" />
                New project
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.pick} ref={ref}>
      <button type="button" className={styles.pickTrigger} onClick={() => setOpen((o) => !o)}>
        <Ic id="i-folder" />
        <span>Search projects, or start a new one</span>
        <Ic id="i-chev" />
      </button>
      {open && (
        <div className={styles.pop}>
          <div className={styles.popBar}>
            <Ic id="i-search" />
            <input
              className={styles.popIn}
              value={q}
              autoFocus
              placeholder="Search projects"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className={styles.popList}>
            {list.length === 0 ? (
              <p className={styles.popEmpty}>No project matches &ldquo;{q}&rdquo;.</p>
            ) : (
              list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.opt}
                  onClick={() => {
                    onPick(p.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <Ic id="i-folder" />
                  <span className={styles.optBody}>
                    <span className={styles.optName}>{p.name}</span>
                    <span className={styles.optMeta}>{p.description || "No description"}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className={styles.popFoot}>
            <button
              type="button"
              className={styles.popFootBtn}
              onClick={() => {
                setOpen(false);
                setMaking(true);
              }}
            >
              <Ic id="i-plus" />
              New project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CLIENT — three modes, one union. See manual-margin-types.ts.
   ============================================================ */

function ClientForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: ClientFields;
  submitLabel: string;
  onSubmit: (fields: ClientFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<ClientFields>(initial);
  const [tagText, setTagText] = useState(initial.tags.join(", "));

  const patch = (p: Partial<ClientFields>) => setF((prev) => ({ ...prev, ...p }));

  return (
    <div className={styles.miniForm}>
      <div className={styles.miniHead}>
        <Ic id="i-user" />
        <span className={styles.miniTitle}>{title}</span>
      </div>

      <div className={styles.stack}>
        <div className={styles.field}>
          <label className={styles.lab} htmlFor="mc-cl-name">
            Name
          </label>
          <input
            id="mc-cl-name"
            className={styles.in}
            value={f.name}
            placeholder="Marisol & Dante Reyes"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor="mc-cl-email">
              Email<span className={styles.labOpt}> · optional</span>
            </label>
            <input
              id="mc-cl-email"
              className={styles.in}
              type="email"
              value={f.email}
              placeholder="name@example.com"
              onChange={(e) => patch({ email: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor="mc-cl-phone">
              Phone<span className={styles.labOpt}> · optional</span>
            </label>
            <input
              id="mc-cl-phone"
              className={styles.in}
              type="tel"
              value={f.phone}
              placeholder="(817) 555-0142"
              onChange={(e) => patch({ phone: e.target.value })}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.lab} htmlFor="mc-cl-street">
            Street address<span className={styles.labOpt}> · optional</span>
          </label>
          <input
            id="mc-cl-street"
            className={styles.in}
            value={f.address}
            placeholder="2318 Bluebonnet Ln"
            onChange={(e) => patch({ address: e.target.value })}
          />
        </div>

        <div className={styles.grid3}>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor="mc-cl-city">
              City
            </label>
            <input
              id="mc-cl-city"
              className={styles.in}
              value={f.city}
              placeholder="Fort Worth"
              onChange={(e) => patch({ city: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor="mc-cl-state">
              State
            </label>
            <input
              id="mc-cl-state"
              className={styles.in}
              value={f.state}
              maxLength={2}
              placeholder="TX"
              onChange={(e) => patch({ state: e.target.value.toUpperCase() })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.lab} htmlFor="mc-cl-zip">
              ZIP
            </label>
            <input
              id="mc-cl-zip"
              className={styles.in}
              value={f.zip}
              placeholder="76109"
              onChange={(e) => patch({ zip: e.target.value })}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.lab} htmlFor="mc-cl-tags">
            Tags<span className={styles.labOpt}> · optional, comma separated</span>
          </label>
          <input
            id="mc-cl-tags"
            className={styles.in}
            value={tagText}
            placeholder="VIP, Referral"
            onChange={(e) => {
              setTagText(e.target.value);
              patch({
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              });
            }}
          />
        </div>
      </div>

      <div className={styles.miniActs}>
        <button
          type="button"
          className={cx(styles.act, styles.actPrimary)}
          disabled={f.name.trim().length === 0}
          onClick={() => onSubmit({ ...f, name: f.name.trim() })}
        >
          <Ic id="i-check" />
          {submitLabel}
        </button>
        <button type="button" className={styles.act} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className={cx(styles.hint, styles.gapTop)}>
        The state on this record is what the tax estimate is worked out from.
      </p>
    </div>
  );
}

function ClientPicker({
  clients,
  draft,
  onPickClient,
  onFreeText,
  onClearClient,
  onCreateClient,
  onEditClient,
}: {
  clients: ClientRecord[];
  draft: MarginDraft;
  onPickClient: (c: ClientRecord) => void;
  onFreeText: (name: string) => void;
  onClearClient: () => void;
  onCreateClient: (fields: ClientFields) => void;
  onEditClient: (id: string, fields: ClientFields) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const ref = useDismiss(open, () => setOpen(false));

  // Pulled into a local const before it is narrowed: TypeScript drops the
  // discriminated-union narrowing of a PARAMETER's property the moment it is
  // read inside a callback, so `draft.client.id` in the .find() below would not
  // compile. A const keeps the narrowing.
  const choice = draft.client;
  const record =
    choice.mode === "record" ? clients.find((c) => c.id === choice.id) ?? null : null;

  const list = clients.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));

  if (mode === "create") {
    return (
      <ClientForm
        title="New client"
        initial={EMPTY_CLIENT}
        submitLabel="Create client"
        onSubmit={(f) => {
          onCreateClient(f);
          setMode("idle");
        }}
        onCancel={() => setMode("idle")}
      />
    );
  }

  if (mode === "edit" && record) {
    return (
      <ClientForm
        title={`Edit ${record.name}`}
        initial={{ ...record }}
        submitLabel="Save changes"
        onSubmit={(f) => {
          onEditClient(record.id, f);
          setMode("idle");
        }}
        onCancel={() => setMode("idle")}
      />
    );
  }

  // ── Plain-text mode: a name with no record behind it. ───────────────
  if (draft.client.mode === "freeText") {
    return (
      <div className={styles.stack}>
        <input
          className={styles.in}
          value={draft.client.name}
          placeholder="Type the client's name"
          aria-label="Client name, plain text"
          onChange={(e) => onFreeText(e.target.value)}
        />
        <div className={styles.row}>
          <span className={styles.oneOff}>Plain text · no client record</span>
          <button type="button" className={styles.link} onClick={onClearClient}>
            <Ic id="i-undo" />
            Back to the client list
          </button>
        </div>
      </div>
    );
  }

  // ── A picked record. ────────────────────────────────────────────────
  if (record) {
    const meta = clientMeta(record);
    return (
      <div className={styles.pick} ref={ref}>
        <div className={styles.chosen}>
          <span className={styles.chosenMark}>
            <Ic id="i-user" />
          </span>
          <div className={styles.chosenBody}>
            <p className={styles.chosenName}>{record.name}</p>
            <p className={cx(styles.chosenMeta, meta.thin && styles.isThin)}>{meta.text}</p>
            {record.tags.length > 0 && (
              <p className={styles.tagRow}>
                {record.tags.map((t) => (
                  <span className={styles.tag} key={t}>
                    {t}
                  </span>
                ))}
              </p>
            )}
          </div>
          <div className={styles.chosenActs}>
            <button type="button" className={styles.iconBtn} onClick={() => setMode("edit")}>
              <Ic id="i-pen" />
              <span className={styles.srOnly}>Edit {record.name}</span>
            </button>
            <button type="button" className={styles.iconBtn} onClick={() => setOpen((o) => !o)}>
              <Ic id="i-search" />
              <span className={styles.srOnly}>Change client</span>
            </button>
            <button
              type="button"
              className={cx(styles.iconBtn, styles.isDanger)}
              onClick={onClearClient}
            >
              <Ic id="i-x" />
              <span className={styles.srOnly}>Clear client</span>
            </button>
          </div>
        </div>
        {open && (
          <div className={styles.pop}>
            <div className={styles.popBar}>
              <Ic id="i-search" />
              <input
                className={styles.popIn}
                value={q}
                autoFocus
                placeholder="Search clients"
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className={styles.popList}>
              {list.length === 0 ? (
                <p className={styles.popEmpty}>No client matches &ldquo;{q}&rdquo;.</p>
              ) : (
                list.map((c) => {
                  const m = clientMeta(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={cx(styles.opt, c.id === record.id && styles.isActive)}
                      onClick={() => {
                        onPickClient(c);
                        setOpen(false);
                        setQ("");
                      }}
                    >
                      <Ic id="i-user" />
                      <span className={styles.optBody}>
                        <span className={styles.optName}>{c.name}</span>
                        <span className={styles.optMeta}>
                          {m.thin ? "No contact details on file" : m.text.split("\n")[0]}
                        </span>
                      </span>
                      {c.id === record.id && <Ic id="i-check" className={styles.optOn} />}
                    </button>
                  );
                })
              )}
            </div>
            <div className={styles.popFoot}>
              <button
                type="button"
                className={styles.popFootBtn}
                onClick={() => {
                  setOpen(false);
                  setMode("create");
                }}
              >
                <Ic id="i-userplus" />
                Create new
              </button>
              <button
                type="button"
                className={styles.popFootBtn}
                onClick={() => {
                  setOpen(false);
                  onFreeText(q.trim());
                }}
              >
                <Ic id="i-pen" />
                Type as plain text
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Nothing chosen. ─────────────────────────────────────────────────
  return (
    <div className={styles.pick} ref={ref}>
      <button type="button" className={styles.pickTrigger} onClick={() => setOpen((o) => !o)}>
        <Ic id="i-user" />
        <span>Search clients, create one, or just type a name</span>
        <Ic id="i-chev" />
      </button>
      {open && (
        <div className={styles.pop}>
          <div className={styles.popBar}>
            <Ic id="i-search" />
            <input
              className={styles.popIn}
              value={q}
              autoFocus
              placeholder="Search clients"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className={styles.popList}>
            {list.length === 0 ? (
              <p className={styles.popEmpty}>
                No client matches &ldquo;{q}&rdquo;. Create the record, or type the name as plain
                text.
              </p>
            ) : (
              list.map((c) => {
                const m = clientMeta(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.opt}
                    onClick={() => {
                      onPickClient(c);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <Ic id="i-user" />
                    <span className={styles.optBody}>
                      <span className={styles.optName}>{c.name}</span>
                      <span className={styles.optMeta}>
                        {m.thin ? "No contact details on file" : m.text.split("\n")[0]}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className={styles.popFoot}>
            <button
              type="button"
              className={styles.popFootBtn}
              onClick={() => {
                setOpen(false);
                setMode("create");
              }}
            >
              <Ic id="i-userplus" />
              Create new
            </button>
            <button
              type="button"
              className={styles.popFootBtn}
              onClick={() => {
                setOpen(false);
                onFreeText(q.trim());
              }}
            >
              <Ic id="i-pen" />
              Type as plain text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ADDRESS
   ============================================================ */

function AddressField({
  value,
  taxAuto,
  taxState,
  onChange,
  onFound,
}: {
  value: string;
  taxAuto: boolean;
  taxState: string | null;
  onChange: (v: string) => void;
  onFound: (label: string, state: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div className={styles.field}>
      <label className={styles.lab} htmlFor="mc-address">
        Job address<span className={styles.labOpt}> · optional</span>
      </label>
      <div className={styles.pick} ref={ref}>
        <input
          id="mc-address"
          className={styles.in}
          value={value}
          placeholder="2318 Bluebonnet Ln, Fort Worth, TX 76109"
          onChange={(e) => onChange(e.target.value)}
        />
        {open && (
          <div className={styles.pop}>
            <div className={styles.popBar}>
              <Ic id="i-pin" />
              <span className={styles.popCap}>Addresses on file</span>
            </div>
            <div className={styles.popList}>
              {ADDRESS_SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={styles.opt}
                  onClick={() => {
                    onFound(s.label, s.state);
                    setOpen(false);
                  }}
                >
                  <Ic id="i-pin" />
                  <span className={styles.optBody}>
                    <span className={styles.optName}>{s.label}</span>
                    <span className={styles.optMeta}>
                      {STATE_NAMES[s.state] ?? s.state} · sets the tax estimate
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.link} onClick={() => setOpen((o) => !o)}>
          <Ic id="i-search" />
          Find
        </button>
        <span className={styles.ann}>
          {taxAuto && taxState
            ? `Tax estimated from ${STATE_NAMES[taxState] ?? taxState}`
            : "Tax rate set by hand — the address will not change it"}
        </span>
      </div>
      <p className={styles.hint}>
        Fills in from the client and sets the tax-rate estimate, but stays freely editable — the
        proposal uses whatever is in this field.
      </p>
    </div>
  );
}

/* ============================================================
   THE CARD BODY
   ============================================================ */

export function BasicsBody({
  draft,
  clients,
  projects,
  onTitle,
  onDescription,
  onAddress,
  onAddressFound,
  onPickProject,
  onClearProject,
  onCreateProject,
  onPickClient,
  onFreeText,
  onClearClient,
  onCreateClient,
  onEditClient,
}: {
  draft: MarginDraft;
  clients: ClientRecord[];
  projects: ProjectRecord[];
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
  onAddress: (v: string) => void;
  onAddressFound: (label: string, state: string) => void;
  onPickProject: (id: string) => void;
  onClearProject: () => void;
  onCreateProject: (name: string, description: string) => void;
  onPickClient: (c: ClientRecord) => void;
  onFreeText: (name: string) => void;
  onClearClient: () => void;
  onCreateClient: (fields: ClientFields) => void;
  onEditClient: (id: string, fields: ClientFields) => void;
}) {
  return (
    <>
      <p className={styles.teach}>
        Who the proposal is for and what job it belongs to. Only one thing here touches the price:
        the address sets the tax-rate estimate.
      </p>

      <div className={styles.stack}>
        <div className={styles.field}>
          <label className={styles.lab} htmlFor="mc-title">
            Proposal title
          </label>
          <input
            id="mc-title"
            className={styles.in}
            value={draft.title}
            placeholder="Patel Residence — Roof Replacement"
            onChange={(e) => onTitle(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.lab}>Project</span>
          <ProjectPicker
            projects={projects}
            projectId={draft.projectId}
            onPick={onPickProject}
            onClear={onClearProject}
            onCreate={onCreateProject}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.lab}>Client</span>
          <ClientPicker
            clients={clients}
            draft={draft}
            onPickClient={onPickClient}
            onFreeText={onFreeText}
            onClearClient={onClearClient}
            onCreateClient={onCreateClient}
            onEditClient={onEditClient}
          />
        </div>

        <AddressField
          value={draft.address}
          taxAuto={draft.taxAuto}
          taxState={draft.taxState}
          onChange={onAddress}
          onFound={onAddressFound}
        />

        <div className={styles.field}>
          <label className={styles.lab} htmlFor="mc-description">
            Description
          </label>
          <textarea
            id="mc-description"
            className={styles.ta}
            value={draft.description}
            placeholder="One-paragraph overview your client will see first."
            onChange={(e) => onDescription(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

/** The card head's summary — content, never the card's own name. */
export function basicsSummary(
  draft: MarginDraft,
  clients: ClientRecord[],
  projects: ProjectRecord[],
): string {
  // Local const, so the union narrowing survives into the .find() callback —
  // see the same note in ClientPicker.
  const choice = draft.client;
  const client =
    choice.mode === "record"
      ? clients.find((c) => c.id === choice.id)?.name ?? "client missing"
      : choice.mode === "freeText"
        ? `${choice.name || "unnamed"} · plain text`
        : "no client";
  const project = draft.projectId
    ? projects.find((p) => p.id === draft.projectId)?.name ?? "project missing"
    : "no project";
  return [
    draft.title.trim() || "untitled",
    client,
    project,
    draft.address.trim() || "no address",
  ].join(" · ");
}
