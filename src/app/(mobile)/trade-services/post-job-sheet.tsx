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
import { createTradeJob, updateTradeJob } from "@/actions/tradeServices";
import {
  TRADE_TYPES,
  URGENCY,
  type OwnPost,
  type Urgency,
  skillSuggestions,
} from "./trade-data";

interface PostJobSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful post so the parent can refresh + switch tabs. */
  onPosted: () => void;
  /**
   * Present = the sheet is EDITING this post rather than creating a new one.
   * The field set is identical either way; only the destination action, the
   * title and the confirmation differ — a second, hand-copied form is how the
   * two drift apart.
   */
  editing?: OwnPost | null;
  /** Called with the row the server actually saved, so the list patches from
   *  the write's own return value rather than from what was typed. */
  onSaved?: (post: OwnPost) => void;
}

const URGENCY_KEYS: Urgency[] = ["low", "medium", "high", "urgent"];

/** 16px, not the shared 14px: anything smaller makes iOS Safari zoom the page
 *  on focus, and it does not zoom back out. */
const FIELD_TEXT = "text-[16px]";
/** 44px targets on every control the thumb has to hit. */
const FIELD_BOX = "h-11";

export function PostJobSheet({
  open,
  onClose,
  onPosted,
  editing,
  onSaved,
}: PostJobSheetProps) {
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

  const isEdit = !!editing;

  // Seed the form when the sheet opens on a DIFFERENT subject. Done during
  // render (not in an effect) per React's "adjust state when a prop changes"
  // guidance — an effect would paint one frame of the previous post's text.
  const subject = open ? (editing ? "edit:" + editing.id : "new") : null;
  const [seeded, setSeeded] = React.useState<string | null>(null);
  if (subject !== seeded) {
    setSeeded(subject);
    if (open && editing) {
      setTitle(editing.title);
      setTradeType(editing.tradeType);
      setSpecialties(editing.specialties);
      setDescription(editing.description);
      setUrgency(editing.urgency ?? "medium");
      setLocation(editing.location ?? "");
      setBudget(editing.budget ?? "");
      setTimeWindow(editing.timeWindow ?? "");
      setSubmitted(false);
      setSuccess(null);
    } else if (subject === "new") {
      clear();
    }
  }

  const titleErr =
    submitted && title.trim().length < 5
      ? "Add a short, clear title (at least 5 characters)."
      : undefined;
  const descErr: string | undefined = undefined;
  const tradeErr =
    submitted && !tradeType ? "Pick a trade so we notify the right pros." : undefined;

  function clear() {
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
    if (!isEdit) clear();
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
    if (title.trim().length < 1 || !tradeType) {
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim(),
      tradeType,
      specialties,
      location: location.trim() || null,
      budget: budget.trim() || null,
      timeWindow: timeWindow.trim() || null,
      urgency,
    };
    setSubmitting(true);
    try {
      if (editing) {
        const updated = await updateTradeJob(editing.id, payload);
        onSaved?.(updated);
        toast.success("Post updated", updated.title);
        onClose();
      } else {
        const res = await createTradeJob(payload);
        onPosted();
        setSuccess({ count: res.broadcastCount });
      }
    } catch (e: unknown) {
      toast.error(
        isEdit ? "Couldn't save changes" : "Couldn't post job",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setSubmitting(false);
    }
  }

  // A post that is no longer OPEN is a record of something that already
  // happened; `updateTradeJob` refuses it server-side, so the form says so
  // rather than letting the user type into a write that will bounce.
  const locked = !!editing && editing.status !== "OPEN";

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={success ? undefined : isEdit ? "Edit job post" : "Post a job"}
    >
      {success ? (
        <SuccessView count={success.count} onDone={close} onAnother={clear} />
      ) : (
        <div className="-mt-1">
          <p className="text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
            {isEdit
              ? "Everyone already notified sees the corrected post. Changing the trade does not fire a second broadcast — that would be a new post."
              : "Hand off a job you can't take. We notify matching contractors near you; interested pros open a private chat with you."}
          </p>

          {locked && (
            <p className="mt-3 rounded-[var(--r-md)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-3 py-2.5 text-[12px] leading-relaxed text-[color:var(--ink-soft)]">
              This post is {editing?.status === "FILLED" ? "filled" : "cancelled"}, so its terms
              are frozen as the people who answered read them.
            </p>
          )}

          <fieldset disabled={locked} className="mt-5 space-y-5 disabled:opacity-60">
            <Input
              label="Title"
              placeholder="e.g. Master bath tile re-do"
              value={title}
              wrapperClassName={FIELD_BOX}
              className={FIELD_TEXT}
              onChange={(e) => setTitle(e.target.value)}
              error={titleErr}
            />

            <Select
              label="Trade"
              value={tradeType}
              wrapperClassName={FIELD_BOX}
              className={FIELD_TEXT}
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

            {/* Skills — the suggestions for this trade, plus anything the post
                already carries that is not among them. Dropping an existing
                specialty just because it is off the suggested list would edit
                the post behind the author's back. */}
            <div className="flex flex-col gap-2">
              <span className="quiet-caps">Skills needed</span>
              <div className="flex flex-wrap gap-2">
                {skillChoices(tradeType, specialties).map((skill) => {
                  const on = specialties.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors focus-ring",
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
              className={FIELD_TEXT}
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
                label="Rate"
                placeholder="$45–60 / hour"
                value={budget}
                wrapperClassName={FIELD_BOX}
                className={FIELD_TEXT}
                onChange={(e) => setBudget(e.target.value)}
              />
              <Input
                label="Timeline"
                placeholder="Within 2 weeks"
                value={timeWindow}
                wrapperClassName={FIELD_BOX}
                className={FIELD_TEXT}
                onChange={(e) => setTimeWindow(e.target.value)}
              />
            </div>

            <Input
              label="Location"
              placeholder="City + distance, e.g. Bend, OR · 8 mi"
              value={location}
              wrapperClassName={FIELD_BOX}
              className={FIELD_TEXT}
              onChange={(e) => setLocation(e.target.value)}
            />
          </fieldset>

          {/* Sticky submit */}
          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-[color:var(--ink-line)] bg-[color:var(--paper)] px-5 pt-3 pb-1">
            {tradeType && !isEdit && (
              <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--ink-muted)]">
                <Radio className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                We&apos;ll notify contractors whose trade and skills match.
              </p>
            )}
            <div className="flex items-stretch gap-2.5">
              {isEdit && (
                <Button variant="ghost" className="h-12 flex-1" onClick={close}>
                  Cancel
                </Button>
              )}
              <Button
                variant="primary"
                icon={isEdit ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                className={isEdit ? "h-12 flex-[1.4]" : "h-12 w-full"}
                onClick={submit}
                loading={submitting}
                disabled={locked}
              >
                {isEdit ? "Save changes" : "Post to network"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/** Suggestions for the trade, with any specialty the post already carries kept
 *  at the front so it stays visible (and toggleable) even off-list. */
function skillChoices(tradeType: string, current: string[]): string[] {
  const suggested = skillSuggestions(tradeType);
  const extra = current.filter((s) => !suggested.includes(s));
  return extra.concat(suggested);
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
