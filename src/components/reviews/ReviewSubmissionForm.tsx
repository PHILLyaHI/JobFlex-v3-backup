"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { StarRating, StarRatingPicker } from "./StarRating";
import { toast } from "@/components/ui/Toast";
import { downscaleImage } from "@/lib/imageClient";

const MAX_PHOTOS = 6;
const COMMENT_MAX = 2000;

interface Props {
  token: string;
  orgName: string;
  clientName: string | null;
  /** The proposal's (or job's) title, for the intro line. */
  title?: string | null;
  submitted?: { rating: number; comment: string | null } | null;
  /** Photos already on the request (a resumed form, or the submitted view). */
  photos?: string[];
  /** /r/<slug> — where every public review for this contractor lives. */
  publicHref?: string | null;
}

export function ReviewSubmissionForm({ token, orgName, clientName, title, submitted, photos: initialPhotos, publicHref }: Props) {
  const [rating, setRating] = React.useState(submitted?.rating ?? 0);
  const [comment, setComment] = React.useState(submitted?.comment ?? "");
  const [photos, setPhotos] = React.useState<string[]>(initialPhotos ?? []);
  const [uploading, setUploading] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(!!submitted);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const firstName = clientName ? clientName.split(" ")[0] : null;

  async function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_PHOTOS} photos`);
      return;
    }
    const files = Array.from(list).slice(0, room);
    if (files.length < list.length) toast.error(`Only ${room} more photo${room === 1 ? "" : "s"} fit`);
    // One at a time: the server appends to the same row, and a phone on a
    // jobsite connection is happier with a queue than six parallel uploads.
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const dataUrl = await downscaleImage(file);
        const res = await fetch(`/api/public-review/${token}/photo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, filename: file.name }),
        });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
        setPhotos((p) => [...p, json.url as string]);
      } catch (err) {
        toast.error("Couldn't add that photo", err instanceof Error ? err.message : undefined);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function removePhoto(url: string) {
    setPhotos((p) => p.filter((u) => u !== url));
    try {
      await fetch(`/api/public-review/${token}/photo`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      /* already gone from the form; the server copy is harmless */
    }
  }

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
    } catch (err) {
      toast.error("Couldn't submit", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const photoGrid = photos.length ? (
    <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Your photos">
      {photos.map((url) => (
        <li key={url} className="relative aspect-square overflow-hidden rounded-[var(--r-sm)] border-[1.5px] border-[color:var(--ink)] bg-[color:var(--paper-deep)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
          {!done ? (
            <button
              type="button"
              onClick={() => removePhoto(url)}
              aria-label="Remove photo"
              className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-[var(--r-sm)] bg-[color:var(--ink)] text-[color:var(--paper)] focus-ring"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-md w-full mx-auto paper-card p-6 sm:p-10 relative overflow-hidden"
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
                {firstName ? `Hi ${firstName}, ` : ""}
                {title ? `how did the ${title.toLowerCase()} turn out? ` : ""}
                Your feedback helps {orgName} improve and helps the next customer choose well.
              </p>

              <div className="mt-8 flex justify-center">
                <StarRatingPicker value={rating} onChange={setRating} size={40} />
              </div>

              <div className="mt-8">
                <Textarea
                  label="Anything to add? (optional)"
                  rows={4}
                  value={comment}
                  maxLength={COMMENT_MAX}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What went well, what could be better."
                />
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className="quiet-caps">Photos (optional)</span>
                  <span className="font-mono text-[10.5px] text-[color:var(--ink-faint)]">
                    {photos.length}/{MAX_PHOTOS}
                  </span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading > 0 || photos.length >= MAX_PHOTOS}
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--r-sm)] border-2 border-dashed border-[color:var(--ink)] px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[color:var(--ink)] focus-ring disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  {uploading > 0 ? "Adding photo…" : photos.length ? "Add another photo" : "Add photos of the finished work"}
                </button>
                {photoGrid}
              </div>

              <Button
                size="lg"
                className="w-full mt-6"
                loading={busy}
                disabled={rating === 0 || uploading > 0}
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
              {photoGrid}
              <p className="mt-5 text-[12.5px] text-[color:var(--ink-muted)] leading-relaxed max-w-xs mx-auto">
                Your review is on its way to {orgName} — it helps the next customer make a confident choice.
              </p>
              {publicHref ? (
                <a
                  href={publicHref}
                  className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-[var(--r-sm)] border-2 border-[color:var(--ink)] px-5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--ink)] focus-ring"
                >
                  See all reviews for {orgName}
                </a>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
