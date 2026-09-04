"use client";

// MOBILE HOMEOWNER — the intake wizard.
//
// ── WHAT IS PRESERVED, EXACTLY ─────────────────────────────────────────────
// Same panes, same order, same triggers, same copy, same timings as the
// desktop build (src/components/v3/homeowner-landing/wizard/homeowner-wizard.tsx):
//   describe → (thinking 850ms) → clarify → (thinking 850ms) → scope →
//   contact → done, with `‹ Back` jumps to 0 / 1 / 2 and `restart` back to 0.
//   `canRefine()` is `desc.trim().length > 12`; `go()` collapses its delay to 0
//   under reduced motion; the simulated upload pump ticks every 160ms at
//   12 + rand(18)% and rebuilds the pane only when a file COMPLETES.
//
// `paneKey` is the same fidelity device: it increments at exactly the donor's
// `render()` call sites and keys the pane, so `.pane` / `.q` / `.sl` / `.up` /
// `.guess` replay their entrance animations on the same events and only those.
// Consequently typing in `.desc` does not rebuild the pane, typing in a
// `.q-in` does not rebuild it, and a chip stays lit until the next rebuild
// even after you type over it. Donor behaviour, kept rather than "fixed".
// (The category guess/picker are gone since 2026-09-04 — the description is
// the one source and the AI detects the trade at submit.)
//
// The attachments never leave the browser (the uploader is simulated). The
// PROJECT does: `.go-send` calls `submitHomeownerRequest`, which writes the
// HomeownerRequest + PlatformLead, starts the routing cascade and sends the
// homeowner their confirmation. Until 2026-08-27 it advanced to "your project
// is on its way" and sent nothing at all.
//
// ── WHAT IS RE-LAID-OUT FOR HANDHELD ───────────────────────────────────────
// 1. THE STICKY ACTION BAR. Every step's primary action lives in a
//    `position: sticky; bottom: 0` foot, which puts it in the thumb zone for
//    as long as the step is taller than the viewport and then settles back
//    into the card. Step 0's "Continue" moves out of the tool row to join it,
//    so all four steps present one consistent bar. The desktop page instead
//    absolutely positions `.go-refine` 14px BELOW the card at ≤700px, which
//    only works for step 0 and leaves the other three primaries off-screen
//    behind a scroll.
// 2. Every touch target is ≥44px, the chips included.
//    Text inputs are 16px so iOS Safari does not zoom the viewport on focus.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CONTACT_FIELDS,
  QUESTIONS,
  STEP_NAMES,
  type Question,
} from "../homeowner-landing/homeowner-data";
import { submitHomeownerRequest, suggestHomeownerQuestions } from "@/actions/homeowner";
import { prefersReducedMotion } from "../homeowner-landing/use-homeowner-behavior";
import { usePlaceholderCycle } from "../homeowner-landing/wizard/use-placeholder-cycle";

type Upload = { name: string; kind: "pdf" | "photo"; progress: number };

/** useLayoutEffect warns during SSR; useEffect is inert there, so it stands in. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** How long the thinking pane waits for the adaptive questions. */
const AI_WAIT_MS = 6500;

/** Enough to catch a typo, not enough to argue with a real address. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The description is one free-text body; answers are appended under it. */
const NEWLINE = "\n";

export function MobileHomeownerWizard({ uid }: { uid: string }) {
  const [step, setStep] = useState(0);
  const [desc, setDesc] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [thinking, setThinking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [paneKey, setPaneKey] = useState(0);
  const [shown, setShown] = useState<string[]>([]);

  const answers = useRef<string[]>([]);
  /* Questions written from THIS description (server, OpenAI); null keeps the
     static set from homeowner-data.ts. */
  const [aiQs, setAiQs] = useState<Question[] | null>(null);
  /* The submission. This pane used to advance to "on its way" and send
     nothing — no lead, no confirmation email, nothing in the Lead Center. */
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const uploadsRef = useRef<Upload[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const pumpTimer = useRef<number | null>(null);
  const goTimer = useRef<number | null>(null);
  const live = useRef({ step: 0, thinking: false });

  const descRef = usePlaceholderCycle();

  useIsomorphicLayoutEffect(() => {
    live.current = { step, thinking };
  }, [step, thinking]);

  /* donor `render()`. Takes the answers snapshot at the same instant it
     replays the pane, because the donor's render did both in one pass. */
  const bump = useCallback(() => {
    setShown(answers.current.slice());
    setPaneKey((k) => k + 1);
  }, []);

  /* The category picker/sheet are gone (owner, 2026-09-04): the description
     is the one source, the TRADE is detected server-side by AI at submit. */
  const questions: Question[] = aiQs ?? QUESTIONS["default"];
  const canRefine = desc.trim().length > 12;

  const headLabel = step < 4 ? STEP_NAMES[step] : "Done";
  const tickClass = (i: number) => "tick" + (i < step ? " past" : i === step ? " now" : "");

  /* ── attachments ───────────────────────────────────────────────────── */

  const pump = useCallback(() => {
    if (pumpTimer.current) return;
    pumpTimer.current = window.setInterval(() => {
      let busy = false;
      let finished = false;
      const next = uploadsRef.current.map((u) => {
        if (u.progress >= 100) return u;
        busy = true;
        const progress = Math.min(100, u.progress + 12 + Math.random() * 18);
        if (progress >= 100) finished = true;
        return { ...u, progress };
      });
      if (busy) {
        uploadsRef.current = next;
        setUploads(next);
        if (finished && live.current.step === 0 && !live.current.thinking) bump();
      } else {
        if (pumpTimer.current) window.clearInterval(pumpTimer.current);
        pumpTimer.current = null;
      }
    }, 160);
  }, [bump]);

  const addFiles = useCallback(
    (list: FileList) => {
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
      const merged = uploadsRef.current.concat(next).slice(0, 6);
      uploadsRef.current = merged;
      setUploads(merged);
      bump();
      pump();
    },
    [bump, pump]
  );

  /* ── navigation ────────────────────────────────────────────────────── */

  const go = useCallback(
    (n: number, work?: Promise<unknown>) => {
      setThinking(true);
      bump();
      // "Reading your description…" is literally what the awaited work does
      // when the questions are being written from it. Capped, so a slow model
      // never strands anyone on the spinner.
      const beat = new Promise<void>((r) => {
        goTimer.current = window.setTimeout(() => {
          goTimer.current = null;
          r();
        }, prefersReducedMotion() ? 0 : 850);
      });
      const capped = work
        ? Promise.race([work, new Promise((r) => window.setTimeout(r, AI_WAIT_MS))])
        : null;
      void Promise.all([beat, capped]).then(() => {
        setThinking(false);
        setStep(n);
        bump();
      });
    },
    [bump]
  );

  /* ── teardown: nothing outlives the page ───────────────────────────── */
  useEffect(() => {
    return () => {
      if (pumpTimer.current) window.clearInterval(pumpTimer.current);
      if (goTimer.current) window.clearTimeout(goTimer.current);
      pumpTimer.current = null;
      goTimer.current = null;
    };
  }, []);

  /* donor, on the one render that happens mid-typing:
     `nd.focus(); nd.setSelectionRange(pos, pos);` */
  useIsomorphicLayoutEffect(() => {
    if (caret.current === null) return;
    const pos = caret.current;
    caret.current = null;
    const el = descRef.current;
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* some engines refuse on a detached node — the donor swallows it too */
    }
  }, [paneKey]);

  /* ── handlers ──────────────────────────────────────────────────────── */

  const onDescInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDesc(e.currentTarget.value);
  };

  const onRefine = () => {
    if (!canRefine) return;
    setAiQs(null);
    answers.current = [];
    setShown([]);
    const work = suggestHomeownerQuestions({ description: desc, category: null })
      .then((res) => {
        if (res.questions && res.questions.length) setAiQs(res.questions);
      })
      .catch(() => {});
    go(1, work);
  };

  /** Fills one answer WITHOUT rebuilding the pane — `bump()` here replayed the
   *  entrance animation of every question on the step each time a chip was
   *  tapped. The fields are uncontrolled, so the value is written straight into
   *  the input and `shown` lights the chip. */
  const onChip = (i: number, value: string) => {
    answers.current[i] = value;
    setShown(answers.current.slice());
    const el = document.getElementById(uid + "q" + i) as HTMLInputElement | null;
    if (el) el.value = value;
  };

  const onBack = (to: number) => {
    setStep(to);
    bump();
  };

  /** Contact fields are uncontrolled (donor shape) — read by id at send time. */
  const contactValue = (i: number): string =>
    (document.getElementById(uid + "c" + i) as HTMLInputElement | null)?.value.trim() ?? "";

  /* CONTACT_FIELDS maps positionally: name, email, phone (optional), zip. The
     clarify answers ride along in the description, which is the one free-text
     body `submitHomeownerRequest` takes. */
  const onSend = async () => {
    if (sending) return;
    const [name, email, phone, zip] = [0, 1, 2, 3].map(contactValue);
    if (!name || !email || !zip) {
      setSendErr("Name, email and ZIP code are needed to send this to contractors.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setSendErr("That email address does not look right.");
      return;
    }
    setSendErr("");
    setSending(true);
    const extra = questions
      .map((q, i) => {
        const a = (answers.current[i] ?? "").trim();
        return a ? q.q + " " + a : "";
      })
      .filter(Boolean)
      .join(NEWLINE);
    try {
      await submitHomeownerRequest({
        name,
        email,
        phone: phone || undefined,
        zip,
        description: extra ? desc.trim() + NEWLINE + NEWLINE + extra : desc.trim(),
      });
      setStep(4);
      bump();
    } catch (err) {
      setSendErr(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't send that. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const onRestart = () => {
    setStep(0);
    setDesc("");
    uploadsRef.current = [];
    setUploads([]);
    answers.current = [];
    bump();
  };

  /* ── panes ─────────────────────────────────────────────────────────── */

  const paneThinking = (
    <div className="pane think" key={paneKey}>
      <span className="think-dots">
        <i></i>
        <i></i>
        <i></i>
      </span>
      <span className="think-t">
        {step === 0 ? "Reading your description…" : "Writing your scope of work…"}
      </span>
    </div>
  );

  const paneDescribe = (
    <div className="pane" key={paneKey}>
      <div className="desc-wrap">
        <textarea
          className="desc"
          rows={3}
          aria-label="Describe your project"
          ref={descRef}
          defaultValue={desc}
          onChange={onDescInput}
        />
      </div>
      {uploads.length ? (
        <div className="ups">
          {uploads.map((u, i) => (
            <span className="up" key={i}>
              <svg className="ic">
                <use href={u.kind === "pdf" ? "#jfmh-i-doc" : "#jfmh-i-img"} />
              </svg>
              <span className="up-n">{u.name}</span>
              {u.progress >= 100 ? (
                <span className="up-ok">✓</span>
              ) : (
                <span className="up-bar">
                  <span style={{ width: u.progress + "%" }}></span>
                </span>
              )}
            </span>
          ))}
        </div>
      ) : null}
      <div className="tools">
        <input
          type="file"
          className="file"
          multiple
          accept="image/*,video/*,.pdf"
          style={{ display: "none" }}
          ref={fileRef}
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (files && files.length) addFiles(files);
          }}
        />
        <button className="tool tool-photo" type="button" onClick={() => fileRef.current?.click()}>
          <svg className="ic">
            <use href="#jfmh-i-img" />
          </svg>
          <span className="tool-l">Photos &amp; video</span>
        </button>
      </div>
      <div className="pane-foot">
        <button className="go go-refine" type="button" disabled={!canRefine} onClick={onRefine}>
          Continue
          <svg className="ic">
            <use href="#jfmh-i-arrow-r" />
          </svg>
        </button>
      </div>
    </div>
  );

  const paneClarify = (
    <div className="pane qs" key={paneKey}>
      <div className="pane-body">
        <div className="qs-h">A few quick questions — twenty seconds, promise</div>
        {questions.map((it, i) => {
          const id = uid + "q" + i;
          return (
            <div className="q" key={i} style={{ animationDelay: i * 0.09 + "s" }}>
              <label className="q-l" htmlFor={id}>
                {i + 1}. {it.q}
              </label>
              <input
                className="q-in"
                id={id}
                data-q={i}
                placeholder={it.hint}
                defaultValue={shown[i] || ""}
                onChange={(e) => {
                  answers.current[i] = e.currentTarget.value;
                }}
              />
              {it.chips ? (
                <div className="chips">
                  {it.chips.map((v) => (
                    <button
                      key={v}
                      className={shown[i] === v ? "chip on" : "chip"}
                      type="button"
                      data-q={i}
                      data-v={v}
                      onClick={() => onChip(i, v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="pane-foot">
        <button className="back" type="button" data-to="0" onClick={() => onBack(0)}>
          ‹ Back
        </button>
        <button className="go go-scope" type="button" onClick={() => go(2)}>
          Generate my scope
        </button>
      </div>
    </div>
  );

  const scopeRows = () => {
    const rows: React.ReactNode[] = [];
    let d = 0;
    questions.forEach((it, i) => {
      const answer = shown[i];
      if (!answer) return;
      rows.push(
        <div className="sl" key={"q" + i} style={{ animationDelay: 0.12 + d * 0.1 + "s" }}>
          <i>✓</i>
          <span>
            <b>{it.q}</b> {answer}
          </span>
        </div>
      );
      d++;
    });
    if (uploads.length) {
      rows.push(
        <div className="sl" key="attachments" style={{ animationDelay: 0.12 + d * 0.1 + "s" }}>
          <i>✓</i>
          <span>
            <b>Attachments:</b> {uploads.length} file{uploads.length > 1 ? "s" : ""} included
          </span>
        </div>
      );
    }
    return rows;
  };

  const paneScope = (
    <div className="pane qs" key={paneKey}>
      <div className="pane-body">
        <div className="scope-head">
          <span className="qs-h">Your Scope of Work</span>
          <span className="scope-stamp">Structured by JobFlex</span>
        </div>
        <div className="sheet">
          <div className="sheet-n">Scope of work</div>
          <p className="sheet-p">{desc.trim() || "Homeowner project description."}</p>
          <div className="sheet-list">{scopeRows()}</div>
        </div>
      </div>
      <div className="pane-foot">
        <button className="back" type="button" data-to="1" onClick={() => onBack(1)}>
          ‹ Back
        </button>
        <button
          className="go go-contact"
          type="button"
          onClick={() => {
            setStep(3);
            bump();
          }}
        >
          Looks right — get quotes
        </button>
      </div>
    </div>
  );

  const paneContact = (
    <div className="pane qs" key={paneKey}>
      <div className="pane-body">
        <div className="qs-h">Where should the quotes go?</div>
        <p className="pane-lede">
          Verified local contractors reply with line-item proposals. No calls until you choose.
        </p>
        <div className="cform">
          {CONTACT_FIELDS.map((field, i) => {
            const id = uid + "c" + i;
            return (
              <div key={field}>
                <label className="fld-l" htmlFor={id}>
                  {field}
                </label>
                <input className="q-in c-in" id={id} placeholder={field} />
              </div>
            );
          })}
        </div>
      </div>
      {sendErr ? (
        <div className="send-err" role="alert">
          {sendErr}
        </div>
      ) : null}
      <div className="pane-foot">
        <button className="back" type="button" data-to="2" onClick={() => onBack(2)}>
          ‹ Back
        </button>
        <button
          className="go go-send"
          type="button"
          disabled={sending}
          onClick={() => {
            void onSend();
          }}
        >
          {sending ? "Sending…" : "Send to contractors"}
          <svg className="ic">
            <use href="#jfmh-i-arrow-r" />
          </svg>
        </button>
      </div>
    </div>
  );

  const paneDone = (
    <div className="pane done" key={paneKey}>
      <span className="done-mark">
        <svg className="ic">
          <use href="#jfmh-i-check" />
        </svg>
      </span>
      <div className="done-h">Your project is on its way.</div>
      <p className="done-p">
        Verified local contractors are reviewing your scope now. Expect 3–5 line-item proposals in
        your inbox — the first usually lands within 4 hours.
      </p>
      <button className="restart" type="button" onClick={onRestart}>
        Start another project
      </button>
    </div>
  );

  const pane = thinking
    ? paneThinking
    : step === 0
      ? paneDescribe
      : step === 1
        ? paneClarify
        : step === 2
          ? paneScope
          : step === 3
            ? paneContact
            : paneDone;

  return (
    <div className="win-wrap">
      <div
        className={dragging ? "win drag anim a4" : "win anim a4"}
        ref={rootRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          const root = rootRef.current;
          if (!root) return;
          if (e.target === root || !root.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            addFiles(e.dataTransfer.files);
          }
        }}
      >
        <div className="drop-veil">
          <span>Drop photos, video, or blueprint PDFs</span>
        </div>
        <div className="win-head">
          <div className="win-step">{headLabel}</div>
          <div className="win-ticks">
            <span className={tickClass(0)}></span>
            <span className={tickClass(1)}></span>
            <span className={tickClass(2)}></span>
            <span className={tickClass(3)}></span>
          </div>
        </div>
        <div className="pane-host">{pane}</div>
      </div>
    </div>
  );
}
