"use client";

// Homeowner portal — the project wizard (`.win`), ported from the donor's
// `mountWizard()`.
//
// The donor re-renders the whole pane with innerHTML on every keystroke and
// then hand-restores the caret; React owns the same DOM here, so the caret
// survives on its own and the emitted markup is byte-for-byte the donor's:
// same elements, same class names, same order, same inline animation delays.
//
// Two places keep the donor's imperative approach on purpose:
//   - the placeholder typewriter writes straight to the textarea's
//     `placeholder` attribute through a ref (the donor's `w.tick()`), so a
//     34ms keystroke cadence never re-renders the pane;
//   - drag-and-drop binds native listeners on `.win`, because the donor's
//     dragleave test reads `relatedTarget` against that exact element.

import { useCallback, useEffect, useRef, useState } from "react";
import { submitHomeownerRequest } from "@/actions/homeowner";
import {
  CATEGORIES,
  CONTACT_FIELDS,
  KEYWORDS,
  PLACEHOLDERS,
  QUESTIONS,
  STEP_NAMES,
  type Question,
} from "./homeowner-data";

type Upload = { name: string; kind: "pdf" | "photo"; progress: number };

const UID = "w0";

/* Contact-form validation. The donor shipped these four inputs inert — you
   could send an empty form — so the owner asked for everything not marked
   "(optional)" to be required. Optionality is read off the label rather than
   hardcoded by index, so editing CONTACT_FIELDS stays a one-place change. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isOptional = (label: string) => /\(optional\)/i.test(label);

/* Keyboard/autofill hints, likewise derived from the label. */
function fieldProps(label: string) {
  const l = label.toLowerCase();
  if (l.includes("email")) return { type: "email", autoComplete: "email" as const };
  if (l.includes("phone")) return { type: "tel", autoComplete: "tel" as const };
  if (l.includes("zip")) return { type: "text", inputMode: "numeric" as const, autoComplete: "postal-code" as const };
  return { type: "text", autoComplete: "name" as const };
}

export function HomeownerWizard() {
  const [step, setStep] = useState(0);
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showCats, setShowCats] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [contact, setContact] = useState<string[]>(() => CONTACT_FIELDS.map(() => ""));
  const [thinking, setThinking] = useState(false);
  const [drag, setDrag] = useState(false);
  /* The Lead Center write. The donor's wizard had no submit target at all —
     step 4 was a static "done" pane — so this is the one behaviour added to
     the port (owner, 2026-08-23: "connect the homeowner portal blueprint
     design with the lead center"). `sending` blocks a double-send; `sendErr`
     keeps the wizard on the contact step when the write is refused, because a
     "we've sent it" pane over a failed submission is the one outcome worse
     than an error. */
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");

  const winRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const placeholderRef = useRef(PLACEHOLDERS[0]);
  const reducedRef = useRef(false);

  /* ---- donor detect(): keyword sniff on the description ----
     The donor keeps `suggested` on its state object and re-runs detect() from
     the input handler, but the value is a pure function of (desc, category):
     every path that cleared it by hand also set a category (the guess button,
     picking from the tray) or reset the description (Start another project),
     and each of those makes this expression return null on its own. So it is
     derived here — same value at every point in the flow, no extra render. */
  let suggested: string | null = null;
  if (!category) {
    let hit: string | null = null;
    for (let i = 0; i < KEYWORDS.length; i++) {
      if (KEYWORDS[i][0].test(desc)) {
        hit = KEYWORDS[i][1];
        break;
      }
    }
    suggested = hit && desc.length > 8 ? hit : null;
  }

  const qs: Question[] = QUESTIONS[category ?? ""] || QUESTIONS["default"];
  /* Donor gate was `> 12` — a whole phrase before the button woke up, which
     read as broken. One character is enough now (owner's call). */
  const canRefine = desc.trim().length > 0;
  const catLabel = category || suggested || "project";

  /* Every non-optional contact field filled, and the email actually shaped
     like one — otherwise "Send to contractors" stays disabled. */
  const canSend = CONTACT_FIELDS.every((f, i) => {
    const v = (contact[i] || "").trim();
    if (isOptional(f)) return true;
    if (!v) return false;
    return f.toLowerCase().includes("email") ? EMAIL_RE.test(v) : true;
  });

  /* ---- send: the donor's dead button, wired ----
     CONTACT_FIELDS is ["Full name", "Email", "Phone (optional)", "ZIP code"],
     so the four answers map positionally. The scope answers ride along in the
     description because `submitHomeownerRequest` takes one free-text body —
     the same shape the marketing intake posts. Attachments are NOT sent: the
     donor's uploader never leaves the browser and giving it a real destination
     is a storage decision, not a wiring one. */
  const send = useCallback(async () => {
    if (sending) return;
    setSendErr("");
    setSending(true);
    const [name, email, phone, zip] = contact.map((v) => v.trim());
    const extra = answers
      .map((a, i) => (a && a.trim() && qs[i] ? qs[i].q + " " + a.trim() : ""))
      .filter(Boolean)
      .join("\n");
    try {
      await submitHomeownerRequest({
        name,
        email,
        phone: phone || undefined,
        zip: zip || undefined,
        projectType: category ?? undefined,
        description: extra ? desc.trim() + "\n\n" + extra : desc.trim(),
      });
      setStep(4);
    } catch (err) {
      setSendErr(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't send that. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }, [sending, contact, answers, category, desc, qs]);

  /* ---- head: donor renderHead() ---- */
  let headLabel = step < 4 ? STEP_NAMES[step] : "Done";
  if (step === 1 && category) headLabel += " · " + category;

  /* ---- donor go(n): 850ms thinking pane between steps ---- */
  const go = useCallback((n: number) => {
    setThinking(true);
    window.setTimeout(
      () => {
        setThinking(false);
        setStep(n);
      },
      reducedRef.current ? 0 : 850,
    );
  }, []);

  /* ---- donor addFiles(): cap 6, 22-char name ellipsis ---- */
  const addFiles = useCallback((list: FileList) => {
    const next: Upload[] = [];
    for (let i = 0; i < list.length && i < 6; i++) {
      const f = list[i];
      const nm = f.name || "file";
      const type = f.type || "";
      next.push({
        name: nm.length > 22 ? nm.slice(0, 19) + "…" : nm,
        kind: type.indexOf("pdf") > -1 ? "pdf" : "photo",
        progress: 0,
      });
    }
    setUploads((prev) => prev.concat(next).slice(0, 6));
  }, []);

  /* ---- donor pump(): 160ms upload ticker, +12 + rand*18 per beat ---- */
  useEffect(() => {
    if (!uploads.some((u) => u.progress < 100)) return;
    const id = window.setInterval(() => {
      setUploads((prev) =>
        prev.map((u) =>
          u.progress < 100
            ? { ...u, progress: Math.min(100, u.progress + 12 + Math.random() * 18) }
            : u,
        ),
      );
    }, 160);
    return () => window.clearInterval(id);
  }, [uploads]);

  /* ---- donor placeholder machine: types forward at 34ms, erases at 12ms ---- */
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedRef.current) return;
    let pi = 0;
    let ci = 0;
    let dir = 1;
    let timer = 0;
    const tick = () => {
      const target = PLACEHOLDERS[pi];
      ci += dir;
      if (ci >= target.length + 24) {
        dir = -1;
        ci = target.length;
      }
      if (ci <= 0 && dir === -1) {
        dir = 1;
        pi = (pi + 1) % PLACEHOLDERS.length;
      }
      placeholderRef.current = target.slice(0, Math.max(0, Math.min(ci, target.length)));
      if (descRef.current) descRef.current.placeholder = placeholderRef.current;
      timer = window.setTimeout(tick, dir === 1 ? 34 : 12);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  /* Callback ref — a freshly mounted textarea picks up the machine's current
     frame immediately, exactly as the donor's render() did. */
  const attachDesc = useCallback((el: HTMLTextAreaElement | null) => {
    descRef.current = el;
    if (el) el.placeholder = placeholderRef.current;
  }, []);

  /* ---- donor: click outside `.cat-wrap` closes the category tray ---- */
  useEffect(() => {
    if (!showCats) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const w = t && t.closest ? t.closest(".cat-wrap") : null;
      if (w && winRef.current && winRef.current.contains(w)) return;
      setShowCats(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [showCats]);

  /* ---- donor: drag-and-drop onto the whole window ---- */
  useEffect(() => {
    const root = winRef.current;
    if (!root) return;
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      setDrag(true);
    };
    const onLeave = (e: DragEvent) => {
      if (e.target === root || !root.contains(e.relatedTarget as Node)) setDrag(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    };
    root.addEventListener("dragover", onOver);
    root.addEventListener("dragleave", onLeave);
    root.addEventListener("drop", onDrop);
    return () => {
      root.removeEventListener("dragover", onOver);
      root.removeEventListener("dragleave", onLeave);
      root.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  const setAnswer = (i: number, v: string) => {
    setAnswers((prev) => {
      const next = prev.slice();
      next[i] = v;
      return next;
    });
  };

  /* ================= PANES ================= */

  const paneDescribe = (
    <div className="pane">
      <textarea ref={attachDesc} className="desc" rows={3} aria-label="Describe your project"
        value={desc} onChange={(e) => setDesc(e.target.value)} />

      {suggested && !category ? (
        <button className="guess" type="button"
          onClick={() => setCategory(suggested)}>
          <i />Looks like: {suggested} — tap to confirm
        </button>
      ) : null}

      {uploads.length ? (
        <div className="ups">
          {uploads.map((u, i) => (
            <span className="up" key={i}>
              <svg className="ic"><use href={u.kind === "pdf" ? "#i-doc" : "#i-img"} /></svg>
              {u.name}
              {u.progress >= 100 ? (
                <span className="up-ok">✓</span>
              ) : (
                <span className="up-bar"><span style={{ width: u.progress + "%" }} /></span>
              )}
            </span>
          ))}
        </div>
      ) : null}

      <div className="tools">
        <input ref={fileRef} type="file" className="file" multiple accept="image/*,video/*,.pdf"
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files && e.target.files.length) addFiles(e.target.files); }} />
        <button className="tool tool-photo" type="button" onClick={() => fileRef.current?.click()}>
          <svg className="ic"><use href="#i-img" /></svg>Photos &amp; video
        </button>
        <div className="cat-wrap">
          <button className={"tool tool-cat" + (category ? " on" : "")} type="button"
            onClick={(e) => { e.stopPropagation(); setShowCats((v) => !v); }}>
            <svg className="ic"><use href="#i-grid" /></svg>{category || "Category"}
          </button>
          <div className={"cats" + (showCats ? " open" : "")}>
            <div className="cats-in">
              {CATEGORIES.map((c) => (
                <button key={c} className={"cat" + (category === c ? " on" : "")} type="button"
                  data-cat={c}
                  onClick={() => { setCategory(c); setShowCats(false); }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className="go go-refine" type="button" disabled={!canRefine}
          onClick={() => {
            if (!canRefine) return;
            setAnswers(qs.map(() => ""));
            go(1);
          }}>
          <svg className="ic"><use href="#i-bulb" /></svg>Refine instructions
        </button>
      </div>
    </div>
  );

  const paneClarify = (
    <div className="pane qs">
      <div className="qs-h">A few quick questions to sharpen the scope</div>
      {qs.map((it, i) => {
        const id = UID + "q" + i;
        return (
          <div className="q" key={i} style={{ animationDelay: i * 0.09 + "s" }}>
            <label className="q-l" htmlFor={id}>{i + 1}. {it.q}</label>
            <input className="q-in" id={id} data-q={i} placeholder={it.hint}
              value={answers[i] || ""} onChange={(e) => setAnswer(i, e.target.value)} />
            {it.chips ? (
              <div className="chips">
                {it.chips.map((v) => (
                  <button key={v} className={"chip" + (answers[i] === v ? " on" : "")} type="button"
                    data-q={i} data-v={v} onClick={() => setAnswer(i, v)}>
                    {v}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="pane-foot">
        <button className="back" type="button" data-to="0" onClick={() => setStep(0)}>‹ Back</button>
        <button className="go go-scope" type="button" onClick={() => go(2)}>Generate my scope</button>
      </div>
    </div>
  );

  /* Scope sheet — `d` counts only the answered questions, so the stagger runs
     0.12s, 0.22s, … with no gaps for skipped ones (donor behavior). */
  let d = 0;
  const scopeRows: React.ReactNode[] = [];
  qs.forEach((it, i) => {
    if (answers[i]) {
      scopeRows.push(
        <div className="sl" key={i} style={{ animationDelay: 0.12 + d * 0.1 + "s" }}>
          <i>✓</i><span><b>{it.q}</b> {answers[i]}</span>
        </div>,
      );
      d++;
    }
  });
  if (uploads.length) {
    scopeRows.push(
      <div className="sl" key="att" style={{ animationDelay: 0.12 + d * 0.1 + "s" }}>
        <i>✓</i><span><b>Attachments:</b> {uploads.length} file{uploads.length > 1 ? "s" : ""} included</span>
      </div>,
    );
  }

  const paneScope = (
    <div className="pane qs">
      <div className="scope-head">
        <span className="qs-h">Your Scope of Work</span>
        <span className="scope-stamp">Structured by JobFlex</span>
      </div>
      <div className="sheet">
        <div className="sheet-n">Scope of work · {catLabel}</div>
        <p className="sheet-p">{desc.trim() || "Homeowner project description."}</p>
        <div className="sheet-list">{scopeRows}</div>
      </div>
      <div className="pane-foot">
        <button className="back" type="button" data-to="1" onClick={() => setStep(1)}>‹ Back</button>
        <button className="go go-contact" type="button" onClick={() => setStep(3)}>Looks right — get quotes</button>
      </div>
    </div>
  );

  const paneContact = (
    <div className="pane qs">
      <div className="qs-h">Where should the quotes go?</div>
      <p className="pane-lede">Verified local contractors reply with line-item proposals. No calls until you choose.</p>
      <div className="cform">
        {CONTACT_FIELDS.map((f, i) => {
          const id = UID + "c" + i;
          const optional = isOptional(f);
          return (
            <div key={f}>
              <label className="fld-l" htmlFor={id}>{f}</label>
              <input className="q-in c-in" id={id} placeholder={f} required={!optional}
                aria-required={!optional} {...fieldProps(f)}
                value={contact[i]} onChange={(e) => {
                  const v = e.target.value;
                  setContact((prev) => { const next = prev.slice(); next[i] = v; return next; });
                }} />
            </div>
          );
        })}
      </div>
      {/* A refused send keeps the homeowner on this step with their answers
          intact, and says why. Without it the only signal would be a button
          that stopped saying "Sending…". */}
      {sendErr ? (
        <div className="send-err" role="alert">
          {sendErr}
        </div>
      ) : null}
      <div className="pane-foot">
        <button className="back" type="button" data-to="2" onClick={() => setStep(2)}>‹ Back</button>
        {/* Gated with the donor's own `.go:disabled` styling — the same
            affordance "Refine instructions" already uses on step 0, so the
            rule stays legible without adding a new error state. */}
        <button className="go go-send" type="button" disabled={!canSend || sending}
          onClick={() => { if (canSend && !sending) void send(); }}>
          {sending ? "Sending…" : "Send to contractors"}
        </button>
      </div>
    </div>
  );

  const paneDone = (
    <div className="pane done">
      <span className="done-mark"><svg className="ic"><use href="#i-check" /></svg></span>
      <div className="done-h">Your project is on its way.</div>
      <p className="done-p">
        Verified local contractors are reviewing your scope now. Expect 3–5 line-item proposals in your
        inbox — the first usually lands within 4 hours.
      </p>
      <button className="restart" type="button"
        onClick={() => {
          setStep(0); setDesc(""); setCategory(null);
          setUploads([]); setAnswers([]); setContact(CONTACT_FIELDS.map(() => ""));
        }}>
        Start another project
      </button>
    </div>
  );

  const paneThinking = (
    <div className="pane think">
      <span className="think-dots"><i /><i /><i /></span>
      <span className="think-t">{step === 0 ? "Reading your description…" : "Writing your scope of work…"}</span>
    </div>
  );

  const pane = thinking
    ? paneThinking
    : step === 0 ? paneDescribe
    : step === 1 ? paneClarify
    : step === 2 ? paneScope
    : step === 3 ? paneContact
    : paneDone;

  return (
    <div className={"win" + (drag ? " drag" : "")} ref={winRef}>
      <div className="drop-veil"><span>Drop photos, video, or blueprint PDFs</span></div>
      <div className="win-head">
        <div className="win-step">{headLabel}</div>
        <div className="win-ticks">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={"tick" + (i < step ? " done" : i === step ? " now" : "")} />
          ))}
        </div>
      </div>
      <div className="pane-host">{pane}</div>
    </div>
  );
}
