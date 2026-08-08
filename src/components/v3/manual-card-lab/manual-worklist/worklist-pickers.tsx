"use client";

// WORKLIST — card 01 (client + job address) and the project picker used by
// card 02. Grouped here because all three are the same interaction: search a
// short fixture list, or make a record that is not on it yet.
//
// EVERYTHING IS INLINE. This page has no dialog layer by design: a worklist
// whose cards disappear behind a modal cannot show you what is left, which is
// the one thing it exists to do. Creating a client, editing one, typing a
// plain-text name and finding an address all happen in the column, under the
// control that asked for them, and every one of them can be backed out of.
//
// Fixture-only: the address `Find` control offers a local ADDRESS_BOOK instead
// of the shell's Google Places helper, because a lab page may not make a
// network call.

import { useMemo, useState } from "react";
import type { ClientChoice, ClientRecord, ProjectRecord } from "./worklist-types";
import { ADDRESS_BOOK, STATE_NAME, stateFromAddress } from "./worklist-data";
import { newId } from "./worklist-math";
import { Field, Icon, cx } from "./worklist-ui";
import styles from "./manual-worklist.module.css";

/** One line of address from a record — "1408 Hollow Creek Dr, Austin, TX 78704". */
export function addressLine(c: ClientRecord): string {
  const cityState = [c.city, c.state].filter(Boolean).join(", ");
  return [c.address, cityState, c.zip].filter((p) => p.trim().length > 0).join(" ");
}

/** An empty record to start a create form from. */
function blankClient(name = ""): ClientRecord {
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

/* ============================================================
   THE CLIENT FORM — one form, two jobs (create and edit).
   Split out so "create" and "edit" cannot drift apart; the only
   difference between them is the heading and the submit word.
   ============================================================ */

function ClientForm({
  seed,
  heading,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  seed: ClientRecord;
  heading: string;
  submitLabel: string;
  onSubmit: (record: ClientRecord) => void;
  onCancel: () => void;
}) {
  const [record, setRecord] = useState<ClientRecord>(seed);
  const set = (p: Partial<ClientRecord>) => setRecord((prev) => ({ ...prev, ...p }));
  const nameOk = record.name.trim().length > 0;

  return (
    <div className={styles.inlinePanel}>
      <div className={styles.inlineHead}>
        <span className={styles.inlineTitle}>{heading}</span>
        <button type="button" className={styles.quietBtn} onClick={onCancel}>
          <Icon name="x" />
          Cancel
        </button>
      </div>

      <div className={styles.stack}>
        <Field label="Client name">
          {(id) => (
            <input
              id={id}
              className={styles.in}
              value={record.name}
              placeholder="Anaya & Dev Patel"
              onChange={(e) => set({ name: e.target.value })}
            />
          )}
        </Field>

        <div className={styles.grid2}>
          <Field label="Email" optional>
            {(id) => (
              <input
                id={id}
                className={styles.in}
                type="email"
                value={record.email}
                placeholder="name@example.com"
                onChange={(e) => set({ email: e.target.value })}
              />
            )}
          </Field>
          <Field label="Phone" optional>
            {(id) => (
              <input
                id={id}
                className={styles.in}
                type="tel"
                value={record.phone}
                placeholder="(512) 555-0142"
                onChange={(e) => set({ phone: e.target.value })}
              />
            )}
          </Field>
        </div>

        <Field label="Street address" optional>
          {(id) => (
            <input
              id={id}
              className={styles.in}
              value={record.address}
              placeholder="1408 Hollow Creek Dr"
              onChange={(e) => set({ address: e.target.value })}
            />
          )}
        </Field>

        <div className={styles.grid3}>
          <Field label="City" optional>
            {(id) => (
              <input
                id={id}
                className={styles.in}
                value={record.city}
                placeholder="Austin"
                onChange={(e) => set({ city: e.target.value })}
              />
            )}
          </Field>
          <Field label="State" optional>
            {(id) => (
              <input
                id={id}
                className={styles.in}
                value={record.state}
                maxLength={2}
                placeholder="TX"
                onChange={(e) => set({ state: e.target.value.toUpperCase().slice(0, 2) })}
              />
            )}
          </Field>
          <Field label="ZIP" optional>
            {(id) => (
              <input
                id={id}
                className={styles.in}
                value={record.zip}
                placeholder="78704"
                onChange={(e) => set({ zip: e.target.value })}
              />
            )}
          </Field>
        </div>

        <Field
          label="Tags"
          optional
          hint="Comma separated. VIP, Repeat, Warranty — whatever you sort on."
        >
          {(id) => (
            <input
              id={id}
              className={styles.in}
              value={record.tags.join(", ")}
              placeholder="VIP"
              onChange={(e) =>
                set({
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />
          )}
        </Field>

        <div className={styles.inlineActs}>
          <button
            type="button"
            className={cx(styles.btn, styles.btnPrimary)}
            disabled={!nameOk}
            onClick={() => onSubmit({ ...record, name: record.name.trim() })}
          >
            <Icon name="check" />
            {submitLabel}
          </button>
          {!nameOk && <span className={styles.inlineWarn}>A name is the one thing required.</span>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   THE CLIENT PICKER — three modes, one control.
   ============================================================ */

type PickerPanel = "none" | "search" | "create" | "edit";

export function ClientPicker({
  choice,
  clients,
  onChoose,
  onSaveRecord,
  onAddressFill,
}: {
  choice: ClientChoice;
  clients: ClientRecord[];
  onChoose: (next: ClientChoice) => void;
  onSaveRecord: (record: ClientRecord) => void;
  /**
   * Fired whenever a record is chosen or edited. The caller decides what a new
   * address does to the tax estimate — this component must not know, because
   * the "never overwrite a hand-typed rate" rule lives with the rate.
   */
  onAddressFill: (line: string, stateCode: string | null) => void;
}) {
  const [panel, setPanel] = useState<PickerPanel>("none");
  const [query, setQuery] = useState("");

  const picked = choice.mode === "record" ? clients.find((c) => c.id === choice.id) : undefined;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q),
    );
  }, [clients, query]);

  function choose(record: ClientRecord) {
    onChoose({ mode: "record", id: record.id });
    const line = addressLine(record);
    onAddressFill(line, record.state || null);
    setPanel("none");
    setQuery("");
  }

  /* ── A record is on the sheet ──────────────────────────── */
  if (picked && panel !== "edit") {
    const line = addressLine(picked);
    const contact = [picked.email, picked.phone].filter(Boolean);
    const thin = contact.length === 0 && line.length === 0;

    return (
      <div className={styles.pickedCard}>
        <div className={styles.pickedTop}>
          <div className={styles.pickedId}>
            <span className={styles.pickedName}>{picked.name}</span>
            {picked.tags.map((t) => (
              <span key={t} className={styles.tag}>
                {t}
              </span>
            ))}
          </div>
          <div className={styles.pickedActs}>
            <button type="button" className={styles.quietBtn} onClick={() => setPanel("edit")}>
              <Icon name="pen" />
              Edit
            </button>
            <button
              type="button"
              className={styles.quietBtn}
              onClick={() => {
                setPanel("search");
                setQuery("");
              }}
            >
              <Icon name="search" />
              Change
            </button>
            <button
              type="button"
              className={styles.quietBtn}
              onClick={() => onChoose({ mode: "none" })}
            >
              <Icon name="x" />
              Clear
            </button>
          </div>
        </div>

        {thin ? (
          <p className={styles.empty}>No contact details on file.</p>
        ) : (
          <dl className={styles.contact}>
            {picked.email && (
              <div>
                <dt>Email</dt>
                <dd>{picked.email}</dd>
              </div>
            )}
            {picked.phone && (
              <div>
                <dt>Phone</dt>
                <dd>{picked.phone}</dd>
              </div>
            )}
            {line && (
              <div>
                <dt>Address</dt>
                <dd>{line}</dd>
              </div>
            )}
          </dl>
        )}

        {panel === "search" && (
          <SearchList
            query={query}
            setQuery={setQuery}
            results={results}
            onPick={choose}
            onCreate={() => setPanel("create")}
            onFreeText={() => {
              onChoose({ mode: "freeText", name: query.trim() });
              setPanel("none");
            }}
            onCancel={() => setPanel("none")}
          />
        )}

        {panel === "create" && (
          <ClientForm
            seed={blankClient(query.trim())}
            heading="New client"
            submitLabel="Save client"
            onSubmit={(record) => {
              onSaveRecord(record);
              choose(record);
            }}
            onCancel={() => setPanel("none")}
          />
        )}
      </div>
    );
  }

  /* ── Editing the picked record ─────────────────────────── */
  if (picked && panel === "edit") {
    return (
      <ClientForm
        seed={picked}
        heading={`Edit ${picked.name}`}
        submitLabel="Save changes"
        onSubmit={(record) => {
          onSaveRecord(record);
          onAddressFill(addressLine(record), record.state || null);
          setPanel("none");
        }}
        onCancel={() => setPanel("none")}
      />
    );
  }

  /* ── Free text: a client with no record ────────────────── */
  if (choice.mode === "freeText") {
    return (
      <div className={styles.pickedCard}>
        <div className={styles.pickedTop}>
          <div className={styles.pickedId}>
            <span className={styles.pickedName}>
              {choice.name.trim() || "Untitled client"}
            </span>
            <span className={cx(styles.tag, styles.tagQuiet)}>Plain text</span>
          </div>
          <div className={styles.pickedActs}>
            <button
              type="button"
              className={styles.quietBtn}
              onClick={() => {
                onChoose({ mode: "none" });
                setPanel("search");
              }}
            >
              <Icon name="undo" />
              Back to the client list
            </button>
          </div>
        </div>

        <Field
          label="Client name"
          hint="Typed straight onto the proposal. Nothing is filed, so nothing auto-fills."
        >
          {(id) => (
            <input
              id={id}
              className={styles.in}
              value={choice.name}
              placeholder="Patel Residence"
              onChange={(e) => onChoose({ mode: "freeText", name: e.target.value })}
            />
          )}
        </Field>
      </div>
    );
  }

  /* ── Nothing chosen ────────────────────────────────────── */
  return (
    <div className={styles.pickedCard}>
      <SearchList
        query={query}
        setQuery={setQuery}
        results={results}
        onPick={choose}
        onCreate={() => setPanel("create")}
        onFreeText={() => onChoose({ mode: "freeText", name: query.trim() })}
        onCancel={null}
      />
      {panel === "create" && (
        <ClientForm
          seed={blankClient(query.trim())}
          heading="New client"
          submitLabel="Save client"
          onSubmit={(record) => {
            onSaveRecord(record);
            choose(record);
          }}
          onCancel={() => setPanel("none")}
        />
      )}
    </div>
  );
}

/** The search box plus its result rows and its two escapes. */
function SearchList({
  query,
  setQuery,
  results,
  onPick,
  onCreate,
  onFreeText,
  onCancel,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: ClientRecord[];
  onPick: (c: ClientRecord) => void;
  onCreate: () => void;
  onFreeText: () => void;
  onCancel: (() => void) | null;
}) {
  return (
    <div className={styles.searchWrap}>
      <Field label="Find a client">
        {(id) => (
          <input
            id={id}
            className={styles.in}
            value={query}
            placeholder="Search by name, email or city"
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </Field>

      {results.length === 0 ? (
        <p className={styles.empty}>
          No client matches “{query}”. Make a record, or put the name on as plain text.
        </p>
      ) : (
        <ul className={styles.resultList}>
          {results.map((c) => {
            const line = addressLine(c);
            return (
              <li key={c.id}>
                <button type="button" className={styles.result} onClick={() => onPick(c)}>
                  <span className={styles.resultName}>{c.name}</span>
                  <span className={styles.resultMeta}>
                    {line || c.email || "No contact details on file."}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.inlineActs}>
        <button type="button" className={styles.btn} onClick={onCreate}>
          <Icon name="userplus" />
          New client
        </button>
        <button type="button" className={styles.btn} onClick={onFreeText}>
          <Icon name="pen" />
          Type as plain text
        </button>
        {onCancel && (
          <button type="button" className={styles.quietBtn} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   THE JOB ADDRESS — one line, with a Find that offers the book.
   ============================================================ */

export function AddressField({
  value,
  onChange,
  taxNote,
}: {
  value: string;
  /** Carries the resolved state code so the caller can re-estimate the tax. */
  onChange: (line: string, stateCode: string | null) => void;
  /** What the current rate is doing, printed under the field. */
  taxNote: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.field}>
      <Field
        label="Job address"
        optional
        hint={
          <>
            Fills from the chosen client and sets the tax-rate estimate — edit it
            freely, the estimate follows the state you leave in it. {taxNote}
          </>
        }
      >
        {(id) => (
          <div className={styles.withBtn}>
            <input
              id={id}
              className={styles.in}
              value={value}
              placeholder="1408 Hollow Creek Dr, Austin, TX 78704"
              onChange={(e) => onChange(e.target.value, stateFromAddress(e.target.value))}
            />
            <button
              type="button"
              className={styles.btn}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon name="pin" />
              Find
            </button>
          </div>
        )}
      </Field>

      {open && (
        <ul className={styles.resultList}>
          {ADDRESS_BOOK.map((line) => {
            const code = stateFromAddress(line);
            return (
              <li key={line}>
                <button
                  type="button"
                  className={styles.result}
                  onClick={() => {
                    onChange(line, code);
                    setOpen(false);
                  }}
                >
                  <span className={styles.resultName}>{line}</span>
                  <span className={styles.resultMeta}>
                    {code ? `Sets the estimate from ${STATE_NAME[code] ?? code}` : "No state read"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
   THE PROJECT PICKER — pick one, or make one on the spot.
   ============================================================ */

export function ProjectPicker({
  projectId,
  projects,
  onChoose,
  onSaveRecord,
}: {
  projectId: string | null;
  projects: ProjectRecord[];
  onChoose: (id: string | null) => void;
  onSaveRecord: (record: ProjectRecord) => void;
}) {
  const [panel, setPanel] = useState<"none" | "search" | "create">("none");
  const [query, setQuery] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");

  const picked = projects.find((p) => p.id === projectId);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  if (picked && panel === "none") {
    return (
      <div className={styles.pickedCard}>
        <div className={styles.pickedTop}>
          <div className={styles.pickedId}>
            <span className={styles.pickedName}>{picked.name}</span>
          </div>
          <div className={styles.pickedActs}>
            <button type="button" className={styles.quietBtn} onClick={() => setPanel("search")}>
              <Icon name="search" />
              Change
            </button>
            <button type="button" className={styles.quietBtn} onClick={() => onChoose(null)}>
              <Icon name="x" />
              Clear
            </button>
          </div>
        </div>
        {picked.description && <p className={styles.pickedDesc}>{picked.description}</p>}
      </div>
    );
  }

  return (
    <div className={styles.pickedCard}>
      {panel !== "create" && (
        <div className={styles.searchWrap}>
          <Field label="Find a project">
            {(id) => (
              <input
                id={id}
                className={styles.in}
                value={query}
                placeholder="Search projects"
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>

          {results.length === 0 ? (
            <p className={styles.empty}>No project matches “{query}”. Start a new one.</p>
          ) : (
            <ul className={styles.resultList}>
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.result}
                    onClick={() => {
                      onChoose(p.id);
                      setPanel("none");
                      setQuery("");
                    }}
                  >
                    <span className={styles.resultName}>{p.name}</span>
                    <span className={styles.resultMeta}>{p.description || "No description"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.inlineActs}>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setDraftName(query.trim());
                setDraftDesc("");
                setPanel("create");
              }}
            >
              <Icon name="folder" />
              New project
            </button>
            {picked && (
              <button type="button" className={styles.quietBtn} onClick={() => setPanel("none")}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {panel === "create" && (
        <div className={styles.inlinePanel}>
          <div className={styles.inlineHead}>
            <span className={styles.inlineTitle}>New project</span>
            <button type="button" className={styles.quietBtn} onClick={() => setPanel("none")}>
              <Icon name="x" />
              Cancel
            </button>
          </div>
          <div className={styles.stack}>
            <Field label="Project name">
              {(id) => (
                <input
                  id={id}
                  className={styles.in}
                  value={draftName}
                  placeholder="Patel — Hollow Creek re-roof"
                  onChange={(e) => setDraftName(e.target.value)}
                />
              )}
            </Field>
            <Field label="Description" optional>
              {(id) => (
                <textarea
                  id={id}
                  className={styles.ta}
                  value={draftDesc}
                  placeholder="Full tear-off, 24 squares, one existing layer."
                  onChange={(e) => setDraftDesc(e.target.value)}
                />
              )}
            </Field>
            <div className={styles.inlineActs}>
              <button
                type="button"
                className={cx(styles.btn, styles.btnPrimary)}
                disabled={draftName.trim().length === 0}
                onClick={() => {
                  const record: ProjectRecord = {
                    id: newId("pj"),
                    name: draftName.trim(),
                    description: draftDesc.trim(),
                  };
                  onSaveRecord(record);
                  onChoose(record.id);
                  setPanel("none");
                  setQuery("");
                }}
              >
                <Icon name="check" />
                Save project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
