"use client";
import * as React from "react";
import { Check, Plus, Radio, ArrowRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/Toast";
import { createTradeJob } from "@/actions/tradeServices";
import { TRADE_TYPES, URGENCY, type Urgency, skillSuggestions } from "./trade-data";

interface PostJobSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful post so the parent can refresh + switch tabs. */
  onPosted: () => void;
}

const URGENCY_KEYS: Urgency[] = ["low", "medium", "high", "urgent"];

export function PostJobSheet({ open, onClose, onPosted }: PostJobSheetProps) {
  const [title, setTitle] = React.useState("");
  const [tradeType, setTradeType] = React.useState("");
  const [specialties, setSpecialties] = React.useState<string[]>([]);
  const [description, setDescription] = React.useState("");
  const [urgency, setUrgency] = React.useState<Urgency>("medium");
  const [location, setLocation] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [timeWindow, setTimeWindow] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<{ count: number } | null>(null);

  const titleErr =
    submitted && title.trim().length < 5
      ? "Add a short, clear title (at least 5 characters)."
      : undefined;
  const descErr =
    submitted && description.trim().length < 20
      ? "Give enough detail to scope the job (at least 20 characters)."
      : undefined;
  const tradeErr =
    submitted && !tradeType ? "Pick a trade so we notify the right pros." : undefined;

  function reset() {
    setTitle("");
    setTradeType("");
    setSpecialties([]);
    setDescription("");
    setUrgency("medium");
    setLocation("");
    setBudget("");
    setTimeWindow("");
    setSubmitted(false);
    setSuccess(null);
  }

  function close() {
    reset();
    onClose();
  }

  function changeTrade(next: string) {
    setTradeType(next);
    setSpecialties([]); // skills are trade-specific; start fresh
  }

  function toggleSkill(skill: string) {
    setSpecialties((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  async function submit() {
    setSubmitted(true);
    if (title.trim().length < 5 || description.trim().length < 20 || !tradeType) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await createTradeJob({
        title: title.trim(),
        description: description.trim(),
        tradeType,
        specialties,
        location: location.trim() || null,
        budget: budget.trim() || null,
        timeWindow: timeWindow.trim() || null,
        urgency,
      });
      onPosted();
      setSuccess({ count: res.broadcastCount });
    } catch (e: unknown) {
      toast.error("Couldn't post job", e instanceof Error ? e.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={close} title={success ? undefined : "Post a job"}>
      {success ? (
        <SuccessView
          count={success.count}
          onDone={close}
          onAnother={reset}
        />
      ) : (
        <div className="-mt-1">
          <p className="text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
            Hand off a job you can&apos;t take. We notify matching contractors near you;
            interested pros open a private chat with you.
          </p>

          <div className="mt-5 space-y-5">
            <Input
              label="Title"
              placeholder="e.g. Master bath tile re-do"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={titleErr}
            />

            <Select
              label="Trade"
              value={tradeType}
              onChange={(e) => changeTrade(e.target.value)}
            >
              <option value="" disabled>
                Choose a trade…
              </option>
              {TRADE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            {tradeErr && (
              <p className="-mt-3.5 text-[11px] text-[color:var(--rose)]">{tradeErr}</p>
            )}

            {/* Skills */}
            <div className="flex flex-col gap-2">
              <span className="quiet-caps">Skills needed</span>
              <div className="flex flex-wrap gap-2">
                {skillSuggestions(tradeType).map((skill) => {
                  const on = specialties.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors focus-ring",
                        on
                          ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                          : "hairline text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)]",
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>

            <Textarea
              label="Description"
              rows={5}
              placeholder="What's the scope? Square footage, materials, why you're handing it off…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={descErr}
            />

            {/* Urgency */}
            <div className="flex flex-col gap-2">
              <span className="quiet-caps">Urgency</span>
              <div className="grid grid-cols-4 gap-2">
                {URGENCY_KEYS.map((k) => {
                  const on = urgency === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setUrgency(k)}
                      aria-pressed={on}
                      className={cn(
                        "min-h-[44px] rounded-[var(--r-md)] px-1 text-[12px] font-medium transition-colors focus-ring",
                        on
                          ? "bg-[color:var(--accent)] text-white"
                          : "hairline text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)]",
                      )}
                    >
                      {URGENCY[k].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Budget"
                placeholder="$2,400–3,000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
              <Input
                label="Timeline"
                placeholder="Within 2 weeks"
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value)}
              />
            </div>

            <Input
              label="Location"
              placeholder="City + distance, e.g. Bend, OR · 8 mi"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {/* Sticky submit */}
          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-[color:var(--ink-line)] bg-[color:var(--paper)] px-5 pt-3 pb-1">
            {tradeType && (
              <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--ink-muted)]">
                <Radio className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                We&apos;ll notify contractors whose trade and skills match.
              </p>
            )}
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              className="h-12 w-full"
              onClick={submit}
              loading={submitting}
            >
              Post to network
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function SuccessView({
  count,
  onDone,
  onAnother,
}: {
  count: number;
  onDone: () => void;
  onAnother: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-2 pb-2 pt-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
        <Check className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-display text-[22px] tracking-[-0.02em] text-[color:var(--ink)]">
        Posted to the network
      </h2>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
        Broadcast to{" "}
        <span className="stat-numeric text-[color:var(--accent-ink)]">{count}</span> matching
        pros. We&apos;ll let you know the moment someone raises their hand.
      </p>
      <div className="mt-7 w-full space-y-2.5">
        <Button
          variant="primary"
          icon={<ArrowRight className="h-4 w-4" />}
          className="h-12 w-full"
          onClick={onDone}
        >
          View my posts
        </Button>
        <Button variant="ghost" className="h-11 w-full" onClick={onAnother}>
          Post another
        </Button>
      </div>
    </div>
  );
}
