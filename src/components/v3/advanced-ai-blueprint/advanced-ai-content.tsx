"use client";

// SMART PROPOSAL · ESTIMATE / BLUEPRINT — the page.
// Route: /dashboard/advanced-ai.
//
// ── THIS IS NOW A LIVE CONSOLE ─────────────────────────────────────
// It was a static port: `generate()` was a 1500ms setTimeout that swapped a
// panel, the estimate was the donor's cedar-fence fixture, the refine "diff" was
// two constant rows, "Send to proposal" had no handler, and the Materials
// request's buy control was a handler-less <button>. Every one of those is gone.
//
// The page now calls the real actions in `@/actions/advancedEstimator`:
//   Generate  → analyzeEstimatePrompt() then generateAdvancedEstimate()
//   Apply     → refineAdvancedEstimate()
//   Save      → saveEstimate() then convertEstimateToProposal() then router.push
//
// The donor's LOOK is untouched — same cards, same grid, same type, same
// motion. What changed is that the numbers on it are real, and every control
// that appeared to do something now does it.
//
// ── ONE LINE SHAPE, NO SECOND COPIES ───────────────────────────────
// Line items are held as `ConsoleLine[]` from `@/lib/estimate/console-model` —
// the shape shared with the handheld studio. Totals come from `computeTotals`
// (cost → margin → discount → tax) and the Materials request from
// `materialsRequest(lines)`. Deriving the request rather than mirroring them is
// what makes it reactive: delete a line and its purchase row goes with it,
// because there was never a second array to forget to update.
//
// ── CONTROLLED INPUTS, AND WHY THE `rev` TRICK WENT ────────────────
// The port kept the donor's uncontrolled `defaultValue` inputs plus a `rev`
// counter that remounted every row, because the donor re-rendered its table
// with innerHTML and the DOM fields had to pick up new values. Both are gone.
// A refine, an Undo and a delete now rewrite the same `lines` state the inputs
// render from, so there is nothing to force. The one thing uncontrolled inputs
// bought — clearing a cell leaves the box empty instead of slamming a "0" into
// it — is kept by `field`, a single-cell edit buffer: while a numeric cell is
// being typed in, the field shows the raw text and the model holds the parsed
// number. It costs eight lines and it makes remount-on-every-keystroke
// unnecessary.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import s from "./advanced-ai.module.css";
import { useSmartProposalMotion } from "./advanced-ai-motion";
import { BlueprintSelect } from "./blueprint-select";
import { MaterialThumb } from "@/components/materials/MaterialThumb";
import { merchantUrl } from "@/lib/merchantLinks";
import { toast } from "@/components/ui/Toast";
import {
  reportPlanLimit,
  reportPlanLimitResult,
  ensureWithinLimit,
} from "@/stores/usePlanLimitStore";
import { attachPlacesSuggest } from "@/components/v3/blueprint-shell/places-suggest";
import { MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { stateTaxPct } from "@/app/(mobile)/mobile-advanced-ai-v2/state-tax";
import {
  analyzeEstimatePrompt,
  generateAdvancedEstimate,
  refineAdvancedEstimate,
  saveEstimate,
  convertEstimateToProposal,
} from "@/actions/advancedEstimator";
import type { ClarifyQuestion, GeneratedEstimate } from "@/lib/estimatorSchema";
import {
  briefWithAnswers,
  computeTotals,
  discountFromSchema,
  discountToSchema,
  estimateFromLines,
  lineTotal,
  linesFromEstimate,
  materialsRequest,
  materialsRequestTotal,
  mergeRefined,
  newLineId,
  unitOptionsFor,
  NO_DISCOUNT,
  type ClarifyAnswer,
  type ConsoleLine,
  type DiscountState,
  type LineGroup,
} from "@/lib/estimate/console-model";
import { lockScroll } from "@/lib/scrollLock";
import {
  GEN_DONE,
  GEN_STAGES,
  INTAKE,
  LIVE,
  MAX_MONEY,
  MAX_QTY,
  PHOTO_MAX_COUNT,
  PHOTO_MAX_TOTAL_BYTES,
  PROJECT_TYPES,
  SAMPLES,
  STATES,
  money,
  moneySigned,
  moneyU,
} from "./advanced-ai-data";

/** Hashed module class, or the literal name when the module has none — which is
 *  how the fleet's global `rv` / `rv-in` / `pressed` pass through. */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => (s as Record<string, string>)[n as string] ?? (n as string))
    .join(" ");
}

/** The overlay's exit is skipped, not merely un-animated, when motion is off. */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Which of the page's two panels is on screen. */
type Panel = "intake" | "estimate";
type Photo = { id: string; name: string; size: number; dataUrl: string };

/** Everything an Apply can touch, snapshotted so one Undo restores it exactly. */
type Snapshot = {
  lines: ConsoleLine[];
  title: string;
  scope: string;
  assumptions: string[];
  baseline: string[];
  timelineDays: number | null;
  discount: DiscountState;
  history: string[];
};

/** A refine result parked for review. Nothing applies until it is confirmed. */
type Pending = {
  data: GeneratedEstimate;
  warnings: string[];
  reshopFailed: boolean;
  rows: { kind: "Added" | "Removed" | "Changed"; name: string; detail: string }[];
  instructions: string;
};

const STATE_OPTIONS = STATES.map(([value, label]) => ({ value, label }));

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Clamp anything a paste can produce into a number the money cells can paint. */
function clampNum(raw: string, max: number): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), max);
}

export function AdvancedAiContent() {
  const router = useRouter();

  // ── Panel 1: the intake console ──────────────────────────────────
  const [panel, setPanel] = useState<Panel>("intake");
  const [ptype, setPtype] = useState<string | null>(null);
  const [otherWork, setOtherWork] = useState("");
  const [errOther, setErrOther] = useState(false);
  const [addr, setAddr] = useState("");
  const [usState, setUsState] = useState("");
  const [brief, setBrief] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoErr, setPhotoErr] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // ── The run ──────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [genDone, setGenDone] = useState(false);
  const [genError, setGenError] = useState("");

  // ── Panel 2: the estimate ────────────────────────────────────────
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<string[]>([]);
  const [timelineDays, setTimelineDays] = useState<number | null>(null);
  const [discount, setDiscount] = useState<DiscountState>(NO_DISCOUNT);
  // Rate and pin live in ONE state object so the Places pick handler — which is
  // a DOM listener bound once per panel — can read the current pin through a
  // functional update instead of closing over a stale boolean. A typed rate
  // pins itself: picking a state afterwards must not silently overwrite a
  // number the contractor deliberately entered.
  const [tax, setTax] = useState<{ pct: number; pinned: boolean }>({ pct: 0, pinned: false });
  const [demoMode, setDemoMode] = useState(false);
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  // The overlay is held mounted through its exit keyframes; `genExit` is what
  // plays them. Without it the box is cut out of the frame instantly while the
  // arrival got a full 240ms, and the hard cut is the half you notice.
  const [genExit, setGenExit] = useState(false);
  // The intake gate's questions, and the promise `generate()` is parked on
  // while they are on screen. Keeping the resolver in a ref (not state) means
  // answering does not race a re-render: the awaiting call is resumed exactly
  // once, by whichever button was pressed.
  const [clarify, setClarify] = useState<ClarifyQuestion[] | null>(null);
  const clarifyResolve = useRef<((v: ClarifyAnswer[] | null) => void) | null>(null);
  const [briefUsed, setBriefUsed] = useState("");
  const [typeUsed, setTypeUsed] = useState("");
  const [locationUsed, setLocationUsed] = useState("");

  // ── Refine ───────────────────────────────────────────────────────
  const [refineText, setRefineText] = useState("");
  const [refineBusy, setRefineBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [undoSnap, setUndoSnap] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);

  /** The one cell currently being typed into — see the header note. */
  const [field, setField] = useState<{ key: string; text: string } | null>(null);

  const briefId = useId();
  const addrId = useId();
  const stateId = useId();
  const otherId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const addrRef = useRef<HTMLInputElement>(null);

  useSmartProposalMotion(s.btn, panel);

  // ── Address autocomplete ─────────────────────────────────────────
  // The field promised "Search address or city…" and was a bare input. This is
  // the same module the Fence studio uses; with no browser key it degrades to a
  // plain input that simply reports what was typed, which is why the `typed`
  // branch still has to write `addr`.
  useEffect(() => {
    if (panel !== "intake") return;
    const input = addrRef.current;
    if (!input) return;
    return attachPlacesSuggest(input, {
      cityOnly: true,
      onPick(p) {
        setAddr(p.typed ? p.address : p.formatted || p.address);
        if (p.typed || !p.state) return;
        setUsState(p.state);
        setTax((t) => (t.pinned ? t : { pct: stateTaxPct(p.state), pinned: false }));
      },
    });
  }, [panel]);

  // Picking a state seeds the tax rate until the contractor types their own.
  function pickState(code: string) {
    setUsState(code);
    setTax((t) => (t.pinned ? t : { pct: stateTaxPct(code), pinned: false }));
  }

  // ── The generation overlay's clock ───────────────────────────────
  // Stage 0 → 1 is a REAL boundary (analyzeEstimatePrompt resolved). 1 → 2 → 3
  // are dwells inside one server call that reports nothing, and stage 3 is the
  // terminus: it holds until the promise settles rather than pretending to
  // finish. The effect is gated on `generating`, so the overlay's clock cannot
  // outlive the request that started it.
  useEffect(() => {
    if (!generating || genDone) return;
    const last = GEN_STAGES.length - 1;
    if (stageIdx < 1 || stageIdx >= last) return;
    const dwell = GEN_STAGES[stageIdx].dwellMs;
    if (!dwell) return;
    const t = setTimeout(() => setStageIdx((i) => Math.min(i + 1, last)), dwell);
    return () => clearTimeout(t);
  }, [generating, genDone, stageIdx]);

  // ── Derived money ────────────────────────────────────────────────
  const totals = useMemo(
    () => computeTotals({ lines, discount, taxPct: tax.pct }),
    [lines, discount, tax.pct],
  );
  const reqRows = useMemo(() => materialsRequest(lines), [lines]);
  const reqTotal = useMemo(() => materialsRequestTotal(reqRows), [reqRows]);
  const materials = lines.filter((l) => l.group === "materials");
  const labor = lines.filter((l) => l.group === "labor");

  const projectType =
    ptype === "other"
      ? otherWork.trim()
      : PROJECT_TYPES.find((t) => t.id === ptype)?.label ?? "";

  // "City, ST" is what the actions localize prices against. The state is only
  // appended when the typed text does not already carry it.
  const location = useMemo(() => {
    const a = addr.trim();
    if (!a) return usState;
    if (!usState) return a;
    return new RegExp(`(^|[,\\s])${usState}$`, "i").test(a) ? a : `${a}, ${usState}`;
  }, [addr, usState]);

  const cleanAssumptions = assumptions.map((a) => a.trim()).filter(Boolean);
  const cleanBaseline = baseline.map((a) => a.trim()).filter(Boolean);
  const assumptionsDirty =
    cleanAssumptions.length !== cleanBaseline.length ||
    cleanAssumptions.some((a, i) => a !== cleanBaseline[i]);
  const canApply = (refineText.trim().length > 0 || assumptionsDirty) && !refineBusy;
  const uiLocked = refineBusy || !!pending;

  const canGenerate =
    !!ptype &&
    (ptype !== "other" || otherWork.trim().length > 0) &&
    brief.trim().length > 0 &&
    !generating;

  // ── Failure funnel ───────────────────────────────────────────────
  // Every action returns the same three shapes: a plan-limit refusal (handed to
  // the app's own upgrade dialog), a plain { ok:false, error } and a thrown
  // error. None of them may leave a blank panel behind, so they all land here.
  const fail = useCallback((res: { error: string; code?: string }, where: string) => {
    if (reportPlanLimitResult(res)) return "You have used this month's estimator runs.";
    toast.error(where, res.error);
    return res.error;
  }, []);

  // ══════════════ GENERATE ══════════════

  /** Take the overlay down THROUGH its exit animation, not by cutting it out. */
  const closeOverlay = useCallback(async () => {
    if (reducedMotion()) {
      setGenerating(false);
      return;
    }
    setGenExit(true);
    await new Promise((r) => setTimeout(r, MDL_EXIT_MS));
    setGenExit(false);
    setGenerating(false);
  }, []);

  /**
   * Park generation on the questions dialog.
   *
   * Resolves with the answered pairs (possibly empty — "Generate anyway"), or
   * null when the contractor backed out entirely.
   */
  function askClarify(questions: ClarifyQuestion[]): Promise<ClarifyAnswer[] | null> {
    return new Promise((resolve) => {
      clarifyResolve.current = resolve;
      setClarify(questions);
    });
  }
  const settleClarify = useCallback((value: ClarifyAnswer[] | null) => {
    const resolve = clarifyResolve.current;
    clarifyResolve.current = null;
    setClarify(null);
    resolve?.(value);
  }, []);

  async function generate() {
    if (!canGenerate) {
      if (ptype === "other" && !otherWork.trim()) setErrOther(true);
      return;
    }
    const photoUrls = photos.map((p) => p.dataUrl);
    const typedBrief = brief.trim();
    setGenError("");
    setStageIdx(0);
    setGenDone(false);
    setGenExit(false);
    setGenerating(true);
    try {
      const gate = await analyzeEstimatePrompt({
        projectType,
        description: typedBrief,
        location: location || undefined,
        photos: photoUrls,
      });
      if (!gate.ok) {
        await closeOverlay();
        setGenError(fail(gate, "Couldn't start"));
        return;
      }
      // The gate normalizes "bothel wa" to "Bothell, WA" before anything is
      // priced against it — so use the corrected string, and show it.
      const fixed = gate.data.correctedLocation?.trim() || "";
      const useLocation = fixed || location;
      if (fixed && fixed !== location) setAddr(fixed);

      // ── The thin-brief gate ────────────────────────────────────────
      // The gate has already decided; asking here costs no extra model call.
      // The overlay steps aside for the dialog rather than stacking behind it,
      // because the checklist would be narrating work that is not happening.
      let description = typedBrief;
      const thin = !gate.data.enoughDetail && gate.data.questions.length > 0;
      if (thin) {
        await closeOverlay();
        const answers = await askClarify(gate.data.questions);
        // Backed out — nothing is priced, and the brief is untouched.
        if (answers === null) return;
        description = briefWithAnswers(typedBrief, answers);
        // Anything they DIDN'T answer still rides along to the refine card, so
        // "Generate anyway" leaves the same open questions it always did.
        const answered = new Set(answers.map((a) => a.question));
        setOpenQuestions(
          gate.data.questions.filter((q) => !answered.has(q.question)).map((q) => q.question),
        );
        setGenError("");
        setGenDone(false);
        setGenExit(false);
        setGenerating(true);
      } else {
        setOpenQuestions([]);
      }
      // The brief has been read — the one boundary the client can observe.
      setStageIdx(1);

      const res = await generateAdvancedEstimate({
        projectType,
        description,
        location: useLocation || undefined,
        photos: photoUrls,
      });
      if (!res.ok) {
        await closeOverlay();
        setGenError(fail(res, "Generation failed"));
        return;
      }

      const est = res.data;
      setLines(linesFromEstimate(est));
      setTitle(est.title);
      setScope(est.scope || description);
      setAssumptions(est.assumptions);
      setBaseline(est.assumptions);
      setTimelineDays(est.estimatedTimelineDays ?? null);
      setDiscount(NO_DISCOUNT);
      setDemoMode(Boolean(res.disabled));
      setBriefUsed(description);
      setTypeUsed(projectType);
      setLocationUsed(useLocation);
      setHistory([]);
      setUndoSnap(null);
      setPending(null);
      setRefineText("");
      setStageIdx(GEN_STAGES.length);
      setGenDone(true);
      // Land on "generated" for a beat so the checklist reads as finished
      // rather than vanishing mid-tick.
      await new Promise((r) => setTimeout(r, 620));
      await closeOverlay();
      setPanel("estimate");
      if (res.disabled) {
        toast.info("Demo estimate", "No estimator key configured — this is placeholder pricing.");
      }
    } catch (err) {
      await closeOverlay();
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setGenError(msg);
      toast.error("Generation failed", msg);
    }
  }

  /** Back to the console, with the estimate discarded. */
  function startOver() {
    setPanel("intake");
    setLines([]);
    setAssumptions([]);
    setBaseline([]);
    setTitle("");
    setScope("");
    setTimelineDays(null);
    setDiscount(NO_DISCOUNT);
    setPending(null);
    setUndoSnap(null);
    setHistory([]);
    setRefineText("");
    setOpenQuestions([]);
    setDemoMode(false);
    setGenError("");
  }

  // ══════════════ LEDGER ══════════════
  function patch(id: string, next: Partial<ConsoleLine>) {
    setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }
  function removeLine(id: string) {
    setLines((rows) => rows.filter((r) => r.id !== id));
  }
  function addLine(group: LineGroup) {
    setLines((rows) => [
      ...rows,
      {
        id: newLineId(group === "labor" ? "l" : "m"),
        group,
        name: "",
        qty: 1,
        unit: group === "labor" ? "hour" : "each",
        price: 0,
        retailPrice: null,
      },
    ]);
  }

  /** The edit buffer: raw text while a cell has focus, the model otherwise. */
  function cellValue(key: string, n: number): string {
    return field?.key === key ? field.text : String(n);
  }

  // ══════════════ REFINE ══════════════
  async function applyChanges() {
    if (!canApply) return;
    const instructions = refineText.trim();
    setRefineBusy(true);
    try {
      const res = await refineAdvancedEstimate({
        projectType: typeUsed || projectType,
        location: locationUsed || location || undefined,
        instructions,
        history: history.slice(-5),
        assumptions: cleanAssumptions,
        current: estimateFromLines(lines, {
          title,
          scope: scope || briefUsed,
          assumptions: cleanAssumptions,
          estimatedTimelineDays: timelineDays ?? undefined,
          discount: discountToSchema(discount),
        }),
      });
      if (!res.ok) {
        fail(res, "Couldn't apply");
        return;
      }
      if (res.disabled) {
        // No estimator key: the action echoes the estimate back with the edited
        // assumptions folded in. Say so instead of showing an empty diff.
        setAssumptions(res.data.assumptions);
        setBaseline(res.data.assumptions);
        toast.info("Demo mode", "No estimator key configured — assumptions saved, nothing re-priced.");
        return;
      }

      const before = new Map(lines.map((l) => [l.id, l]));
      const after = linesFromEstimate(res.data);
      const rows: Pending["rows"] = [];
      for (const n of after) {
        const o = before.get(n.id);
        if (!o) {
          rows.push({
            kind: "Added",
            name: n.name,
            detail: `${n.qty} × ${moneyU(n.price)} · ${money(lineTotal(n))}`,
          });
          continue;
        }
        const bits: string[] = [];
        if (o.name !== n.name) bits.push(`“${o.name}” → “${n.name}”`);
        if (o.qty !== n.qty) bits.push(`${o.qty} → ${n.qty} ${n.unit}`);
        if (o.price !== n.price) bits.push(`${moneyU(o.price)} → ${moneyU(n.price)}`);
        if (bits.length) rows.push({ kind: "Changed", name: o.name, detail: bits.join(" · ") });
      }
      const kept = new Set(after.map((l) => l.id));
      for (const o of lines) {
        if (!kept.has(o.id)) {
          rows.push({ kind: "Removed", name: o.name, detail: `was ${money(lineTotal(o))}` });
        }
      }
      const discountMoved =
        JSON.stringify(res.data.discount ?? null) !== JSON.stringify(discountToSchema(discount));
      if (discountMoved) {
        const d = res.data.discount;
        rows.push({
          kind: d ? "Changed" : "Removed",
          name: "Discount",
          detail: d ? (d.isPercent ? `${d.amount}% off` : `${money(d.amount)} off`) : "cleared",
        });
      }
      if (rows.length === 0 && res.warnings.length === 0) {
        toast.info("No changes", "Nothing came back different — try being more specific.");
        return;
      }
      setPending({
        data: res.data,
        warnings: res.warnings,
        reshopFailed: res.reshopFailed,
        rows,
        instructions,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't apply changes.";
      toast.error("Couldn't apply", msg);
    } finally {
      setRefineBusy(false);
    }
  }

  function keepChanges() {
    const p = pending;
    if (!p) return;
    setUndoSnap({
      lines,
      title,
      scope,
      assumptions,
      baseline,
      timelineDays,
      discount,
      history,
    });
    // mergeRefined keeps each surviving line's retail price unless the server
    // re-shopped it — so an edited price does not start claiming to be the shelf
    // price, and a genuinely re-matched line picks up its new one.
    setLines(mergeRefined(lines, p.data));
    setTitle(p.data.title || title);
    setScope(p.data.scope || scope);
    setAssumptions(p.data.assumptions);
    setBaseline(p.data.assumptions);
    setTimelineDays(p.data.estimatedTimelineDays ?? timelineDays);
    // The refine owns the discount too ("give them 8% off" sets it, "drop the
    // discount" clears it), so it round-trips through the same converter the
    // save path uses rather than a second hand-rolled mapping.
    if (p.data.discount !== undefined) setDiscount(discountFromSchema(p.data.discount));
    if (p.instructions) setHistory((h) => [...h, p.instructions].slice(-8));
    setRefineText("");
    setPending(null);
    if (p.reshopFailed) {
      toast.info("Applied with caveats", "Live pricing failed on the changed lines.");
    } else {
      toast.success("Estimate updated", "Undo is available until the next change.");
    }
  }

  function undo() {
    const snap = undoSnap;
    if (!snap) return;
    setLines(snap.lines.map((l) => ({ ...l, badge: undefined })));
    setTitle(snap.title);
    setScope(snap.scope);
    setAssumptions(snap.assumptions);
    setBaseline(snap.baseline);
    setTimelineDays(snap.timelineDays);
    setDiscount(snap.discount);
    setHistory(snap.history);
    setUndoSnap(null);
    toast.success("Reverted", "Restored the previous version.");
  }

  // ══════════════ SAVE AS PROPOSAL ══════════════
  async function saveAsProposal() {
    if (lines.length === 0) return;
    setSaveBusy(true);
    try {
      if (!(await ensureWithinLimit("proposalsCreated"))) return;
      const data = estimateFromLines(lines, {
        title: title || projectType || "Estimate",
        scope: scope || briefUsed,
        assumptions: cleanAssumptions,
        estimatedTimelineDays: timelineDays ?? undefined,
        discount: discountToSchema(discount),
      });
      await saveEstimate({
        projectType: typeUsed || projectType,
        location: locationUsed || location || null,
        data,
      });
      const res = await convertEstimateToProposal({
        projectType: typeUsed || projectType,
        title: data.title,
        scope: data.scope,
        materials: data.materials,
        labor: data.labor,
        assumptions: data.assumptions,
        location: locationUsed || location || undefined,
        discount: data.discount ?? undefined,
      });
      toast.success("Proposal created", "Opening it now.");
      // router.push, never location.assign — a hard nav replays the blueprint
      // entrance and the page visibly double-takes.
      router.push(`/dashboard/proposals/${res.id}` as never);
    } catch (err) {
      if (reportPlanLimit(err)) return;
      const msg = err instanceof Error ? err.message : "Couldn't save the proposal.";
      toast.error("Couldn't save", msg);
    } finally {
      setSaveBusy(false);
    }
  }

  // ══════════════ PHOTOS ══════════════
  async function takeFiles(files: FileList | null) {
    if (!files?.length) return;
    setPhotoErr("");
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (picked.length !== files.length) setPhotoErr("Images only — other files were skipped.");
    const next: Photo[] = [];
    let bytes = photos.reduce((n, p) => n + p.size, 0);
    for (const f of picked) {
      if (photos.length + next.length >= PHOTO_MAX_COUNT) {
        setPhotoErr(`Up to ${PHOTO_MAX_COUNT} photos.`);
        break;
      }
      if (bytes + f.size > PHOTO_MAX_TOTAL_BYTES) {
        setPhotoErr("That is more than the estimator can read in one run — drop a few.");
        break;
      }
      bytes += f.size;
      next.push({
        id: newLineId("p"),
        name: f.name,
        size: f.size,
        dataUrl: await fileToDataUrl(f),
      });
    }
    if (next.length) setPhotos((p) => [...p, ...next]);
  }

  // ══════════════ ROW ══════════════
  const row = (r: ConsoleLine) => {
    const qtyKey = `${r.id}:q`;
    const priceKey = `${r.id}:p`;
    return (
      <div className={cx("sp-row")} key={r.id}>
        <span className={cx("sp-row-n")}>
          <input
            className={cx("sp-name")}
            value={r.name}
            placeholder="Line item"
            aria-label="Item name"
            // Real product names run past the column ("BEHR Premium 1 gal.
            // #ST-533 Cedar Naturaltone Semi-Transparent…"); the field clips
            // them, so the full string has to be reachable on hover.
            title={r.name}
            disabled={uiLocked}
            onChange={(e) => patch(r.id, { name: e.target.value })}
          />
          {r.badge && <em>{r.badge}</em>}
        </span>

        <span className={cx("sp-qty")}>
          <input
            className={cx("sp-in", "sp-in--qty")}
            type="number"
            min="0"
            max={MAX_QTY}
            step="1"
            inputMode="decimal"
            value={cellValue(qtyKey, r.qty)}
            aria-label={`${r.name || "Line item"} — quantity`}
            disabled={uiLocked}
            onChange={(e) => {
              setField({ key: qtyKey, text: e.target.value });
              patch(r.id, { qty: clampNum(e.target.value, MAX_QTY) });
            }}
            onBlur={() => setField((f) => (f?.key === qtyKey ? null : f))}
          />
          <BlueprintSelect
            value={r.unit}
            onChange={(unit) => patch(r.id, { unit })}
            // Bare unit, not "per hour": the number sits immediately to its
            // left, so "8 hour" already reads as the rate and "per" only ate
            // the width that "crew day" needs.
            options={unitOptionsFor(r.group).map((u) => ({ value: u, label: u }))}
            placeholder="unit"
            ariaLabel={`${r.name || "Line item"} — unit`}
            triggerClass="sp-unit"
            disabled={uiLocked}
          />
        </span>

        <input
          className={cx("sp-in")}
          type="number"
          min="0"
          max={MAX_MONEY}
          step="0.5"
          inputMode="decimal"
          value={cellValue(priceKey, r.price)}
          aria-label={`${r.name || "Line item"} — price`}
          disabled={uiLocked}
          onChange={(e) => {
            setField({ key: priceKey, text: e.target.value });
            patch(r.id, { price: clampNum(e.target.value, MAX_MONEY) });
          }}
          onBlur={() => setField((f) => (f?.key === priceKey ? null : f))}
        />

        <span className={cx("sp-row-t")}>{money(lineTotal(r))}</span>

        <button
          className={cx("sp-row-x")}
          type="button"
          aria-label={`Remove ${r.name || "line item"}`}
          disabled={uiLocked}
          onClick={() => removeLine(r.id)}
        >
          <svg className={cx("ic")}>
            <use href="#i-x" />
          </svg>
        </button>
      </div>
    );
  };

  const ledger = (heading: string, group: LineGroup, rows: ConsoleLine[], total: number) => (
    <section className={cx("card")}>
      <div className={cx("sp-h")}>
        <div className={cx("sp-h-txt")}>
          <h2 className={cx("sp-t")}>{heading}</h2>
        </div>
        <div className={cx("sp-cardtotal")}>{money(total)}</div>
      </div>
      <div className={cx("sp-thead")}>
        <span>Item</span>
        <span>Qty</span>
        <span>Price</span>
        <span>Total</span>
        <span className={cx("sp-th-x")} aria-hidden="true" />
      </div>
      <div>{rows.map(row)}</div>
      {rows.length === 0 && <div className={cx("sp-empty")}>Nothing here yet.</div>}
      <button
        className={cx("sp-add")}
        type="button"
        disabled={uiLocked}
        onClick={() => addLine(group)}
      >
        <svg className={cx("ic")}>
          <use href="#i-plus" />
        </svg>
        Add {group === "labor" ? "labor" : "material"} line
      </button>
    </section>
  );

  // ══════════════ PANEL 1 — INTAKE CONSOLE ══════════════
  if (panel === "intake") {
    const totalPhotoMb = photos.reduce((n, p) => n + p.size, 0) / (1024 * 1024);
    return (
      <>
        <div className={cx("page-head")}>
          <div>
            <div className={cx("kicker")}>{INTAKE.kicker}</div>
            <h1 className={cx("page-title")}>{INTAKE.title}</h1>
          </div>
        </div>

        <section className={cx("card", "est-console")}>
          <div className={cx("est-mast")}>
            <span className={cx("est-mark")}>
              <svg className={cx("ic")}>
                <use href="#i-bulb" />
              </svg>
            </span>
            <div>
              <h2 className={cx("est-title")}>{INTAKE.consoleTitle}</h2>
              <p className={cx("est-lede")}>{INTAKE.lede}</p>
            </div>
          </div>

          <div className={cx("est-rail")}>
            {/* 1 — PROJECT TYPE */}
            <div
              className={cx(
                "est-step",
                ptype && (ptype !== "other" || otherWork.trim()) && "done",
              )}
            >
              <span className={cx("est-n")}>1</span>
              <div className={cx("est-body")}>
                <div className={cx("est-h")}>{INTAKE.steps.type.h}</div>
                <div className={cx("est-hint")}>{INTAKE.steps.type.hint}</div>
                <div className={cx("ptypes")}>
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={cx("ptype", ptype === t.id && "on")}
                      aria-pressed={ptype === t.id}
                      onClick={() => setPtype(t.id)}
                    >
                      <svg className={cx("ic")}>
                        <use href={`#${t.icon}`} />
                      </svg>
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* "Other work" used to select a dead flag: the trade never
                    reached the pricing model, so a pergola priced as "other".
                    Its text is now the projectType the actions receive. */}
                {ptype === "other" && (
                  <label className={cx("est-field", "other-field")} htmlFor={otherId}>
                    <span className={cx("est-lbl")}>
                      {LIVE.otherLabel} <b className={cx("req")}>*</b>
                    </span>
                    <input
                      id={otherId}
                      className={cx("est-in", errOther && "est-in--bad")}
                      placeholder={LIVE.otherPlaceholder}
                      autoComplete="off"
                      value={otherWork}
                      aria-invalid={errOther || undefined}
                      onChange={(e) => {
                        setOtherWork(e.target.value);
                        if (e.target.value.trim()) setErrOther(false);
                      }}
                    />
                    {errOther && <span className={cx("est-err")}>{LIVE.otherError}</span>}
                  </label>
                )}
              </div>
            </div>

            {/* 2 — LOCATION */}
            <div className={cx("est-step", (addr.trim() || usState) && "done")}>
              <span className={cx("est-n")}>2</span>
              <div className={cx("est-body")}>
                <div className={cx("est-h")}>{INTAKE.steps.location.h}</div>
                <div className={cx("est-hint")}>{INTAKE.steps.location.hint}</div>
                <div className={cx("loc-row")}>
                  <label className={cx("est-field")} htmlFor={addrId}>
                    <span className={cx("est-lbl")}>Address or city</span>
                    <input
                      ref={addrRef}
                      id={addrId}
                      className={cx("est-in")}
                      placeholder={INTAKE.addressPlaceholder}
                      defaultValue={addr}
                      // Uncontrolled ON PURPOSE: attachPlacesSuggest writes the
                      // picked address straight into input.value, and a
                      // controlled value would fight it on the next render.
                    />
                  </label>
                  <div className={cx("est-field")}>
                    <span className={cx("est-lbl")} id={`${stateId}-l`}>
                      State
                    </span>
                    <BlueprintSelect
                      id={stateId}
                      value={usState}
                      onChange={pickState}
                      options={STATE_OPTIONS}
                      placeholder="State"
                      ariaLabel="State"
                      triggerClass="est-in"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3 — THE BRIEF */}
            <div className={cx("est-step", brief.trim() && "done")}>
              <span className={cx("est-n")}>3</span>
              <div className={cx("est-body")}>
                <div className={cx("est-h")}>{INTAKE.steps.brief.h}</div>
                <div className={cx("est-hint")}>{INTAKE.steps.brief.hint}</div>
                <textarea
                  id={briefId}
                  className={cx("est-area")}
                  aria-label={INTAKE.steps.brief.h}
                  placeholder={INTAKE.briefPlaceholder}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
                <div className={cx("samples")}>
                  {SAMPLES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cx("sample")}
                      onClick={() => setBrief(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* PHOTOS — read in the browser, sent as data URLs, never stored. */}
                <div className={cx("ph")}>
                  <div className={cx("ph-l")}>
                    {LIVE.photos.h}
                    <span>{LIVE.photos.hint}</span>
                  </div>
                  <div
                    className={cx("ph-drop", dragOver && "on")}
                    role="button"
                    tabIndex={0}
                    aria-label={LIVE.photos.cta}
                    onClick={() => photoInput.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        photoInput.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      void takeFiles(e.dataTransfer.files);
                    }}
                  >
                    <svg className={cx("ic", "ph-ic")}>
                      <use href="#i-imgadd" />
                    </svg>
                    <span className={cx("ph-cta")}>{LIVE.photos.cta}</span>
                    <span className={cx("ph-note")}>{LIVE.photos.privacy}</span>
                  </div>
                  <input
                    ref={photoInput}
                    className={cx("ph-file")}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      void takeFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {photoErr && <div className={cx("est-err")}>{photoErr}</div>}
                  {photos.length > 0 && (
                    <>
                      <div className={cx("ph-strip")}>
                        {photos.map((p) => (
                          <span className={cx("ph-thumb")} key={p.id}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.dataUrl} alt={p.name} />
                            <button
                              type="button"
                              className={cx("ph-x")}
                              aria-label={`Remove ${p.name}`}
                              onClick={() => setPhotos((f) => f.filter((x) => x.id !== p.id))}
                            >
                              <svg className={cx("ic")}>
                                <use href="#i-x" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className={cx("ph-count")}>
                        {photos.length} of {PHOTO_MAX_COUNT} · {totalPhotoMb.toFixed(1)} MB
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={cx("est-bar")}>
            {/* The console's feedback channel. A live region because the run
                takes seconds and the Generate button is disabled throughout —
                without it a screen-reader user hears nothing at all. */}
            <span
              className={cx("est-status", generating && "run", genError && "bad")}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {genError || (generating ? INTAKE.running : "")}
            </span>
            <button
              className={cx("btn", "btn-primary")}
              type="button"
              disabled={!canGenerate}
              onClick={generate}
            >
              <svg className={cx("ic")}>
                <use href="#i-bulb" />
              </svg>
              <span>{generating ? "Generating…" : INTAKE.cta}</span>
            </button>
          </div>
        </section>

        {generating && (
          <GenerateOverlay stageIdx={stageIdx} done={genDone} exiting={genExit} />
        )}
        {clarify && <ClarifyDialog questions={clarify} onSettle={settleClarify} />}
      </>
    );
  }

  // ══════════════ PANEL 2 — THE ESTIMATE ══════════════
  return (
    <>
      {/* PAGE HEAD */}
      <div className={cx("page-head")}>
        <div className={cx("page-head-txt")}>
          <div className={cx("kicker")}>{LIVE.kicker}</div>
          <h1 className={cx("page-title")}>{title || "Estimate"}</h1>
          <div className={cx("sp-brief")}>
            {[typeUsed, locationUsed, timelineDays ? `${timelineDays} days` : ""]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className={cx("sp-head-btns")}>
          <button
            className={cx("btn", "btn-danger")}
            type="button"
            disabled={uiLocked || saveBusy}
            onClick={startOver}
          >
            <svg className={cx("ic")}>
              <use href="#i-undo" />
            </svg>
            Start over
          </button>
          <button
            className={cx("btn", "btn-primary")}
            type="button"
            disabled={uiLocked || saveBusy || lines.length === 0}
            onClick={saveAsProposal}
          >
            <svg className={cx("ic")}>
              <use href="#i-file" />
            </svg>
            {saveBusy ? "Saving…" : "Save as proposal"}
          </button>
        </div>
      </div>

      {demoMode && (
        <div className={cx("sp-flag")} role="status">
          Placeholder pricing — no estimator key is configured on this environment.
        </div>
      )}

      <div className={cx("sp-grid")}>
        <div className={cx("sp-main")}>
          {ledger("Materials", "materials", materials, totals.materials)}
          {ledger("Labor", "labor", labor, totals.labor)}

          {/* MATERIALS REQUEST — derived from the ledger, not mirrored from it. */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div className={cx("sp-h-txt")}>
                <h2 className={cx("sp-t")}>Materials request</h2>
              </div>
              <span className={cx("sp-req-count")}>
                {reqRows.length} {reqRows.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div>
              {reqRows.map((r) => {
                // merchantUrl is the render-time guard: it rejects Google
                // interstitials and AI-fabricated retailer paths and swaps them
                // for the store's own search. Null means there is nowhere real
                // to send the contractor, so no button is drawn.
                const buy = merchantUrl(r.store, [r.name, r.dimensions].filter(Boolean).join(" "), r.productUrl);
                return (
                  <div className={cx("sp-req-row")} key={r.id}>
                    <span className={cx("sp-thumb")}>
                      <MaterialThumb src={r.imageUrl ?? null} alt="" />
                    </span>
                    <span className={cx("sp-req-main")}>
                      <span className={cx("sp-req-n")}>{r.name || "Untitled line"}</span>
                      <span className={cx("sp-req-m")}>
                        {r.dimensions && <span>{r.dimensions}</span>}
                        <span>
                          Qty {r.qty} {r.unit}
                        </span>
                        {r.store ? (
                          <span className={cx("sp-store")}>{r.store}</span>
                        ) : (
                          <span className={cx("sp-store", "sp-store--none")}>No retail source</span>
                        )}
                      </span>
                    </span>
                    <span className={cx("sp-req-price")}>
                      <b>{money(r.total)}</b>
                      <span>
                        {/* The retail price is what the store charges and never
                            follows a typed price — the override rides beside it
                            in parentheses instead of replacing it. */}
                        {r.retailUnitPrice != null
                          ? `${moneyU(r.retailUnitPrice)} / ${r.unit}`
                          : `${moneyU(r.unitPrice)} / ${r.unit}`}
                        {r.overridden && (
                          <i className={cx("sp-req-ov")}> (billed {moneyU(r.unitPrice)})</i>
                        )}
                      </span>
                    </span>
                    {buy && (
                      <a
                        className={cx("sp-req-link")}
                        href={buy}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Buy ${r.name || "this item"}${r.store ? ` at ${r.store}` : ""}`}
                      >
                        <svg className={cx("ic")}>
                          <use href="#i-arrow" />
                        </svg>
                      </a>
                    )}
                  </div>
                );
              })}
              {reqRows.length === 0 && (
                <div className={cx("sp-empty")}>No materials on this estimate.</div>
              )}
            </div>
            <div className={cx("sp-reqtotal")}>
              <span>Total material cost</span>
              <b>{money(reqTotal)}</b>
            </div>
          </section>

          {/* SCOPE */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div className={cx("sp-h-txt")}>
                <h2 className={cx("sp-t")}>Scope of work</h2>
              </div>
            </div>
            <textarea
              className={cx("sp-scope")}
              spellCheck={false}
              aria-label="Scope of work"
              value={scope}
              disabled={uiLocked}
              onChange={(e) => setScope(e.target.value)}
            />
          </section>
        </div>

        <div className={cx("sp-rail")}>
          {/* SUMMARY */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div className={cx("sp-h-txt")}>
                <h2 className={cx("sp-t")}>Summary</h2>
              </div>
            </div>
            <div className={cx("sp-sumrow")}>
              <span>Materials</span>
              <b>{money(totals.materials)}</b>
            </div>
            <div className={cx("sp-sumrow")}>
              <span>Labor</span>
              <b>{money(totals.labor)}</b>
            </div>
            {totals.discountCash > 0 && (
              <div className={cx("sp-sumrow", "sp-sumrow--disc")}>
                <span>Discount{discount.mode === "pct" ? ` · ${discount.value}%` : ""}</span>
                <b>{moneySigned(totals.discountCash)}</b>
              </div>
            )}
            <div className={cx("sp-sumrow")}>
              <span>Tax{tax.pct ? ` · ${tax.pct}%` : ""}</span>
              <b>{money(totals.taxCash)}</b>
            </div>
            <div className={cx("sp-sumtotal")}>
              <span>Total</span>
              <b>{money(totals.total)}</b>
            </div>

            {/* The two fields that move that total. The old −$150 constant was a
                label with no input behind it. */}
            <div className={cx("sp-adj")}>
              <label className={cx("sp-adj-f")}>
                <span className={cx("sp-adj-l")}>Discount</span>
                <span className={cx("sp-adj-in")}>
                  <input
                    className={cx("sp-in")}
                    type="number"
                    min="0"
                    max={discount.mode === "pct" ? 100 : MAX_MONEY}
                    step={discount.mode === "pct" ? 1 : 10}
                    inputMode="decimal"
                    value={cellValue("disc", discount.value)}
                    aria-label="Discount amount"
                    disabled={uiLocked}
                    onChange={(e) => {
                      setField({ key: "disc", text: e.target.value });
                      setDiscount((d) => ({
                        ...d,
                        value: clampNum(e.target.value, d.mode === "pct" ? 100 : MAX_MONEY),
                      }));
                    }}
                    onBlur={() => setField((f) => (f?.key === "disc" ? null : f))}
                  />
                  <span className={cx("sp-tog")} role="group" aria-label="Discount unit">
                    <button
                      type="button"
                      className={cx("sp-tog-b", discount.mode === "pct" && "on")}
                      aria-pressed={discount.mode === "pct"}
                      disabled={uiLocked}
                      onClick={() =>
                        setDiscount((d) => ({ mode: "pct", value: Math.min(d.value, 100) }))
                      }
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={cx("sp-tog-b", discount.mode === "amt" && "on")}
                      aria-pressed={discount.mode === "amt"}
                      disabled={uiLocked}
                      onClick={() => setDiscount((d) => ({ ...d, mode: "amt" }))}
                    >
                      $
                    </button>
                  </span>
                </span>
              </label>

              <label className={cx("sp-adj-f")}>
                <span className={cx("sp-adj-l")}>Tax %</span>
                <span className={cx("sp-adj-in")}>
                  <input
                    className={cx("sp-in")}
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    inputMode="decimal"
                    value={cellValue("tax", tax.pct)}
                    aria-label="Tax percent"
                    disabled={uiLocked}
                    onChange={(e) => {
                      setField({ key: "tax", text: e.target.value });
                      setTax({ pct: clampNum(e.target.value, 30), pinned: true });
                    }}
                    onBlur={() => setField((f) => (f?.key === "tax" ? null : f))}
                  />
                </span>
              </label>
            </div>
            {tax.pinned && (
              // Honest caveat: convertEstimateToProposal derives the proposal's
              // tax from the job's state (lib/pricing/salesTax — the same table
              // this field seeds from), so a manual rate moves this sheet but
              // not the saved proposal. Changing that is a data-layer change.
              <div className={cx("sp-adj-note")}>
                Manual rate. The saved proposal taxes at the job state&apos;s rate.
              </div>
            )}
          </section>

          {/* REFINE */}
          <section className={cx("card")}>
            <div className={cx("sp-h")}>
              <div className={cx("sp-h-txt")}>
                <h2 className={cx("sp-t")}>Change the estimate</h2>
              </div>
            </div>

            {!pending && !refineBusy && (
              <div>
                <textarea
                  className={cx("sp-refine-in")}
                  spellCheck={false}
                  maxLength={4000}
                  placeholder={LIVE.refinePlaceholder}
                  aria-label="Change the estimate"
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                />
                {openQuestions.length > 0 && (
                  <div className={cx("sp-qs")}>
                    <div className={cx("sp-asm-l")}>Worth confirming</div>
                    {openQuestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        className={cx("sp-q")}
                        onClick={() =>
                          setRefineText((t) => (t ? `${t.trim()} ${q}` : q))
                        }
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                <div className={cx("sp-apply-row")}>
                  <button
                    className={cx("btn", "btn-primary", "sp-apply")}
                    type="button"
                    disabled={!canApply}
                    onClick={applyChanges}
                  >
                    Apply changes
                  </button>
                  {/* Undo lives here, beside the control that creates the thing
                      it undoes — not up in the page head next to Start over. */}
                  {undoSnap && (
                    <button className={cx("btn", "btn-warning")} type="button" onClick={undo}>
                      <svg className={cx("ic")}>
                        <use href="#i-undo" />
                      </svg>
                      Undo
                    </button>
                  )}
                </div>

                {/* ASSUMPTIONS — moved out of Summary. They are an INPUT to the
                    refine (the action takes them as ground truth), so they
                    belong with the control that sends them. */}
                <div className={cx("sp-asm")}>
                  <div className={cx("sp-asm-l")}>Assumptions</div>
                  <div>
                    {assumptions.map((a, i) => (
                      <div className={cx("sp-asm-row")} key={`asm-${i}`}>
                        {/* A textarea, not an input: assumptions are whole
                            sentences and the rail is narrow, so a single-line
                            field clipped the half that carries the meaning. */}
                        <GrowText
                          className={cx("sp-asm-in")}
                          value={a}
                          ariaLabel={`Assumption ${i + 1}`}
                          onChange={(v) =>
                            setAssumptions((rows) => rows.map((x, j) => (j === i ? v : x)))
                          }
                        />
                        <button
                          className={cx("sp-asm-x")}
                          type="button"
                          aria-label={`Remove assumption ${i + 1}`}
                          onClick={() => setAssumptions((rows) => rows.filter((_, j) => j !== i))}
                        >
                          <svg className={cx("ic")}>
                            <use href="#i-x" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {assumptions.length === 0 && (
                      <div className={cx("sp-empty")}>None — add what the price depends on.</div>
                    )}
                  </div>
                  <button
                    className={cx("sp-add")}
                    type="button"
                    onClick={() => setAssumptions((rows) => [...rows, ""])}
                  >
                    <svg className={cx("ic")}>
                      <use href="#i-plus" />
                    </svg>
                    Add assumption
                  </button>
                </div>
              </div>
            )}

            {refineBusy && (
              <div>
                <div className={cx("sp-busy")}>
                  <span className={cx("sp-busy-dot")}></span>Editing the estimate…
                </div>
              </div>
            )}

            {pending && (
              <div>
                <div className={cx("sp-diff-l")}>Review changes</div>
                {pending.warnings.map((w) => (
                  <div className={cx("sp-warn")} key={w}>
                    {w}
                  </div>
                ))}
                {pending.rows.map((d, i) => (
                  <div className={cx("sp-diff-row")} key={`${d.name}-${i}`}>
                    <span
                      className={cx(
                        "sp-pill",
                        d.kind === "Added"
                          ? "sp-pill--add"
                          : d.kind === "Removed"
                            ? "sp-pill--del"
                            : "sp-pill--chg",
                      )}
                    >
                      {d.kind}
                    </span>
                    <div className={cx("sp-diff-txt")}>
                      <b>{d.name}</b>
                      <i>{d.detail}</i>
                    </div>
                  </div>
                ))}
                {pending.rows.length === 0 && (
                  <div className={cx("sp-empty")}>Only caveats — no line changes.</div>
                )}
                <div className={cx("sp-diff-btns")}>
                  <button className={cx("btn", "btn-primary")} type="button" onClick={keepChanges}>
                    Keep changes
                  </button>
                  <button
                    className={cx("btn", "btn-ghost")}
                    type="button"
                    onClick={() => setPending(null)}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** A one-line-looking textarea that grows to whatever it holds. */
function GrowText({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // Refit when the text changes underneath us — a refine rewrites assumptions
  // wholesale, and a two-line one landing in a one-line box would be clipped.
  useEffect(() => fit(ref.current), [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        fit(e.currentTarget);
        onChange(e.target.value);
      }}
    />
  );
}

/**
 * The generation overlay.
 *
 * Hand-rolled, like every other dialog here (no Radix). It is mounted only
 * while a request is in flight, so it cannot outlive one; `stageIdx` is driven
 * by the caller's real promise state. Portalled into `.content` because every
 * rule in the module is scoped under it.
 */
function GenerateOverlay({
  stageIdx,
  done,
  exiting,
}: {
  stageIdx: number;
  done: boolean;
  exiting: boolean;
}) {
  // Resolved lazily rather than in an effect: this component only ever mounts
  // in response to a click, so `document` is always there and there is no
  // hydration pass to disagree with.
  const [host] = useState<HTMLElement | null>(() =>
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(".jf-blueprint .content"),
  );
  if (!host) return null;
  return createPortal(
    <div
      className={cx("gen")}
      data-exit={exiting ? "1" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Building the estimate"
    >
      <div className={cx("gen-box")}>
        <div className={cx("gen-kicker")}>Smart Proposal</div>
        <div className={cx("gen-h")}>{done ? GEN_DONE : "Building the estimate"}</div>
        <ul className={cx("gen-list")}>
          {GEN_STAGES.map((st, i) => {
            const state = done || i < stageIdx ? "done" : i === stageIdx ? "now" : "wait";
            return (
              <li className={cx("gen-row")} data-state={state} key={st.id}>
                {/* The square's outline is SVG, not a CSS border, because the
                    ACTIVE state draws a line travelling around that outline —
                    a dash walking a rect's perimeter, which `border` cannot do.
                    Both rects are always present so the state change is a paint,
                    never a remount that would restart the walk mid-step. */}
                <span className={cx("gen-mark")} aria-hidden="true">
                  <svg className={cx("gen-ring")} viewBox="0 0 20 20">
                    <rect className={cx("gen-ring-track")} x="1" y="1" width="18" height="18" />
                    <rect className={cx("gen-ring-run")} x="1" y="1" width="18" height="18" />
                  </svg>
                  <svg className={cx("ic")}>
                    <use href="#i-check" />
                  </svg>
                </span>
                <span className={cx("gen-txt")}>{st.label}</span>
              </li>
            );
          })}
        </ul>
        <div className={cx("gen-foot")} role="status" aria-live="polite">
          {done ? GEN_DONE : (GEN_STAGES[Math.min(stageIdx, GEN_STAGES.length - 1)]?.label ?? "")}
        </div>
      </div>
    </div>,
    host,
  );
}

/**
 * The intake gate's questions — shown BEFORE anything is priced.
 *
 * `analyzeEstimatePrompt` already ran and already decided the brief was thin;
 * this dialog spends that decision instead of discarding it into a post-hoc
 * "the AI had to assume" note. Every question takes a custom answer, so the
 * options can never trap a contractor whose job does not fit them, and
 * "Generate anyway" is always one press away — the gate advises, it never
 * blocks.
 *
 * Settling is deliberately three-valued: answers (some or none) resume
 * generation, `null` abandons it. Escape and the scrim mean abandon, not
 * "generate anyway", because a stray keystroke must not spend a model call.
 */
function ClarifyDialog({
  questions,
  onSettle,
}: {
  questions: ClarifyQuestion[];
  onSettle: (value: ClarifyAnswer[] | null) => void;
}) {
  const [host] = useState<HTMLElement | null>(() =>
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(".jf-blueprint .content"),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [exiting, setExiting] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // The dialog settles exactly once. Escape during the exit window, or a second
  // click on a button that is still painted, must not resume generation twice.
  const settled = useRef(false);

  const settle = useCallback(
    (value: ClarifyAnswer[] | null) => {
      if (settled.current) return;
      settled.current = true;
      if (reducedMotion()) {
        onSettle(value);
        return;
      }
      setExiting(true);
      setTimeout(() => onSettle(value), MDL_EXIT_MS);
    },
    [onSettle],
  );

  // Scroll lock, focus in, Tab trap, Escape. Reference-counted lock — never a
  // hand-rolled body.style.overflow, which poisons any sheet opened over it.
  useEffect(() => {
    const release = lockScroll();
    const restore = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const SELECTOR =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(null);
        return;
      }
      if (e.key !== "Tab") return;
      const node = boxRef.current;
      if (!node) return;
      const list = Array.from(node.querySelectorAll<HTMLElement>(SELECTOR));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      release();
      restore?.focus?.();
    };
  }, [settle]);

  if (!host) return null;

  const pairs = (): ClarifyAnswer[] =>
    questions
      .filter((q) => (answers[q.id] ?? "").trim())
      .map((q) => ({ question: q.question, answer: (answers[q.id] ?? "").trim() }));
  const answered = pairs().length;

  return createPortal(
    <div
      className={cx("clq")}
      data-exit={exiting ? "1" : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) settle(null);
      }}
    >
      <div
        ref={boxRef}
        className={cx("clq-box")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clq-title"
        tabIndex={-1}
      >
        <div className={cx("clq-head")}>
          <div className={cx("clq-kicker")}>Smart Proposal · Intake</div>
          <div className={cx("clq-h")} id="clq-title">
            A few quick questions
          </div>
          <p className={cx("clq-sub")}>
            The brief is thin for this kind of job. Answer what you can and the estimate is
            priced against real numbers instead of assumptions — or generate anyway and
            tighten it afterwards.
          </p>
        </div>

        <div className={cx("clq-body")}>
          {questions.map((q, i) => {
            const value = answers[q.id] ?? "";
            const isCustom = Boolean(custom[q.id]);
            // An option-less "select" is unanswerable; the server already
            // downgrades those, and this is the second belt.
            const kind =
              q.kind === "select" && q.options && q.options.length > 0
                ? "select"
                : q.kind === "number"
                  ? "number"
                  : "text";
            return (
              <div className={cx("clq-q")} key={q.id}>
                <span className={cx("clq-n")} aria-hidden="true">
                  {i + 1}
                </span>
                <div className={cx("clq-qt")}>
                  <label htmlFor={`clq-in-${q.id}`}>{q.question}</label>

                  {kind === "select" && q.options ? (
                    <div className={cx("clq-opts")}>
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={cx("clq-opt")}
                          data-on={!isCustom && value === opt ? "1" : undefined}
                          aria-pressed={!isCustom && value === opt}
                          onClick={() => {
                            setCustom((c) => ({ ...c, [q.id]: false }));
                            setAnswers((a) => ({ ...a, [q.id]: opt }));
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={cx("clq-opt", "clq-opt--other")}
                        data-on={isCustom ? "1" : undefined}
                        aria-pressed={isCustom}
                        onClick={() => {
                          setCustom((c) => ({ ...c, [q.id]: true }));
                          setAnswers((a) => ({ ...a, [q.id]: "" }));
                        }}
                      >
                        Something else
                      </button>
                    </div>
                  ) : null}

                  {kind === "number" && !isCustom ? (
                    <div className={cx("clq-numrow")}>
                      <input
                        id={`clq-in-${q.id}`}
                        type="number"
                        inputMode="decimal"
                        className={cx("clq-in", "clq-num")}
                        value={value}
                        placeholder={q.placeholder ?? "0"}
                        onChange={(e) =>
                          setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                        }
                      />
                      {q.unit ? <span className={cx("clq-unit")}>{q.unit}</span> : null}
                    </div>
                  ) : null}

                  {kind === "text" || isCustom ? (
                    <textarea
                      id={`clq-in-${q.id}`}
                      className={cx("clq-in")}
                      rows={2}
                      value={value}
                      placeholder={q.placeholder ?? "Type your answer…"}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className={cx("clq-foot")}>
          <span className={cx("clq-count")} role="status" aria-live="polite">
            {answered} of {questions.length} answered
          </span>
          <div className={cx("clq-acts")}>
            <button type="button" className={cx("btn", "btn-ghost")} onClick={() => settle([])}>
              Generate anyway
            </button>
            <button
              type="button"
              className={cx("btn", "btn-primary")}
              disabled={answered === 0}
              onClick={() => settle(pairs())}
            >
              Use answers
            </button>
          </div>
        </div>
      </div>
    </div>,
    host,
  );
}
