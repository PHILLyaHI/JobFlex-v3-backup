"use client";
import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, Pencil, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import type { ClarifyQuestion } from "@/lib/estimatorSchema";
import { lockScroll } from "@/lib/scrollLock";

interface Props {
  open: boolean;
  questions: ClarifyQuestion[];
  /** Answered Q→A pairs, formatted for appending to the brief. */
  onSubmit: (clarifications: string[]) => void;
  /** Generate without answering. */
  onSkip: () => void;
}

/**
 * Guided intake. When the brief is thin, the AI asks 3-8 targeted questions.
 * Every question accepts a custom answer (the "Something else" path), so the
 * options never trap the contractor. Visually deliberate — bold tonal header,
 * sage numerals, color-blocked selections — so it reads as a distinct moment,
 * not another flat form.
 */
export function ClarifyingQuestions({ open, questions, onSubmit, onSkip }: Props) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [customOpen, setCustomOpen] = React.useState<Record<string, boolean>>({});
  const reduce = useReducedMotion();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);
  // Keep the latest onSkip without making it an effect dependency (the parent
  // recreates it each render; depending on it would re-run the focus effect and
  // steal focus mid-typing).
  const onSkipRef = React.useRef(onSkip);
  onSkipRef.current = onSkip;

  // Reset whenever a fresh set of questions arrives.
  React.useEffect(() => {
    if (open) {
      setAnswers({});
      setCustomOpen({});
    }
  }, [open, questions]);

  // Focus management: move focus in, trap Tab, lock body scroll, and restore
  // focus to the trigger on close (WCAG 2.4.3 / modal expectations).
  React.useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    const releaseScroll = lockScroll();
    dialogRef.current?.focus();

    const SELECTOR =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkipRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
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
      releaseScroll();
      restoreRef.current?.focus?.();
    };
  }, [open]);

  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;

  function pickOption(q: ClarifyQuestion, opt: string) {
    setCustomOpen((c) => ({ ...c, [q.id]: false }));
    setAnswers((a) => ({ ...a, [q.id]: opt }));
  }
  function openCustom(q: ClarifyQuestion) {
    setCustomOpen((c) => ({ ...c, [q.id]: true }));
    setAnswers((a) => ({ ...a, [q.id]: "" }));
  }

  function submit() {
    const pairs = questions
      .filter((q) => answers[q.id]?.trim())
      .map((q) => `${q.question} → ${answers[q.id].trim()}`);
    onSubmit(pairs);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--ink)_55%,transparent)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onSkip}
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-[6vh] pointer-events-none">
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="clarify-title"
              tabIndex={-1}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.985 }}
              transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="paper-card pointer-events-auto w-full max-w-lg overflow-hidden !p-0 shadow-pop focus:outline-none"
            >
              {/* Bold tonal header — the deliberate departure from the flat default. */}
              <div className="relative overflow-hidden bg-[color:var(--accent-soft)] px-6 pt-6 pb-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] blur-2xl"
                />
                <div className="relative flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--accent)] text-white shadow-[0_4px_12px_-4px_rgba(31,122,82,0.5)]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="clarify-title"
                      className="font-display text-[19px] leading-tight tracking-[-0.015em] text-[color:var(--accent-ink)]"
                    >
                      A few quick questions
                    </h2>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[color-mix(in_srgb,var(--accent-ink)_82%,transparent)]">
                      Your brief is a little thin. Answer what you can for a sharper estimate; every
                      question takes a custom answer, and you can skip.
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-h-[52vh] space-y-6 overflow-y-auto px-6 py-6">
                {questions.map((q, i) => {
                  const value = answers[q.id] ?? "";
                  const isCustom = customOpen[q.id];
                  // An option-less "select" is unanswerable — fall back to text.
                  const effectiveKind =
                    q.kind === "select" && q.options && q.options.length > 0
                      ? "select"
                      : q.kind === "number"
                        ? "number"
                        : "text";
                  return (
                    <div key={q.id} className="flex gap-3.5">
                      {/* Sage numeral — the recurring motif / anchor. */}
                      <span className="font-display text-[20px] leading-none tabular text-[color:var(--accent)] pt-0.5">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-[color:var(--ink)]">
                          {q.question}
                        </div>

                        {effectiveKind === "select" && q.options ? (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {q.options.map((opt) => {
                              const active = !isCustom && value === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => pickOption(q, opt)}
                                  className={cn(
                                    "focus-ring rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all",
                                    active
                                      ? "bg-[color:var(--accent)] text-white shadow-[0_3px_10px_-4px_rgba(31,122,82,0.6)]"
                                      : "hairline text-[color:var(--ink-soft)] hover:bg-black/[0.04] hover:-translate-y-px",
                                  )}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => openCustom(q)}
                              className={cn(
                                "focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all",
                                isCustom
                                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                                  : "hairline text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                              )}
                            >
                              <Pencil className="h-3 w-3" />
                              Something else
                            </button>
                          </div>
                        ) : null}

                        {/* Custom text for a select, or the primary input for number/text. */}
                        {(isCustom || effectiveKind === "number" || effectiveKind === "text") && (
                          <div className="mt-2.5">
                            {effectiveKind === "text" || isCustom ? (
                              <Textarea
                                rows={2}
                                value={value}
                                placeholder={q.placeholder ?? "Type your answer…"}
                                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={value}
                                  placeholder={q.placeholder ?? "0"}
                                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                                  className="h-10 w-[140px] rounded-[var(--r-md)] bg-white/60 px-3 text-sm text-[color:var(--ink)] hairline outline-none focus-visible:shadow-[0_0_0_3px_rgba(31,122,82,0.18)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                {q.unit && (
                                  <span className="text-[12px] text-[color:var(--ink-muted)]">{q.unit}</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[color:var(--ink-line)] px-6 py-4">
                <span className="text-[11.5px] tabular text-[color:var(--ink-muted)]">
                  {answeredCount} of {questions.length} answered
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={onSkip}>
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    onClick={submit}
                    disabled={answeredCount === 0}
                    icon={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Use answers
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
