"use client";

// CLIENT DETAIL / BLUEPRINT — the two dialogs behind Edit and Message.
//
// NO NEW DIALOG VOCABULARY. Both wear `mdl pmdl`, the frame the proposals
// module already publishes (`.content .pmdl .mdl-box / .mdl-head / .mdl-body /
// .mdl-foot / .mf / .mf-lbl / .mf-in`), and both open and close through
// blueprint-shell/mdl-motion so the enter and exit match every other dialog in
// the app. That module is always on — blueprint-shell applies its `.bp` class
// on every route — so a page deliberately absent from PAGE_STYLES can still
// draw the house dialog. This is also why they are not Radix: the project's
// modals are hand-rolled, and the in-house ones already carry the motion
// contract a library would replace.
//
// THE MOTION HELPERS ARE IMPERATIVE, so each dialog holds a ref and drives the
// element rather than swapping a `display` style from state. `closeMdl` needs
// the exit to play before `.open` comes off, and a React render that unmounted
// the box would cut the exit — the same asymmetry mdl-motion.ts was written to
// remove.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateClient } from "@/actions/clients";
import { clientChannels, messageClient, type ClientChannel } from "@/actions/clientMessage";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { Ic, cx } from "./cd-ui";
import styles from "./client-detail.module.css";

/** Server actions reject with text written for the reader ("Name is required",
 *  "Client not found"). Show that; fall back only for the transport failures
 *  that carry no useful message. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/**
 * The open/close contract, once, for both dialogs.
 *
 * Timeouts are tracked so an unmount mid-close cannot fire mdl-motion's cleanup
 * into a detached element — the same reason every behavior module in this
 * codebase owns an `after()` helper.
 */
function useMdl(onOpen?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [isOpen, setIsOpen] = useState(false);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const close = useCallback(() => {
    if (ref.current) closeMdl(ref.current, after);
    setIsOpen(false);
  }, [after]);

  const open = useCallback(() => {
    if (!ref.current) return;
    openMdl(ref.current);
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach(clearTimeout);
      set.clear();
    };
  }, []);

  // Escape closes, and stops there: the shell binds its own Escape for the
  // command palette and the handheld nav drawer, and one key press should not
  // dismiss two things.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  return { ref, open, close, isOpen };
}

/* ============================================================
   EDIT — the client's own particulars
   ============================================================ */

export type ClientEditValues = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

export type EditHandle = { open: () => void };

/**
 * The fields are exactly `updateClient`'s zod schema and nothing more.
 *
 * The band above this dialog also shows tags, "Client since" and "Last
 * contact", and none of them are editable here on purpose: the first is an
 * org-scoped join table with no write path in src/actions/clients.ts, and the
 * other two are derived timestamps. A field that silently discards what was
 * typed into it is worse than no field.
 */
export function ClientEditDialog({
  clientId,
  initial,
  handleRef,
}: {
  clientId: string | null;
  initial: ClientEditValues;
  handleRef: React.RefObject<EditHandle | null>;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reopening re-seeds from the record, so a cancelled edit is genuinely
  // cancelled rather than lingering in the box until a reload.
  const seed = useCallback(() => {
    setValues(initial);
    setError(null);
    // Focus after the enter animation has a frame to start, matching the
    // estimator picker's rAF-then-focus.
    requestAnimationFrame(() => requestAnimationFrame(() => firstFieldRef.current?.focus()));
  }, [initial]);

  // Destructured, not held as `mdl.*`: reading a property off an object that
  // carries a ref inside a render is what react-hooks/refs flags, and the two
  // callbacks are stable anyway.
  const { ref: mdlRef, open: openMdlDialog, close } = useMdl(seed);
  useEffect(() => {
    handleRef.current = { open: openMdlDialog };
  }, [handleRef, openMdlDialog]);

  const set = (k: keyof ClientEditValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !clientId) return;
    setBusy(true);
    setError(null);
    try {
      await updateClient(clientId, values);
      close();
      // The page is a server component reading the row it just changed, so the
      // refresh IS the update — no local copy of the client to keep in step.
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mdl pmdl" ref={mdlRef} role="dialog" aria-modal="true" aria-labelledby="cdEditTitle">
      <div className="mdl-bg" onClick={close} />
      <div className={cx("mdl-box", styles.mdlWide)}>
        <div className="mdl-head mdl-head--row">
          <span id="cdEditTitle">Edit client</span>
          <button className="mdl-x" type="button" onClick={close} aria-label="Close dialog">
            <Ic name="x" />
          </button>
        </div>

        <form className="mdl-body" onSubmit={submit} noValidate>
          <div className="mf">
            <label className="mf-lbl" htmlFor="cdName">
              Client name
            </label>
            <input
              className="mf-in"
              id="cdName"
              ref={firstFieldRef}
              value={values.name}
              onChange={set("name")}
              autoComplete="off"
            />
          </div>

          <div className={styles.mdlRow}>
            <div className="mf">
              <label className="mf-lbl" htmlFor="cdEmail">
                Email
              </label>
              <input
                className="mf-in"
                id="cdEmail"
                type="email"
                value={values.email}
                onChange={set("email")}
                autoComplete="off"
              />
            </div>
            <div className="mf">
              <label className="mf-lbl" htmlFor="cdPhone">
                Phone
              </label>
              <input
                className="mf-in"
                id="cdPhone"
                type="tel"
                value={values.phone}
                onChange={set("phone")}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="mf">
            <label className="mf-lbl" htmlFor="cdAddress">
              Street
            </label>
            <input
              className="mf-in"
              id="cdAddress"
              value={values.address}
              onChange={set("address")}
              autoComplete="off"
            />
          </div>

          {/* City / state / zip on one line because that is how the three are
              read on an envelope, and because the band above prints them as
              one sentence. */}
          <div className={styles.mdlRow3}>
            <div className="mf">
              <label className="mf-lbl" htmlFor="cdCity">
                City
              </label>
              <input className="mf-in" id="cdCity" value={values.city} onChange={set("city")} autoComplete="off" />
            </div>
            <div className="mf">
              <label className="mf-lbl" htmlFor="cdState">
                State
              </label>
              <input className="mf-in" id="cdState" value={values.state} onChange={set("state")} autoComplete="off" />
            </div>
            <div className="mf">
              <label className="mf-lbl" htmlFor="cdZip">
                ZIP
              </label>
              <input className="mf-in" id="cdZip" value={values.zip} onChange={set("zip")} autoComplete="off" />
            </div>
          </div>
        </form>

        {error ? <div className="mf-err mf-err--boxed">{error}</div> : null}

        <div className="mdl-foot">
          <button className="btn btn-ghost" type="button" onClick={close}>
            Cancel
          </button>
          <button
            className={cx("btn", "btn-primary", busy && "is-busy")}
            type="button"
            onClick={submit}
            disabled={busy}
          >
            <Ic name="check" />
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MESSAGE — one composer, two channels
   ============================================================ */

export type MessageHandle = { open: () => void };

/**
 * Email or text, chosen at the top of the box.
 *
 * The channels are READ FROM THE SERVER when the dialog opens rather than
 * inferred from the props: whether the org has a Twilio number is not something
 * the record page knows, and a Text tab that only fails after the message is
 * typed is worse than one that says why it is off before a word is written.
 */
export function ClientMessageDialog({
  clientId,
  clientName,
  handleRef,
}: {
  clientId: string | null;
  clientName: string;
  handleRef: React.RefObject<MessageHandle | null>;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<ClientChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [reach, setReach] = useState<{
    email: string | null;
    phone: string | null;
    smsConfigured: boolean;
  } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const seed = useCallback(() => {
    setSubject("");
    setBody("");
    setError(null);
    setSent(null);
    setReach(null);
    if (clientId) {
      clientChannels(clientId)
        .then((r) => {
          setReach(r);
          // Open on the channel that can actually reach them. Email leads when
          // both work — it carries a subject and a paper trail; a text is the
          // fallback for a client with no address on file.
          setChannel(r.email ? "email" : "sms");
        })
        .catch((err) => setError(actionError(err)));
    }
    requestAnimationFrame(() => requestAnimationFrame(() => bodyRef.current?.focus()));
  }, [clientId]);

  // Destructured, not held as `mdl.*`: reading a property off an object that
  // carries a ref inside a render is what react-hooks/refs flags, and the two
  // callbacks are stable anyway.
  const { ref: mdlRef, open: openMdlDialog, close } = useMdl(seed);
  useEffect(() => {
    handleRef.current = { open: openMdlDialog };
  }, [handleRef, openMdlDialog]);

  // Why the SELECTED channel cannot be used, or null. One string, shown under
  // the composer and used to hold the Send button off — see the note on the
  // chips about why this is not a `disabled` attribute on them.
  const blocked =
    channel === "email"
      ? reach && !reach.email
        ? `${clientName} has no email on file — add one with Edit.`
        : null
      : reach && !reach.phone
        ? `${clientName} has no phone number on file — add one with Edit.`
        : reach && !reach.smsConfigured
          ? "Texting needs a Twilio number. Set one up on the Phone page."
          : null;

  async function send() {
    if (busy || !clientId || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await messageClient({ clientId, channel, subject, body });
      // `delivered: false` means the transport is switched off in this
      // environment and the message went to a server log. Saying "Sent" there
      // would be a lie the contractor only discovers from the client.
      setSent(
        res.delivered
          ? `${res.channel === "email" ? "Emailed" : "Texted"} ${res.to}`
          : `Logged against the record — the ${res.channel === "email" ? "email" : "SMS"} transport is switched off in this environment, so nothing left the building.`,
      );
      setBody("");
      setSubject("");
      // The send is logged as an ActivityEvent, and the Activity card is
      // reading that table — so the refresh puts the message on the record.
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mdl pmdl" ref={mdlRef} role="dialog" aria-modal="true" aria-labelledby="cdMsgTitle">
      <div className="mdl-bg" onClick={close} />
      <div className={cx("mdl-box", styles.mdlWide)}>
        <div className="mdl-head mdl-head--row">
          <span id="cdMsgTitle">Message {clientName}</span>
          <button className="mdl-x" type="button" onClick={close} aria-label="Close dialog">
            <Ic name="x" />
          </button>
        </div>

        <div className="mdl-body">
          {/* The channel is a two-button group, not a select: there are exactly
              two and both are worth reading at a glance.

              NEITHER CHIP IS EVER DISABLED, even when its channel cannot be
              used. A disabled chip refuses the click and explains nothing —
              the reason ("no phone on file", "texting needs a Twilio number")
              only renders for the SELECTED channel, so disabling the one with
              the problem is exactly how you hide the answer from the person
              looking for it. Selecting it shows the reason and it is the Send
              button that stays off. */}
          <div className={styles.chips} role="group" aria-label="Send by">
            <button
              type="button"
              aria-pressed={channel === "email"}
              className={cx(styles.chip, channel === "email" && styles.chipOn)}
              onClick={() => setChannel("email")}
            >
              Email
            </button>
            <button
              type="button"
              aria-pressed={channel === "sms"}
              className={cx(styles.chip, channel === "sms" && styles.chipOn)}
              onClick={() => setChannel("sms")}
            >
              Text
            </button>
          </div>

          {channel === "email" ? (
            <div className="mf">
              <label className="mf-lbl" htmlFor="cdSubject">
                Subject
              </label>
              <input
                className="mf-in"
                id="cdSubject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="About your roof proposal"
                autoComplete="off"
              />
            </div>
          ) : null}

          <div className="mf">
            <label className="mf-lbl" htmlFor="cdBody">
              Message
            </label>
            <textarea
              className={cx("mf-in", styles.mdlArea)}
              id="cdBody"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={
                channel === "email"
                  ? "Hi — following up on the garage re-roof…"
                  : "Hi — following up on the garage re-roof."
              }
            />
          </div>

          {blocked ? <div className="mf-note">{blocked}</div> : null}
          {sent ? <div className="mf-note">{sent}</div> : null}
        </div>

        {error ? <div className="mf-err mf-err--boxed">{error}</div> : null}

        <div className="mdl-foot">
          <button className="btn btn-ghost" type="button" onClick={close}>
            Close
          </button>
          <button
            className={cx("btn", "btn-primary", busy && "is-busy")}
            type="button"
            onClick={send}
            disabled={busy || !!blocked || body.trim().length === 0}
          >
            <Ic name="send" />
            {busy ? "Sending…" : channel === "email" ? "Send email" : "Send text"}
          </button>
        </div>
      </div>
    </div>
  );
}
