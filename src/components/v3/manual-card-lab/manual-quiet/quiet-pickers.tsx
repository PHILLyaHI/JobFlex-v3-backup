"use client";

// QUIET — the two pickers (client, project).
//
// Hand-rolled popovers: this codebase has no Radix and the house pattern is an
// in-house dialog. A native <select> was the other option and it loses here for
// one reason — the client list needs a second line per option ("Austin, TX",
// "No contact on file") and <option> cannot carry one. The project picker keeps
// the same shell so the two fields read as one control type rather than two.
//
// The client field is THREE modes in one union (`ClientChoice`) rather than
// three booleans, so "a record AND a typed name" is unrepresentable. Whichever
// mode is live, exactly one extra control appears under the trigger — never
// two — which is what keeps this card short.
//
// A11y: the trigger carries the field name in its own aria-label, because a
// <label for> pointing at a popover button names the button and orphans the
// word. Escape closes; a mousedown anywhere outside closes; the panel is
// keyboard-reachable in DOM order.

import { useEffect, useId, useRef, useState } from "react";
import type { ClientChoice, ClientRecord, ProjectRecord } from "../manual-focus/manual-focus-types";
import { newId } from "../manual-focus/manual-focus-math";
import styles from "./manual-quiet.module.css";
import { Btn, Field, Ic, TextField, cx } from "./quiet-ui";

/* ============================================================
   POPOVER SHELL
   ============================================================ */

function Picker({
  ariaLabel,
  display,
  empty,
  children,
}: {
  ariaLabel: string;
  display: string;
  empty?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.picker} ref={rootRef}>
      <button
        type="button"
        className={cx(styles.pickTrigger, empty && styles.pickEmpty)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{display}</span>
        <Ic name="chev" />
      </button>
      {open ? (
        <div className={styles.pickPanel} role="listbox" aria-label={ariaLabel}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function Opt({
  on,
  label,
  sub,
  onClick,
}: {
  on: boolean;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      className={cx(styles.pickOpt, on && styles.pickOptOn)}
      onClick={onClick}
    >
      <span>
        {label}
        {sub ? <span className={styles.pickSub}>{sub}</span> : null}
      </span>
      {on ? <Ic name="check" /> : null}
    </button>
  );
}

/* ============================================================
   PROJECT
   ============================================================ */

export function ProjectField({
  projects,
  value,
  onChange,
}: {
  projects: ProjectRecord[];
  value: string;
  onChange: (id: string) => void;
}) {
  const current = projects.find((p) => p.id === value);
  return (
    <Field label="Project">
      <Picker
        ariaLabel="Project"
        display={current?.name ?? "No project"}
        empty={!current}
      >
        {(close) => (
          <>
            <Opt
              on={value === ""}
              label="No project"
              onClick={() => {
                onChange("");
                close();
              }}
            />
            <div className={styles.pickDiv} />
            {projects.map((p) => (
              <Opt
                key={p.id}
                on={p.id === value}
                label={p.name}
                sub={p.description}
                onClick={() => {
                  onChange(p.id);
                  close();
                }}
              />
            ))}
          </>
        )}
      </Picker>
    </Field>
  );
}

/* ============================================================
   CLIENT
   ============================================================ */

/** A blank record for the inline create form. Only the four fields a
 *  contractor actually has at proposal time; the rest arrive later. */
const BLANK = { name: "", email: "", phone: "", address: "", city: "", state: "", zip: "" };

export function ClientField({
  clients,
  choice,
  onChoice,
  onCreate,
}: {
  clients: ClientRecord[];
  choice: ClientChoice;
  onChoice: (next: ClientChoice) => void;
  /** Appends to the local roster and selects the new record. */
  onCreate: (rec: ClientRecord) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const nameId = useId();

  const record = choice.mode === "record" ? clients.find((c) => c.id === choice.id) : undefined;
  const display =
    choice.mode === "record"
      ? (record?.name ?? "No client")
      : choice.mode === "freeText"
        ? choice.name.trim() || "Typed name"
        : "No client";

  const set = (k: keyof typeof BLANK, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <Field label="Client">
        <Picker ariaLabel="Client" display={display} empty={choice.mode === "none"}>
          {(close) => (
            <>
              {clients.map((c) => (
                <Opt
                  key={c.id}
                  on={choice.mode === "record" && choice.id === c.id}
                  label={c.name}
                  sub={
                    c.city ? `${c.city}, ${c.state}` : c.email || "No contact details on file"
                  }
                  onClick={() => {
                    setCreating(false);
                    onChoice({ mode: "record", id: c.id });
                    close();
                  }}
                />
              ))}
              <div className={styles.pickDiv} />
              <Opt
                on={choice.mode === "freeText"}
                label="Type a name instead"
                onClick={() => {
                  setCreating(false);
                  onChoice({ mode: "freeText", name: "" });
                  close();
                }}
              />
              <Opt
                on={creating}
                label="Add a new client"
                onClick={() => {
                  setForm(BLANK);
                  setCreating(true);
                  close();
                }}
              />
            </>
          )}
        </Picker>
      </Field>

      {choice.mode === "freeText" && !creating ? (
        <Field label="Name" htmlFor={nameId}>
          <TextField
            id={nameId}
            value={choice.name}
            onChange={(v) => onChoice({ mode: "freeText", name: v })}
            placeholder="Who is this for?"
          />
        </Field>
      ) : null}

      {creating ? (
        <>
          <Field label="New client">
            <TextField
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder="Name"
              ariaLabel="New client name"
            />
          </Field>
          <div className={styles.grid2}>
            <Field label="Email" small>
              <TextField
                value={form.email}
                onChange={(v) => set("email", v)}
                ariaLabel="New client email"
              />
            </Field>
            <Field label="Phone" small>
              <TextField
                value={form.phone}
                onChange={(v) => set("phone", v)}
                ariaLabel="New client phone"
              />
            </Field>
          </div>
          <Field label="Address" small>
            <TextField
              value={form.address}
              onChange={(v) => set("address", v)}
              placeholder="Street, city, state ZIP"
              ariaLabel="New client address"
            />
          </Field>
          <div className={styles.rowActions}>
            <Btn
              tone="primary"
              onClick={() => {
                const name = form.name.trim();
                if (!name) return;
                // The address is typed as one line here, so it is stored as one
                // line: splitting a free-text string into street/city/state/zip
                // by guesswork is how a record ends up with "TX 78704" as its
                // city. The tax estimate reads the same single line anyway.
                onCreate({
                  id: newId("cl"),
                  name,
                  email: form.email.trim(),
                  phone: form.phone.trim(),
                  address: form.address.trim(),
                  city: "",
                  state: "",
                  zip: "",
                  tags: [],
                });
                setCreating(false);
              }}
            >
              Add client
            </Btn>
            <Btn tone="quiet" onClick={() => setCreating(false)}>
              Cancel
            </Btn>
          </div>
        </>
      ) : null}
    </>
  );
}
