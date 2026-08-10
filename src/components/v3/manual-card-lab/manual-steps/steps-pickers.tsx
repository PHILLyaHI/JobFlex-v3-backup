"use client";

// STEPS — sections 01 (The job) and 02 (Client).
//
// THE CLIENT FIELD IS THE ONE PLACE THIS PAGE EARNS A MODE SWITCH.
// "On file" and "Type a name" are genuinely different inputs, not two ways to
// do the same thing, and the union in `ClientChoice` already makes the third
// state (a record AND a typed name) unrepresentable. A segmented control is the
// honest picture of that union: two options, both visible, one live. A dropdown
// containing "— type a name instead —" hides half the model inside a menu.
//
// CREATE IS FOUR FIELDS, NOT SEVEN. The record type carries city / state / zip
// separately, but nothing on this page reads them apart — the summary prints a
// name and a way to reach them, and the tax estimator parses a free string. So
// the create form asks for one address line and leaves the split empty rather
// than charging the user three extra fields for a distinction the page never
// uses. Fewer fields IS the design here.
//
// ADDRESS AUTO-FILL IS ONE-WAY AND STICKY. Choosing a client fills the job
// address only while `addressAuto` holds; the first hand edit clears the flag
// forever, so a later client change can never silently overwrite typed work.
// The tax consequence of an address edit is owned by the content component —
// it belongs to section 03 and must not be duplicated here.

import type { ClientRecord, Draft, ProjectRecord } from "../manual-focus/manual-focus-types";
import { newId } from "../manual-focus/manual-focus-math";
import { useState } from "react";
import {
  Block,
  Btn,
  Field,
  Fields,
  Note,
  Select,
  Segmented,
  TextArea,
  TextInput,
} from "./steps-ui";
import s from "./manual-steps.module.css";

export type Patch = (next: Partial<Draft>) => void;

/** One line from a record, for the address field and the printed sheet. */
export function fullAddress(c: ClientRecord): string {
  const tail = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [c.address, tail].filter(Boolean).join(", ");
}

/* ══ 01 · THE JOB ═══════════════════════════════════════════════════════ */

export function JobCard({
  draft,
  patch,
  projects,
}: {
  draft: Draft;
  patch: Patch;
  projects: ProjectRecord[];
}) {
  const project = projects.find((p) => p.id === draft.projectId);

  return (
    <>
      <Block>
        <Fields>
          <Field label="Title" htmlFor="st-title">
            <TextInput
              id="st-title"
              value={draft.title}
              onChange={(title) => patch({ title })}
              placeholder="Patel Residence — Roof Replacement"
            />
          </Field>

          <Field label="Project" htmlFor="st-project" hint={project?.description}>
            <Select
              id="st-project"
              value={draft.projectId}
              onChange={(projectId) => patch({ projectId })}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </Fields>
      </Block>

      <Block title="Overview">
        <TextArea
          value={draft.description}
          onChange={(description) => patch({ description })}
          rows={5}
          placeholder="What this proposal covers, in the client's words."
        />
      </Block>
    </>
  );
}

/* ══ 02 · CLIENT ════════════════════════════════════════════════════════ */

type NewClient = { name: string; email: string; phone: string; address: string };
const BLANK_CLIENT: NewClient = { name: "", email: "", phone: "", address: "" };

export function ClientCard({
  draft,
  patch,
  clients,
  onCreateClient,
  onEditClient,
  onAddress,
}: {
  draft: Draft;
  patch: Patch;
  clients: ClientRecord[];
  onCreateClient: (rec: ClientRecord) => void;
  onEditClient: (id: string, next: Partial<ClientRecord>) => void;
  /** `auto` marks a machine fill, which leaves `addressAuto` standing. A hand
   *  edit (the default) clears it forever. */
  onAddress: (next: string, auto?: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewClient>(BLANK_CLIENT);

  // Narrowing a discriminated union dies the moment the reference is read
  // inside a callback, so the choice is pulled into a local first.
  const choice = draft.client;
  const mode = choice.mode === "freeText" ? "typed" : "file";
  const record = choice.mode === "record" ? clients.find((c) => c.id === choice.id) : undefined;
  const typedName = choice.mode === "freeText" ? choice.name : "";

  function choose(id: string) {
    if (!id) {
      patch({ client: { mode: "none" } });
      return;
    }
    const rec = clients.find((c) => c.id === id);
    const next: Partial<Draft> = { client: { mode: "record", id } };
    // Only while the address is still automatic — see the file header.
    if (rec && draft.addressAuto) {
      const line = fullAddress(rec);
      if (line) {
        onAddress(line, true);
        patch(next);
        return;
      }
    }
    patch(next);
  }

  function create() {
    const name = form.name.trim();
    if (!name) return;
    const rec: ClientRecord = {
      id: newId("cl"),
      name,
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      city: "",
      state: "",
      zip: "",
      tags: [],
    };
    onCreateClient(rec);
    patch({ client: { mode: "record", id: rec.id } });
    if (rec.address && draft.addressAuto) onAddress(rec.address, true);
    setForm(BLANK_CLIENT);
    setCreating(false);
  }

  return (
    <>
      <Block>
        <Fields>
          <Field label="Client">
            <Segmented
              ariaLabel="How the client is entered"
              value={mode}
              options={[
                { value: "file", label: "On file" },
                { value: "typed", label: "Type a name" },
              ]}
              onChange={(next) => {
                setCreating(false);
                if (next === "typed") patch({ client: { mode: "freeText", name: record?.name ?? "" } });
                else patch({ client: { mode: "none" } });
              }}
            />
          </Field>

          {mode === "file" ? (
            <Field label="On file" htmlFor="st-client">
              <Select
                id="st-client"
                value={choice.mode === "record" ? choice.id : ""}
                onChange={choose}
              >
                <option value="">Nobody chosen</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Name" htmlFor="st-client-typed">
              <TextInput
                id="st-client-typed"
                value={typedName}
                onChange={(name) => patch({ client: { mode: "freeText", name } })}
                placeholder="Whoever is signing"
              />
            </Field>
          )}
        </Fields>

        {mode === "file" && !creating ? (
          <div className={s.blockActions}>
            <Btn variant="quiet" onClick={() => setCreating(true)}>
              New client
            </Btn>
          </div>
        ) : null}

        {mode === "typed" ? (
          <div className={s.blockActions}>
            <Btn
              variant="quiet"
              onClick={() => {
                setForm({ ...BLANK_CLIENT, name: typedName });
                setCreating(true);
                patch({ client: { mode: "none" } });
              }}
            >
              Make a record
            </Btn>
            <Note>Typed names hold no contact details.</Note>
          </div>
        ) : null}
      </Block>

      {creating ? (
        <Block title="New client">
          <Fields>
            <Field label="Name" htmlFor="st-nc-name">
              <TextInput
                id="st-nc-name"
                value={form.name}
                onChange={(name) => setForm({ ...form, name })}
                placeholder="Anjali Patel"
              />
            </Field>
            <Field label="Email" htmlFor="st-nc-email">
              <TextInput
                id="st-nc-email"
                value={form.email}
                onChange={(email) => setForm({ ...form, email })}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Phone" htmlFor="st-nc-phone">
              <TextInput
                id="st-nc-phone"
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
                placeholder="(512) 555-0173"
              />
            </Field>
            <Field label="Address" htmlFor="st-nc-address">
              <TextInput
                id="st-nc-address"
                value={form.address}
                onChange={(address) => setForm({ ...form, address })}
                placeholder="3411 Wild Cherry Dr, Austin, TX 78704"
              />
            </Field>
          </Fields>
          <div className={s.blockActions}>
            <Btn variant="solid" onClick={create} disabled={!form.name.trim()}>
              Add client
            </Btn>
            <Btn
              variant="quiet"
              onClick={() => {
                setCreating(false);
                setForm(BLANK_CLIENT);
              }}
            >
              Cancel
            </Btn>
          </div>
        </Block>
      ) : null}

      {record ? (
        <Block title="Contact">
          <Fields>
            <Field label="Email" htmlFor="st-email">
              <TextInput
                id="st-email"
                value={record.email}
                onChange={(email) => onEditClient(record.id, { email })}
                placeholder="Nothing on file"
              />
            </Field>
            <Field label="Phone" htmlFor="st-phone">
              <TextInput
                id="st-phone"
                value={record.phone}
                onChange={(phone) => onEditClient(record.id, { phone })}
                placeholder="Nothing on file"
              />
            </Field>
          </Fields>
        </Block>
      ) : null}

      <Block title="Job address">
        <Fields>
          <Field
            label="Where the work happens"
            htmlFor="st-address"
            hint={draft.addressAuto ? "From the client record." : "Edited by hand."}
          >
            <TextInput
              id="st-address"
              value={draft.address}
              onChange={onAddress}
              placeholder="3411 Wild Cherry Dr, Austin, TX 78704"
            />
          </Field>
        </Fields>
      </Block>
    </>
  );
}
