"use client";

// SPEC SHEET — the record pickers. Route /dashboard/manual-spec.
//
// SH-01 needs two searchable pickers, and the client one carries three modes
// (pick a record / create one inline / type a plain-text name). This page has
// ONE COLUMN AND NO MODAL LAYER by design, so "create a client" is not a
// dialog: it is a framed sub-form that opens in the value track where it was
// triggered and closes back into it.
//
// The chosen state keeps the grammar: the record's NAME is the value on the
// rule, and its contact details are the drawing annotation printed under it.
// A thin record says "No contact details on file." rather than printing an
// empty line — a partial state is part of the design, not a failure of it.
//
// Fixture-only: `clients` and `projects` are React state held by the content
// component. Nothing here writes to a database.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientChoice, ClientRecord, ProjectRecord } from "./manual-spec-types";
import { clientAddressLine } from "./manual-spec-data";
import { newId } from "./manual-spec-math";
import { MiniField, cx } from "./spec-frame";
import styles from "./manual-spec.module.css";

/** Close on an outside pointer press and on Escape. Both listeners are on the
 *  document because the popover can be overlapped by the sticky title block. */
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

/* ═════════════════════════════════════════════════════════════
   PROJECT
   ═════════════════════════════════════════════════════════════ */

export function ProjectPicker({
  projects,
  value,
  onChange,
  onSaveProject,
}: {
  projects: ProjectRecord[];
  value: string | null;
  onChange: (id: string | null) => void;
  onSaveProject: (record: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const wrap = useDismiss(open, () => {
    setOpen(false);
    setCreating(false);
  });

  const chosen = projects.find((p) => p.id === value) ?? null;
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  function commit() {
    const name = draftName.trim();
    if (!name) return;
    const record: ProjectRecord = {
      id: newId("pj"),
      name,
      description: draftNote.trim(),
    };
    onSaveProject(record);
    onChange(record.id);
    setDraftName("");
    setDraftNote("");
    setCreating(false);
    setOpen(false);
  }

  if (creating) {
    return (
      <div className={styles.mini}>
        <div className={styles.miniHead}>New project</div>
        <div className={styles.miniGrid}>
          <MiniField label="Project name" id="spec-pj-name" wide>
            <input
              id="spec-pj-name"
              className={styles.in}
              value={draftName}
              placeholder="Alvarez — Bluewood Trl re-roof"
              onChange={(e) => setDraftName(e.target.value)}
            />
          </MiniField>
          <MiniField label="Description · optional" id="spec-pj-note" wide>
            <input
              id="spec-pj-note"
              className={styles.in}
              value={draftNote}
              placeholder="Full tear-off and re-roof, 31.5 squares."
              onChange={(e) => setDraftNote(e.target.value)}
            />
          </MiniField>
        </div>
        <div className={styles.miniActs}>
          <button type="button" className={styles.link} onClick={commit} disabled={!draftName.trim()}>
            Create and file this proposal under it
          </button>
          <button
            type="button"
            className={cx(styles.link, styles.isQuiet)}
            onClick={() => setCreating(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (chosen) {
    // The `.pick` wrapper — NOT the `.chosen` row — carries the dismiss ref and
    // the positioning context. Hanging the popover off the inner row instead
    // would both mis-position it and put the "Change" button OUTSIDE the
    // dismiss boundary, so pressing it would close and reopen in one gesture.
    return (
      <div className={styles.pick} ref={wrap}>
        <div className={styles.chosen}>
          <div className={styles.chosenBody}>
            <div className={styles.chosenName}>{chosen.name}</div>
            {chosen.description ? (
              <div className={styles.chosenMeta}>{chosen.description}</div>
            ) : (
              <div className={styles.chosenMiss}>No description on file.</div>
            )}
          </div>
          <div className={styles.chosenActs}>
            <button type="button" className={styles.link} onClick={() => setOpen((v) => !v)}>
              Change
            </button>
            <button
              type="button"
              className={cx(styles.link, styles.isQuiet)}
              onClick={() => onChange(null)}
            >
              Clear
            </button>
          </div>
        </div>
        {open && (
          <ProjectPop
            hits={hits}
            query={query}
            setQuery={setQuery}
            value={value}
            onPick={(id) => {
              onChange(id);
              setOpen(false);
            }}
            onCreate={() => {
              setDraftName(query.trim());
              setCreating(true);
              setOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.pick} ref={wrap}>
      <button type="button" className={styles.pickTrigger} onClick={() => setOpen((v) => !v)}>
        <svg className="ic" aria-hidden="true">
          <use href="#i-search" />
        </svg>
        <span>Search projects, or start a new one</span>
      </button>
      {open && (
        <ProjectPop
          hits={hits}
          query={query}
          setQuery={setQuery}
          value={value}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onCreate={() => {
            setDraftName(query.trim());
            setCreating(true);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ProjectPop({
  hits,
  query,
  setQuery,
  value,
  onPick,
  onCreate,
}: {
  hits: ProjectRecord[];
  query: string;
  setQuery: (q: string) => void;
  value: string | null;
  onPick: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className={styles.pop}>
      <div className={styles.popBar}>
        <svg className="ic" aria-hidden="true">
          <use href="#i-search" />
        </svg>
        <input
          className={styles.popIn}
          value={query}
          placeholder="Search projects"
          aria-label="Search projects"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.popList}>
        {hits.length === 0 ? (
          <p className={styles.popEmpty}>No project matches that.</p>
        ) : (
          hits.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cx(styles.opt, p.id === value && styles.isActive)}
              onClick={() => onPick(p.id)}
            >
              <svg className="ic" aria-hidden="true">
                <use href="#i-folder" />
              </svg>
              <span className={styles.optBody}>
                <span className={styles.optName}>{p.name}</span>
                {p.description && <span className={styles.optMeta}>{p.description}</span>}
              </span>
            </button>
          ))
        )}
      </div>
      <div className={styles.popFoot}>
        <button type="button" className={styles.popFootBtn} onClick={onCreate}>
          <svg className="ic" aria-hidden="true">
            <use href="#i-plus" />
          </svg>
          New project
        </button>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   CLIENT
   ═════════════════════════════════════════════════════════════ */

/** An empty record to start a create form from. */
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
  /** null = no form open; otherwise the record being created or edited. */
  const [form, setForm] = useState<ClientRecord | null>(null);
  const [isNew, setIsNew] = useState(false);

  const wrap = useDismiss(open, () => setOpen(false));

  const chosen =
    choice.mode === "record" ? (clients.find((c) => c.id === choice.id) ?? null) : null;

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [clients, query]);

  function patchForm(p: Partial<ClientRecord>) {
    setForm((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function commit() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return;
    onSaveClient({ ...form, name });
    onChoose({ mode: "record", id: form.id });
    setForm(null);
    setIsNew(false);
  }

  /* ── The inline create / edit form ─────────────────────── */
  if (form) {
    return (
      <div className={styles.mini}>
        <div className={styles.miniHead}>{isNew ? "New client" : "Edit client"}</div>
        <div className={styles.miniGrid}>
          <MiniField label="Name" id="spec-cl-name" wide>
            <input
              id="spec-cl-name"
              className={styles.in}
              value={form.name}
              placeholder="Renata & Marco Alvarez"
              onChange={(e) => patchForm({ name: e.target.value })}
            />
          </MiniField>
          <MiniField label="Email" id="spec-cl-email">
            <input
              id="spec-cl-email"
              className={styles.in}
              type="email"
              value={form.email}
              placeholder="name@example.com"
              onChange={(e) => patchForm({ email: e.target.value })}
            />
          </MiniField>
          <MiniField label="Phone" id="spec-cl-phone">
            <input
              id="spec-cl-phone"
              className={styles.in}
              value={form.phone}
              placeholder="(469) 555-0142"
              onChange={(e) => patchForm({ phone: e.target.value })}
            />
          </MiniField>
          <MiniField label="Street address" id="spec-cl-street" wide>
            <input
              id="spec-cl-street"
              className={styles.in}
              value={form.address}
              placeholder="4218 Bluewood Trl"
              onChange={(e) => patchForm({ address: e.target.value })}
            />
          </MiniField>
          <MiniField label="City" id="spec-cl-city">
            <input
              id="spec-cl-city"
              className={styles.in}
              value={form.city}
              placeholder="Frisco"
              onChange={(e) => patchForm({ city: e.target.value })}
            />
          </MiniField>
          <MiniField label="State" id="spec-cl-state">
            <input
              id="spec-cl-state"
              className={styles.in}
              value={form.state}
              placeholder="TX"
              maxLength={2}
              onChange={(e) => patchForm({ state: e.target.value.toUpperCase() })}
            />
          </MiniField>
          <MiniField label="ZIP" id="spec-cl-zip">
            <input
              id="spec-cl-zip"
              className={styles.in}
              value={form.zip}
              placeholder="75034"
              onChange={(e) => patchForm({ zip: e.target.value })}
            />
          </MiniField>
          <MiniField label="Tags · comma separated" id="spec-cl-tags" wide>
            <input
              id="spec-cl-tags"
              className={styles.in}
              value={form.tags.join(", ")}
              placeholder="VIP, repeat"
              onChange={(e) =>
                patchForm({
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />
          </MiniField>
        </div>
        <div className={styles.miniActs}>
          <button type="button" className={styles.link} onClick={commit} disabled={!form.name.trim()}>
            {isNew ? "Create and attach" : "Save changes"}
          </button>
          <button
            type="button"
            className={cx(styles.link, styles.isQuiet)}
            onClick={() => {
              setForm(null);
              setIsNew(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /* ── Free text: a name with no record behind it ────────── */
  if (choice.mode === "freeText") {
    return (
      <div>
        <input
          className={styles.in}
          value={choice.name}
          placeholder="Type the client's name"
          aria-label="Client name, plain text"
          onChange={(e) => onChoose({ mode: "freeText", name: e.target.value })}
        />
        <div className={styles.underValue}>
          <span className={cx(styles.tag, styles.isWarn)}>Plain text · no record</span>
          <button
            type="button"
            className={cx(styles.link, styles.isQuiet)}
            onClick={() => onChoose({ mode: "none" })}
          >
            Use a client record instead
          </button>
        </div>
      </div>
    );
  }

  /* ── A chosen record ───────────────────────────────────── */
  if (chosen) {
    const addressLine = clientAddressLine(chosen);
    const contact = [chosen.email, chosen.phone].filter((p) => p.trim().length > 0);
    const thin = contact.length === 0 && addressLine.length === 0;

    return (
      <div className={styles.pick} ref={wrap}>
        <div className={styles.chosen}>
          <div className={styles.chosenBody}>
            <div className={styles.chosenName}>{chosen.name}</div>
            {thin ? (
              <div className={styles.chosenMiss}>No contact details on file.</div>
            ) : (
              <div className={styles.chosenMeta}>
                {contact.join(" · ")}
                {contact.length > 0 && addressLine && <br />}
                {addressLine}
              </div>
            )}
            {chosen.tags.length > 0 && (
              <div className={styles.underValue}>
                {chosen.tags.map((t) => (
                  <span key={t} className={cx(styles.tag, styles.isBp)}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={styles.chosenActs}>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setForm({ ...chosen, tags: [...chosen.tags] });
                setIsNew(false);
              }}
            >
              Edit
            </button>
            <button type="button" className={styles.link} onClick={() => setOpen((v) => !v)}>
              Change
            </button>
          </div>
        </div>
        {open && (
          <ClientPop
            hits={hits}
            query={query}
            setQuery={setQuery}
            activeId={chosen.id}
            onPick={(id) => {
              onChoose({ mode: "record", id });
              setOpen(false);
            }}
            onCreate={() => {
              setForm(blankClient(query.trim()));
              setIsNew(true);
              setOpen(false);
            }}
            onFreeText={() => {
              onChoose({ mode: "freeText", name: query.trim() });
              setOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  /* ── Nothing chosen ────────────────────────────────────── */
  return (
    <div className={styles.pick} ref={wrap}>
      <button type="button" className={styles.pickTrigger} onClick={() => setOpen((v) => !v)}>
        <svg className="ic" aria-hidden="true">
          <use href="#i-search" />
        </svg>
        <span>Search clients, add a new one, or type a name</span>
      </button>
      {open && (
        <ClientPop
          hits={hits}
          query={query}
          setQuery={setQuery}
          activeId={null}
          onPick={(id) => {
            onChoose({ mode: "record", id });
            setOpen(false);
          }}
          onCreate={() => {
            setForm(blankClient(query.trim()));
            setIsNew(true);
            setOpen(false);
          }}
          onFreeText={() => {
            onChoose({ mode: "freeText", name: query.trim() });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ClientPop({
  hits,
  query,
  setQuery,
  activeId,
  onPick,
  onCreate,
  onFreeText,
}: {
  hits: ClientRecord[];
  query: string;
  setQuery: (q: string) => void;
  activeId: string | null;
  onPick: (id: string) => void;
  onCreate: () => void;
  onFreeText: () => void;
}) {
  return (
    <div className={styles.pop}>
      <div className={styles.popBar}>
        <svg className="ic" aria-hidden="true">
          <use href="#i-search" />
        </svg>
        <input
          className={styles.popIn}
          value={query}
          placeholder="Search clients"
          aria-label="Search clients"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.popList}>
        {hits.length === 0 ? (
          <p className={styles.popEmpty}>
            No client matches that. Add them, or type the name as plain text.
          </p>
        ) : (
          hits.map((c) => {
            const line = clientAddressLine(c);
            const meta = [c.email, line].filter((p) => p.trim().length > 0).join(" · ");
            return (
              <button
                key={c.id}
                type="button"
                className={cx(styles.opt, c.id === activeId && styles.isActive)}
                onClick={() => onPick(c.id)}
              >
                <svg className="ic" aria-hidden="true">
                  <use href="#i-user" />
                </svg>
                <span className={styles.optBody}>
                  <span className={styles.optName}>{c.name}</span>
                  <span className={styles.optMeta}>{meta || "No contact details on file."}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className={styles.popFoot}>
        <button type="button" className={styles.popFootBtn} onClick={onCreate}>
          <svg className="ic" aria-hidden="true">
            <use href="#i-userplus" />
          </svg>
          New client
        </button>
        <button type="button" className={styles.popFootBtn} onClick={onFreeText}>
          <svg className="ic" aria-hidden="true">
            <use href="#i-pen" />
          </svg>
          Type as plain text
        </button>
      </div>
    </div>
  );
}
