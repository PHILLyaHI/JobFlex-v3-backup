"use client";

// HOMEOWNER LANDING — the intake wizard. Donor `mountWizard(root, uid)`.
//
// ── WHY THIS FILE IS A REWRITE AND NOTHING ELSE IN THE PORT IS ──────────────
// The donor builds every pane by concatenating an HTML STRING and assigning it
// to `host.innerHTML`, with a hand-rolled `esc()` in front of every
// interpolation. That pipeline is not carried across: this page takes free-text
// and file names from the public, and an `innerHTML` sink fed by public input
// is an XSS surface the app has no reason to own. The panes are real JSX, React
// escapes for us, and `esc()` is gone — every one of its call sites is now an
// ordinary `{expression}` child or attribute, which React escapes identically.
//
// ── WHAT IS PRESERVED, EXACTLY ─────────────────────────────────────────────
// Same panes, same order, same triggers, same copy, same timings:
//   describe → (thinking 850ms) → clarify → (thinking 850ms) → scope →
//   contact → done, with `‹ Back` jumps to 0 / 1 / 2 and `restart` back to 0.
//   `canRefine()` is `desc.trim().length > 12`; `detect()` walks KEYWORDS in
//   order and only fires past 8 characters; `go()` collapses its delay to 0
//   under reduced motion.
//
// ── THE ONE NON-OBVIOUS FIDELITY DEVICE: `paneKey` ─────────────────────────
// `.pane`, `.q`, `.sl`, `.up` and `.guess` all carry CSS entrance animations.
// In the donor they replay whenever `render()` runs, because `render()` throws
// the old DOM away. A React tree that merely updates in place would never
// replay them, and the page would feel materially different. So `paneKey`
// increments at EXACTLY the donor's `render()` call sites and keys the pane —
// remounting the subtree and replaying the animations on the same events, and
// only on those events. Consequently:
//   · typing in `.desc` does NOT rebuild the pane… unless the category guess
//     appears or disappears, which is the one case the donor rebuilds on, and
//     the one case it restores focus and caret afterwards. Both survive.
//   · typing in a `.q-in` does NOT rebuild the pane, so answers are kept twice:
//     `answers` (a ref) is the live store the donor calls `S.answers` and
//     mutates on every keystroke, and `shown` is the snapshot the JSX reads,
//     taken inside `bump()` — i.e. at exactly the moments the donor's `render()`
//     would have re-read `S.answers`. That is also why a `.chip` stays lit until
//     the next rebuild even after you type over it: donor behavior, preserved
//     rather than "fixed".
//   · opening the category menu does NOT rebuild the pane (the donor only
//     toggles a class), so `.cats.open`'s slide-in plays and nothing else does.
//
// ── FILES ──────────────────────────────────────────────────────────────────
// `addFiles` / `pump` are the donor's simulated attachment progress. They stay
// entirely client-side: no upload endpoint, no server action, nothing leaves
// the browser. Same for the contact fields, which the donor never reads either.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  CONTACT_FIELDS,
  KEYWORDS,
  QUESTIONS,
  STEP_NAMES,
  type Question,
} from "../homeowner-data";
import { prefersReducedMotion } from "../use-homeowner-behavior";
import { usePlaceholderCycle } from "./use-placeholder-cycle";

type Upload = { name: string; kind: "pdf" | "photo"; progress: number };

/** useLayoutEffect warns during SSR; useEffect is inert there, so it stands in. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** donor `detect()` — first KEYWORDS hit wins, and only past 8 characters.
 *  A chosen category always clears the guess, which is why this is derived
 *  rather than stored: `S.suggested` is a pure function of desc + category. */
function detectSuggestion(desc: string, category: string | null): string | null {
  if (category) return null;
  let hit: string | null = null;
  for (let i = 0; i < KEYWORDS.length; i++) {
    if (KEYWORDS[i][0].test(desc)) {
      hit = KEYWORDS[i][1];
      break;
    }
  }
  return hit && desc.length > 8 ? hit : null;
}

export function HomeownerWizard({ uid }: { uid: string }) {
  /* donor `S` */
  const [step, setStep] = useState(0);
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showCats, setShowCats] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [thinking, setThinking] = useState(false);
  /* not donor state — `root.classList.add('drag')`, expressed as a class */
  const [dragging, setDragging] = useState(false);
  /* the donor's `render()`, counted (see the header note) */
  const [paneKey, setPaneKey] = useState(0);
  /* what the last render read out of `answers` — see the header note */
  const [shown, setShown] = useState<string[]>([]);

  const answers = useRef<string[]>([]);
  const uploadsRef = useRef<Upload[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const pumpTimer = useRef<number | null>(null);
  const goTimer = useRef<number | null>(null);
  /* donor `pump()` reads `S.step` / `S.thinking` from inside its interval */
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

  /* donor `questions()` / `canRefine()` / `catLabel()` */
  const suggested = detectSuggestion(desc, category);
  const questions: Question[] = QUESTIONS[category ?? ""] ?? QUESTIONS["default"];
  const canRefine = desc.trim().length > 12;
  const catLabel = category || suggested || "project";

  /* donor `renderHead()` */
  let headLabel = step < 4 ? STEP_NAMES[step] : "Done";
  if (step === 1 && category) headLabel += " · " + category;
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
        /* donor: `if (S.step === 0 && !S.thinking) { if (finished) render(); … }`
           — a completed file rebuilds the pane; a moving bar does not. */
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

  /* donor `go(n)`: thinking pane, then the target step. 850ms, or 0 when the
     visitor has asked for reduced motion. */
  const go = useCallback(
    (n: number) => {
      setThinking(true);
      bump();
      goTimer.current = window.setTimeout(
        () => {
          goTimer.current = null;
          setThinking(false);
          setStep(n);
          bump();
        },
        prefersReducedMotion() ? 0 : 850
      );
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

  /* donor: a document-level click closes the category menu unless the click
     landed inside this wizard's own `.cat-wrap`. */
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!showCats) return;
      const target = e.target as Element | null;
      const wrap = target && target.closest ? target.closest(".cat-wrap") : null;
      if (wrap && rootRef.current && rootRef.current.contains(wrap)) return;
      setShowCats(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [showCats]);

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
      /* donor swallows this too — some engines refuse on a detached node */
    }
  }, [paneKey]);

  /* ── handlers ──────────────────────────────────────────────────────── */

  const onDescInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const value = el.value;
    const had = detectSuggestion(desc, category);
    const now = detectSuggestion(value, category);
    const pos = el.selectionStart;
    setDesc(value);
    if (had !== now) {
      caret.current = pos;
      bump();
    }
  };

  const onGuess = () => {
    setCategory(suggested);
    bump();
  };

  const onCatToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowCats((v) => !v);
  };

  const onCatPick = (value: string) => {
    setCategory(value);
    setShowCats(false);
    bump();
  };

  const onRefine = () => {
    if (!canRefine) return;
    answers.current = questions.map(() => "");
    go(1);
  };

  const onChip = (i: number, value: string) => {
    answers.current[i] = value;
    bump();
  };

  const onBack = (to: number) => {
    setStep(to);
    bump();
  };

  const onRestart = () => {
    setStep(0);
    setDesc("");
    setCategory(null);
    uploadsRef.current = [];
    setUploads([]);
    answers.current = [];
    /* donor does not reset `S.showCats` here — neither do we */
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
      <textarea
        className="desc"
        rows={3}
        aria-label="Describe your project"
        ref={descRef}
        defaultValue={desc}
        onChange={onDescInput}
      />
      {suggested && !category ? (
        <button className="guess" type="button" onClick={onGuess}>
          <i></i>Looks like: {suggested} — tap to confirm
        </button>
      ) : null}
      {uploads.length ? (
        <div className="ups">
          {uploads.map((u, i) => (
            <span className="up" key={i}>
              <svg className="ic">
                <use href={u.kind === "pdf" ? "#i-doc" : "#i-img"} />
              </svg>
              {u.name}
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
            <use href="#i-img" />
          </svg>
          Photos &amp; video
        </button>
        <div className="cat-wrap">
          <button
            className={category ? "tool tool-cat on" : "tool tool-cat"}
            type="button"
            onClick={onCatToggle}
          >
            <svg className="ic">
              <use href="#i-grid" />
            </svg>
            {category || "Category"}
          </button>
          <div className={showCats ? "cats open" : "cats"}>
            <div className="cats-in">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={category === c ? "cat on" : "cat"}
                  type="button"
                  data-cat={c}
                  onClick={() => onCatPick(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className="go go-refine" type="button" disabled={!canRefine} onClick={onRefine}>
          <svg className="ic">
            <use href="#i-bulb" />
          </svg>
          Continue
        </button>
      </div>
    </div>
  );

  const paneClarify = (
    <div className="pane qs" key={paneKey}>
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
            <b>{it.q}</b>
            {" "}
            {answer}
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
            <b>Attachments:</b>
            {" "}
            {uploads.length} file{uploads.length > 1 ? "s" : ""} included
          </span>
        </div>
      );
    }
    return rows;
  };

  const paneScope = (
    <div className="pane qs" key={paneKey}>
      <div className="scope-head">
        <span className="qs-h">Your Scope of Work</span>
        <span className="scope-stamp">Structured by JobFlex</span>
      </div>
      <div className="sheet">
        <div className="sheet-n">Scope of work · {catLabel}</div>
        <p className="sheet-p">{desc.trim() || "Homeowner project description."}</p>
        <div className="sheet-list">{scopeRows()}</div>
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
      <div className="pane-foot">
        <button className="back" type="button" data-to="2" onClick={() => onBack(2)}>
          ‹ Back
        </button>
        <button
          className="go go-send"
          type="button"
          onClick={() => {
            setStep(4);
            bump();
          }}
        >
          Send to contractors
        </button>
      </div>
    </div>
  );

  const paneDone = (
    <div className="pane done" key={paneKey}>
      <span className="done-mark">
        <svg className="ic">
          <use href="#i-check" />
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
    <div className="win-wrap anim a4">
      <div
        className={dragging ? "win drag" : "win"}
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
