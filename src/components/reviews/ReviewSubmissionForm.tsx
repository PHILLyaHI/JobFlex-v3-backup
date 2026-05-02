"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { StarRating, StarRatingPicker } from "./StarRating";
import { toast } from "@/components/ui/Toast";

interface Props {
  token: string;
  orgName: string;
  clientName: string | null;
  submitted?: { rating: number; comment: string | null } | null;
}

export function ReviewSubmissionForm({ token, orgName, clientName, submitted }: Props) {
  const [rating, setRating] = React.useState(submitted?.rating ?? 0);
  const [comment, setComment] = React.useState(submitted?.comment ?? "");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(!!submitted);

  async function submit() {
    if (rating === 0) {
      toast.error("Pick a rating");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/public-review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(true);
    } catch (err: any) {
      toast.error("Couldn't submit", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-md w-full mx-auto paper-card p-10 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-amber-400/[0.12] blur-3xl pointer-events-none"
      />

      <div className="relative">
        <div className="quiet-caps mb-3">Review {orgName}</div>
        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.02em]">
                How was the work?
              </h1>
              <p className="mt-3 text-[13px] text-[color:var(--ink-muted)] leading-relaxed">
                {clientName ? `Hi ${clientName.split(" ")[0]}, ` : ""}
                your feedback helps {orgName} improve and helps the next customer choose well.
              </p>

              <div className="mt-8 flex justify-center">
                <StarRatingPicker value={rating} onChange={setRating} size={40} />
              </div>

              <div className="mt-8">
                <Textarea
                  label="Anything to add? (optional)"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What went well, what could be better."
                />
              </div>

              <Button
                size="lg"
                className="w-full mt-6"
                loading={busy}
                disabled={rating === 0}
                onClick={submit}
              >
                Submit review
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="thanks"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="text-center py-4"
            >
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 text-emerald-700 grid place-items-center">
                <Check className="h-5 w-5" />
              </div>
              <h1 className="font-display text-[30px] tracking-[-0.02em] mt-5">Thanks for sharing.</h1>
              <div className="mt-5 flex justify-center">
                <StarRating value={rating} size={24} />
              </div>
              <p className="mt-5 text-[12.5px] text-[color:var(--ink-muted)] leading-relaxed max-w-xs mx-auto">
                Your review is on its way to {orgName} — it helps the next customer make a confident choice.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
