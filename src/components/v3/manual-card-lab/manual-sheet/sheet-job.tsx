"use client";

// CHAPTERS — chapter 1, "The job": brief sections 01 (job) and 02 (client).
//
// Route: /dashboard/manual-sheet.
//
// THE CLIENT PICKER IS CLOSED BY DEFAULT, and that single decision is what keeps
// this chapter short. A chosen client is an IDENTITY — a name at 20px and two
// muted lines under it — not five fields; the list of records only exists while
// you are changing it. Rendering the picker permanently would put a 260px
// scrolling list of names inside a card whose actual subject is one line of
// text, which is the "too many things in the card" the owner rejected.
//
// The address is the hinge between this chapter and the money. It auto-fills
// from the chosen record ONLY while `addressAuto` holds, and the moment it is
// typed in it stops tracking, so picking a different client later can never
// silently rewrite an address someone entered by hand. The tax consequence of
// an address edit lives in the parent (see manual-sheet-content), because the
// rate it moves is printed two chapters away.

import { useState } from "react";
import type {
  ClientChoice,
  ClientRecord,
  Draft,
  ProjectRecord,
} from "../manual-focus/manual-focus-types";
import s from "./manual-sheet.module.css";
import { BlockHead, Btn, Field, Select, TextArea, TextBtn, TextIn } from "./sheet-ui";

/** One line, from the record's four address parts. Empty parts drop out rather
 *  than leaving ", ," on the sheet. */
export function fullAddress(c: ClientRecord): string {
  const tail = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [c.address, tail].filter(Boolean).join(", ");
}

type NewClient = { name: string; email: string; phone: string; address: string };

const EMPTY_NEW: NewClient = { name: "", email: "", phone: "", address: "" };

export function ChapterJob({
  draft,
  patch,
  clients,
  projects,
  onChooseClient,
  onEditClient,
  onCreateClient,
  onAddress,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  clients: ClientRecord[];
  projects: ProjectRecord[];
  onChooseClient: (choice: ClientChoice) => void;
  onEditClient: (id: string, p: Partial<ClientRecord>) => void;
  onCreateClient: (rec: NewClient) => void;
  onAddress: (value: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<NewClient>(EMPTY_NEW);

  // Hoisted before the discriminant is read: TS drops the narrowing of a nested
  // property as soon as it is used inside a callback, and `find` takes one.
  const choice = draft.client;
  const record =
    choice.mode === "record" ? (clients.find((c) => c.id === choice.id) ?? null) : null;

  const chosenName =
    record?.name ?? (draft.client.mode === "freeText" ? draft.client.name.trim() : "");

  const projectOptions = [
    { value: "", label: "No project" },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];

  const mode: "record" | "freeText" = draft.client.mode === "freeText" ? "freeText" : "record";

  const submitNew = () => {
    if (!fresh.name.trim()) return;
    onCreateClient(fresh);
    setFresh(EMPTY_NEW);
    setCreating(false);
    setPicking(false);
  };

  return (
    <>
      {/* ---- 01 JOB ---- */}
      <div className={s.block}>
        <BlockHead num="01" name="Job" />
        <div className={s.fields}>
          <Field label="Title">
            {(id) => (
              <TextIn
                id={id}
                value={draft.title}
                onChange={(v) => patch({ title: v })}
                placeholder="What are you quoting?"
              />
            )}
          </Field>

          <Field label="Project">
            {(id) => (
              <Select
                id={id}
                value={draft.projectId}
                options={projectOptions}
                onChange={(v) => patch({ projectId: v })}
              />
            )}
          </Field>

          <Field label="Overview">
            {(id) => (
              <TextArea
                id={id}
                value={draft.description}
                onChange={(v) => patch({ description: v })}
                placeholder="A short paragraph the client reads first."
              />
            )}
          </Field>
        </div>
      </div>

      {/* ---- 02 CLIENT ---- */}
      <div className={s.block}>
        <BlockHead num="02" name="Client" />

        <div className={s.identity}>
          <div>
            <div className={s.identityName}>{chosenName || "No client yet"}</div>
            {record ? (
              <div className={s.identityMeta}>
                {record.email || record.phone
                  ? [record.email, record.phone].filter(Boolean).join(" · ")
                  : "No contact details on file."}
              </div>
            ) : (
              <div className={s.identityMeta}>
                {draft.client.mode === "freeText"
                  ? "Typed onto the sheet — no record."
                  : "Pick one on file, or type a name."}
              </div>
            )}
          </div>
          <TextBtn onClick={() => setPicking((v) => !v)} quiet>
            {picking ? "Done" : "Change"}
          </TextBtn>
        </div>

        {picking ? (
          <div className={s.picker}>
            <div className={s.pickActions}>
              <div className={s.seg} role="group" aria-label="Client source">
                <button
                  type="button"
                  className={[s.segBtn, mode === "record" ? s.isOn : null]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={mode === "record"}
                  onClick={() => onChooseClient({ mode: "none" })}
                >
                  On file
                </button>
                <button
                  type="button"
                  className={[s.segBtn, mode === "freeText" ? s.isOn : null]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={mode === "freeText"}
                  onClick={() => onChooseClient({ mode: "freeText", name: chosenName })}
                >
                  Type a name
                </button>
              </div>
              <div className={s.footSpacer} />
              {mode === "record" ? (
                <TextBtn onClick={() => setCreating((v) => !v)}>
                  {creating ? "Cancel" : "New client"}
                </TextBtn>
              ) : null}
            </div>

            {mode === "freeText" ? (
              <Field label="Name">
                {(id) => (
                  <TextIn
                    id={id}
                    value={draft.client.mode === "freeText" ? draft.client.name : ""}
                    onChange={(v) => onChooseClient({ mode: "freeText", name: v })}
                    placeholder="Who is this for?"
                  />
                )}
              </Field>
            ) : creating ? (
              <div className={s.fields}>
                <Field label="Name">
                  {(id) => (
                    <TextIn
                      id={id}
                      value={fresh.name}
                      onChange={(v) => setFresh({ ...fresh, name: v })}
                    />
                  )}
                </Field>
                <div className={s.row2}>
                  <Field label="Email">
                    {(id) => (
                      <TextIn
                        id={id}
                        value={fresh.email}
                        onChange={(v) => setFresh({ ...fresh, email: v })}
                      />
                    )}
                  </Field>
                  <Field label="Phone">
                    {(id) => (
                      <TextIn
                        id={id}
                        value={fresh.phone}
                        onChange={(v) => setFresh({ ...fresh, phone: v })}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Address">
                  {(id) => (
                    <TextIn
                      id={id}
                      value={fresh.address}
                      onChange={(v) => setFresh({ ...fresh, address: v })}
                      placeholder="Street, city, ST ZIP"
                    />
                  )}
                </Field>
                <div className={s.pickActions}>
                  <Btn tone="primary" onClick={submitNew}>
                    Save client
                  </Btn>
                </div>
              </div>
            ) : (
              <div className={s.pickList} role="listbox" aria-label="Clients on file">
                {clients.map((c) => {
                  const on = draft.client.mode === "record" && draft.client.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={[s.pickRow, on ? s.isOn : null].filter(Boolean).join(" ")}
                      onClick={() => {
                        onChooseClient({ mode: "record", id: c.id });
                        setPicking(false);
                      }}
                    >
                      <span>{c.name}</span>
                      <span className={s.pickMeta}>
                        {[c.city, c.state].filter(Boolean).join(", ") || "No address"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {record ? (
          <div className={[s.row2, s.stackTop].join(" ")}>
            <Field label="Email">
              {(id) => (
                <TextIn
                  id={id}
                  value={record.email}
                  onChange={(v) => onEditClient(record.id, { email: v })}
                  placeholder="None on file"
                />
              )}
            </Field>
            <Field label="Phone">
              {(id) => (
                <TextIn
                  id={id}
                  value={record.phone}
                  onChange={(v) => onEditClient(record.id, { phone: v })}
                  placeholder="None on file"
                />
              )}
            </Field>
          </div>
        ) : null}

        <div className={[s.fields, s.stackTop].join(" ")}>
          <Field
            label="Job address"
            hint={draft.addressAuto ? "From the client record." : undefined}
          >
            {(id) => (
              <TextIn
                id={id}
                value={draft.address}
                onChange={onAddress}
                placeholder="Where the work happens"
              />
            )}
          </Field>
        </div>
      </div>
    </>
  );
}
