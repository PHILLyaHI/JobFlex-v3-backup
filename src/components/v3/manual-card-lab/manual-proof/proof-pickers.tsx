"use client";

// PROOF CARD — the record pickers (route: /dashboard/manual-proof).
//
// Card 01 has to do three jobs that the live builder spreads across a dialog
// layer: pick a project or make one, pick a client OR make one OR type a
// one-off name, and set a job address that the tax estimate follows. This page
// has ONE COLUMN and no modal layer by design, so every one of those happens
// INLINE, in the card, where it was triggered — a popover for choosing, a
// framed sub-form for creating.
//
// The pickers report a choice and nothing else. The consequences of a choice —
// the address auto-fill and the tax-rate estimate — are the CONTENT component's
// business, because those are the things the proof footers have to state and
// there must be exactly one place that decides them.
//
// Fixture-only: the lists are props, sourced from manual-proof-data.ts. No
// server action, no Prisma, no network.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientChoice, ClientRecord, ProjectRecord } from "./manual-proof-types";
import { newId } from "./manual-proof-math";
import { cx } from "./proof-card";
import { Field, Ic, IconBtn, LinkBtn, TextArea, TextIn } from "./proof-bits";
import styles from "./manual-proof.module.css";

/**
 * Close a popover on an outside press or on Escape.
 *
 * `mousedown`, not `click`: a click listener fires after the browser has
 * already moved focus, so pressing a field inside a second popover would close
 * this one and re-render the tree under the pointer mid-gesture.
 */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return ref;
}

/** Case-insensitive contains, used by both pickers' search boxes. */
function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/** A client's postal lines, or null when the record is thin. */
export function clientAddressLine(c: ClientRecord): string | null {
  const street = c.address.trim();
  const cityLine = [c.city, c.state].filter(Boolean).join(", ");
  const tail = [cityLine, c.zip].filter(Boolean).join(" ").trim();
  const joined = [street, tail].filter(Boolean).join(", ");
  return joined.length > 0 ? joined : null;
}

/** True when the record carries nothing a contractor could contact them with. */
export function isThinRecord(c: ClientRecord): boolean {
  return (
    c.email.trim().length === 0 &&
    c.phone.trim().length === 0 &&
    clientAddressLine(c) === null
  );
}

/* ══════════════════════════════════════════════════════════════
   PROJECT PICKER
   ══════════════════════════════════════════════════════════════ */

export function ProjectPicker({
  projects,
  value,
  onChange,
  onSaveProject,
}: {
  projects: ProjectRecord[];
  value: string;
  onChange: (id: string) => void;
  onSaveProject: (record: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
    setQuery("");
  }, []);
  const ref = useDismiss(open || creating, close);

  const chosen = projects.find((p) => p.id === value) ?? null;
  const list = useMemo(
    () => projects.filter((p) => matches(p.name, query) || matches(p.description, query)),
    [projects, query],
  );

  function commit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const record: ProjectRecord = {
      id: newId("pj"),
      name: trimmed,
      description: description.trim(),
    };
    onSaveProject(record);
    onChange(record.id);
    setName("");
    setDescription("");
    close();
  }

  return (
    <div className={styles.pick} ref={ref}>
      {creating ? (
        <div className={styles.miniForm}>
          <div className={styles.miniHead}>
            <Ic name="folder" />
            <span className={styles.miniTitle}>New project</span>
          </div>
          <div className={styles.stack}>
            <Field label="Project name">
              <TextIn
                value={name}
                onChange={setName}
                placeholder="Patel — Cedar Bluff re-roof"
              />
            </Field>
            <Field label="Description" optional>
              <TextArea
                value={description}
                onChange={setDescription}
                rows={2}
                placeholder="Full tear-off and re-roof, 28.5 squares."
              />
            </Field>
          </div>
          <div className={styles.miniActs}>
            <button type="button" className={cx(styles.act, styles.actPrimary)} onClick={commit}>
              Create project
            </button>
            <button type="button" className={styles.act} onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      ) : chosen ? (
        <div className={styles.chosen}>
          <span className={styles.chosenMark}>
            <Ic name="folder" />
          </span>
          <div className={styles.chosenBody}>
            <div className={styles.chosenName}>{chosen.name}</div>
            {chosen.description && <div className={styles.chosenMeta}>{chosen.description}</div>}
          </div>
          <div className={styles.chosenActs}>
            <IconBtn icon="search" label="Change the project" onClick={() => setOpen(true)} />
            <IconBtn icon="x" label="Clear the project" onClick={() => onChange("")} />
          </div>
        </div>
      ) : (
        <button type="button" className={styles.pickTrigger} onClick={() => setOpen(true)}>
          <Ic name="folder" />
          <span>Search projects, or start a new one</span>
          <Ic name="chev" />
        </button>
      )}

      {open && !creating && (
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
            {list.length === 0 ? (
              <p className={styles.popEmpty}>No project matches that.</p>
            ) : (
              list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cx(styles.opt, p.id === value && styles.isActive)}
                  onClick={() => {
                    onChange(p.id);
                    close();
                  }}
                >
                  <Ic name="folder" />
                  <span className={styles.optBody}>
                    <span className={styles.optName}>{p.name}</span>
                    {p.description && <span className={styles.optMeta}>{p.description}</span>}
                  </span>
                  {p.id === value && <Ic name="check" className={styles.optOn} />}
                </button>
              ))
            )}
          </div>

          <div className={styles.popFoot}>
            <button
              type="button"
              className={styles.popFootBtn}
              onClick={() => {
                setName(query);
                setCreating(true);
                setOpen(false);
              }}
            >
              <Ic name="plus" />
              New project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CLIENT PICKER — three modes
   ══════════════════════════════════════════════════════════════ */

/** A blank record to seed the create form. */
function emptyClient(name: string): ClientRecord {
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
  onChoose,
  onSaveClient,
}: {
  clients: ClientRecord[];
  choice: ClientChoice;
  onChoose: (next: ClientChoice) => void;
  onSaveClient: (record: ClientRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** null = no sub-form. Otherwise the record being created or edited. */
  const [form, setForm] = useState<ClientRecord | null>(null);
  const [editing, setEditing] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  const ref = useDismiss(open, close);

  const chosen =
    choice.mode === "record" ? (clients.find((c) => c.id === choice.id) ?? null) : null;

  const list = useMemo(
    () =>
      clients.filter(
        (c) =>
          matches(c.name, query) ||
          matches(c.email, query) ||
          matches(c.city, query),
      ),
    [clients, query],
  );

  function patchForm(p: Partial<ClientRecord>) {
    setForm((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function commitForm() {
    if (!form) return;
    const trimmed = form.name.trim();
    if (trimmed.length === 0) return;
    const record = { ...form, name: trimmed };
    onSaveClient(record);
    onChoose({ mode: "record", id: record.id });
    setForm(null);
    setEditing(false);
  }

  /* ── The inline create / edit sub-form ─────────────────────── */
  if (form) {
    return (
      <div className={styles.pick}>
        <div className={styles.miniForm}>
          <div className={styles.miniHead}>
            <Ic name={editing ? "pen" : "userplus"} />
            <span className={styles.miniTitle}>{editing ? "Edit client" : "New client"}</span>
          </div>

          <div className={styles.stack}>
            <Field label="Name">
              <TextIn
                value={form.name}
                onChange={(v) => patchForm({ name: v })}
                placeholder="Devan & Nisha Patel"
              />
            </Field>

            <div className={styles.grid2}>
              <Field label="Email" optional>
                <TextIn
                  value={form.email}
                  onChange={(v) => patchForm({ email: v })}
                  placeholder="nisha.patel@example.com"
                />
              </Field>
              <Field label="Phone" optional>
                <TextIn
                  value={form.phone}
                  onChange={(v) => patchForm({ phone: v })}
                  placeholder="(512) 555-0148"
                />
              </Field>
            </div>

            <Field label="Street address" optional>
              <TextIn
                value={form.address}
                onChange={(v) => patchForm({ address: v })}
                placeholder="4118 Cedar Bluff Ln"
              />
            </Field>

            <div className={styles.grid3}>
              <Field label="City" optional>
                <TextIn value={form.city} onChange={(v) => patchForm({ city: v })} placeholder="Round Rock" />
              </Field>
              <Field label="State" optional>
                <TextIn
                  value={form.state}
                  onChange={(v) => patchForm({ state: v.toUpperCase().slice(0, 2) })}
                  placeholder="TX"
                />
              </Field>
              <Field label="ZIP" optional>
                <TextIn value={form.zip} onChange={(v) => patchForm({ zip: v })} placeholder="78681" />
              </Field>
            </div>

            <Field
              label="Tags"
              optional
              hint="Comma separated — e.g. VIP, Repeat. Internal only; the client never sees them."
            >
              <TextIn
                value={form.tags.join(", ")}
                onChange={(v) =>
                  patchForm({
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
            <button type="button" className={cx(styles.act, styles.actPrimary)} onClick={commitForm}>
              {editing ? "Save client" : "Create client"}
            </button>
            <button
              type="button"
              className={styles.act}
              onClick={() => {
                setForm(null);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Free-text mode ────────────────────────────────────────── */
  if (choice.mode === "freeText") {
    return (
      <div className={styles.pick}>
        <div className={styles.freeText}>
          <input
            className={styles.in}
            value={choice.name}
            placeholder="Type the client's name"
            aria-label="Client name, plain text"
            onChange={(e) => onChoose({ mode: "freeText", name: e.target.value })}
          />
          <span className={styles.oneOff}>Not a client record</span>
          <div className={styles.freeActs}>
            <LinkBtn icon="undo" onClick={() => onChoose({ mode: "none" })}>
              Pick someone on file instead
            </LinkBtn>
          </div>
        </div>
      </div>
    );
  }

  /* ── Chosen record ─────────────────────────────────────────── */
  return (
    <div className={styles.pick} ref={ref}>
      {chosen ? (
        <div className={styles.chosen}>
          <span className={styles.chosenMark}>
            <Ic name="user" />
          </span>
          <div className={styles.chosenBody}>
            <div className={styles.chosenName}>{chosen.name}</div>
            {isThinRecord(chosen) ? (
              <div className={styles.chosenThin}>No contact details on file.</div>
            ) : (
              <div className={styles.chosenMeta}>
                {[chosen.email, chosen.phone, clientAddressLine(chosen)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {chosen.tags.length > 0 && (
              <div className={styles.tagRow}>
                {chosen.tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={styles.chosenActs}>
            <IconBtn
              icon="pen"
              label={`Edit ${chosen.name}`}
              onClick={() => {
                setForm({ ...chosen, tags: [...chosen.tags] });
                setEditing(true);
              }}
            />
            <IconBtn icon="search" label="Change the client" onClick={() => setOpen(true)} />
            <IconBtn icon="x" label="Clear the client" onClick={() => onChoose({ mode: "none" })} />
          </div>
        </div>
      ) : (
        <button type="button" className={styles.pickTrigger} onClick={() => setOpen(true)}>
          <Ic name="user" />
          <span>Search clients, add one, or type a name</span>
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
              placeholder="Search clients"
              aria-label="Search clients"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className={styles.popList}>
            {list.length === 0 ? (
              <p className={styles.popEmpty}>Nobody on file matches that.</p>
            ) : (
              list.map((c) => {
                const active = choice.mode === "record" && choice.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={cx(styles.opt, active && styles.isActive)}
                    onClick={() => {
                      onChoose({ mode: "record", id: c.id });
                      close();
                    }}
                  >
                    <Ic name="user" />
                    <span className={styles.optBody}>
                      <span className={styles.optName}>{c.name}</span>
                      <span className={styles.optMeta}>
                        {isThinRecord(c)
                          ? "No contact details on file."
                          : [clientAddressLine(c), c.phone].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {active && <Ic name="check" className={styles.optOn} />}
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
                setForm(emptyClient(query));
                setEditing(false);
                close();
              }}
            >
              <Ic name="userplus" />
              New client
            </button>
            <button
              type="button"
              className={styles.popFootBtn}
              onClick={() => {
                onChoose({ mode: "freeText", name: query });
                close();
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

/* ══════════════════════════════════════════════════════════════
   JOB ADDRESS — a plain field with a Find affordance
   ══════════════════════════════════════════════════════════════ */

export function AddressField({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  // Typing filters the list, so `Find` opens onto something useful rather than
  // onto five addresses that have nothing to do with what is already typed.
  const list = useMemo(
    () => (value.trim().length === 0 ? suggestions : suggestions.filter((s) => matches(s, value))),
    [suggestions, value],
  );

  return (
    <div className={styles.pick} ref={ref}>
      <div className={styles.addrRow}>
        <input
          className={styles.in}
          value={value}
          placeholder="4118 Cedar Bluff Ln, Round Rock, TX 78681"
          aria-label="Job address"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={styles.act}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Ic name="pin" />
          Find
        </button>
      </div>

      {open && (
        <div className={cx(styles.pop, styles.popBelow)}>
          <div className={styles.popList}>
            {list.length === 0 ? (
              <p className={styles.popEmpty}>No saved address matches that.</p>
            ) : (
              list.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.opt}
                  onClick={() => {
                    onChange(s);
                    close();
                  }}
                >
                  <Ic name="pin" />
                  <span className={styles.optBody}>
                    <span className={styles.optName}>{s}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
