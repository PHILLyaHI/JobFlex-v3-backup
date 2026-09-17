"use client";
// CLIENT REVIEW — the client half of /review/[token]: the star picker, the
// notes, the photo queue and the submit, then the RECEIVED state. Styled by
// ../review.css (root `.jf-review`, rendered by the server page); no Tailwind
// utilities, no motion library — the cascade, the star's stamp and the
// in-button loading square are CSS, and the only JS timing is the 200ms exit
// before the done state mounts.
import * as React from "react";
import { Check, ImagePlus, X } from "lucide-react";
import { StarsInline } from "@/components/reviews/StarsInline";
import { downscaleImage } from "@/lib/imageClient";

const MAX_PHOTOS = 6;
const COMMENT_MAX = 2000;
const SCORE = ["", "Poor", "Fair", "Good", "Great", "Excellent"] as const;
// The same outline StarsInline fills, so the picker and the recorded score
// are one glyph. Drawn here with a 2px ink stroke instead of a solid fill.
const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

type Props = {
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
  /** How the client's name reads on the public page ("Maria H."); null without a name. */
  publicName?: string | null;
};

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function errorOf(res: Response, fallback: string) {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  return json?.error ?? fallback;
}

export function ReviewForm({ token, orgName, clientName, title, submitted, photos: initialPhotos, publicHref, publicName }: Props) {
  const [rating, setRating] = React.useState(submitted?.rating ?? 0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState(submitted?.comment ?? "");
  const [photos, setPhotos] = React.useState<string[]>(initialPhotos ?? []);
  const [uploading, setUploading] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [done, setDone] = React.useState(!!submitted);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const starRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const firstName = clientName?.trim().split(/\s+/)[0] || null;
  const job = title?.trim() ? title.trim().toLowerCase() : null;
  const what = job ? `the ${job}` : `the work by ${orgName}`;
  const lede = firstName ? `Hi ${firstName} — how did ${what} turn out?` : `How did ${what} turn out?`;
  const shown = hover || rating;
  // publicName already carries its own period ("Maria H.").
  const foot = publicName
    ? `Your name appears as ${publicName} — one review per job, collected through JobFlex.`
    : "One review per job, collected through JobFlex.";

  function pick(i: number) {
    setRating(i);
    setError(null);
  }

  // A radiogroup moves with the arrow keys; one radio holds the tab stop.
  function onStarKey(e: React.KeyboardEvent<HTMLDivElement>) {
    let next = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(5, rating + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(1, (rating || 2) - 1);
    else if (e.key === "Home") next = 1;
    else if (e.key === "End") next = 5;
    else return;
    e.preventDefault();
    pick(next);
    starRefs.current[next - 1]?.focus();
  }

  async function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const files = Array.from(list).slice(0, room);
    if (files.length < list.length) {
      setError(`Only ${room} more photo${room === 1 ? "" : "s"} fit — the first ${room} ${room === 1 ? "was" : "were"} added.`);
    }
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
        setError(`Couldn't add ${file.name}${err instanceof Error && err.message ? ` — ${err.message}` : "."}`);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || uploading > 0) return;
    if (rating === 0) {
      setError("Pick a star rating first.");
      starRefs.current[0]?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public-review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || null }),
      });
      if (!res.ok) throw new Error(await errorOf(res, `Couldn't submit (${res.status}).`));
      const reduce = reducedMotion();
      if (!reduce) {
        setLeaving(true);
        await new Promise<void>((r) => setTimeout(r, 200));
      }
      setLeaving(false);
      setDone(true);
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  }

  const kicker = (
    <p className="rv-kicker">
      Client review · {orgName}
    </p>
  );

  if (done) {
    return (
      <div className="rv-card">
        <div className="rv-seq rv-done" key="done">
          <header className="rv-head">
            {kicker}
            <h1 className="rv-h1">{firstName ? `Thanks, ${firstName}.` : "Thank you."}</h1>
          </header>
          <div className="rv-receipt">
            <span className="rv-stamp">
              <Check aria-hidden="true" />
              Received
            </span>
            <span className="rv-score">
              <StarsInline value={rating} size={26} title={`${rating} out of 5`} />
              <span className="rv-cap is-set" aria-hidden="true">
                {rating} · {SCORE[rating] ?? ""}
              </span>
            </span>
          </div>
          <PhotoGrid photos={photos} pending={0} />
          <p className="rv-lede">Your review is on its way to {orgName} — it helps the next customer choose well.</p>
          {publicHref ? (
            <div className="rv-actions">
              <a className="rv-btn rv-btn--ghost" href={publicHref}>
                <span>See all reviews for {orgName}</span>
              </a>
            </div>
          ) : null}
          <p className="rv-foot">{foot}</p>
        </div>
      </div>
    );
  }

  return (
    <form className={`rv-card${leaving ? " is-leaving" : ""}`} onSubmit={submit} noValidate>
      <div className="rv-seq rv-form" key="form">
        <header className="rv-head">
          {kicker}
          <h1 className="rv-h1">How was the work?</h1>
          <p className="rv-lede">{lede}</p>
        </header>

        <section className="rv-sec">
          <p className="rv-lab">
            <span id="rv-rate-lab">01 · Rating</span>
          </p>
          <div
            className="rv-stars"
            role="radiogroup"
            aria-labelledby="rv-rate-lab"
            aria-required="true"
            onPointerLeave={() => setHover(0)}
            onKeyDown={onStarKey}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                ref={(el) => {
                  starRefs.current[i - 1] = el;
                }}
                type="button"
                role="radio"
                aria-checked={rating === i}
                aria-label={`${i} star${i === 1 ? "" : "s"} — ${SCORE[i]}`}
                tabIndex={rating === i || (rating === 0 && i === 1) ? 0 : -1}
                className={`rv-star${i <= shown ? " is-on" : ""}${rating === i ? " is-pick" : ""}`}
                onClick={() => pick(i)}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setHover(i);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={STAR} vectorEffect="non-scaling-stroke" />
                </svg>
              </button>
            ))}
          </div>
          <p className={`rv-cap${shown ? " is-set" : ""}`} aria-hidden="true">
            {shown ? `${shown} · ${SCORE[shown]}` : "Pick a star"}
          </p>
        </section>

        <section className="rv-sec">
          <p className="rv-lab">
            <label htmlFor="rv-comment">02 · Notes · optional</label>
            <span className={`rv-n${comment.length >= COMMENT_MAX ? " is-full" : ""}`} aria-hidden="true">
              {comment.length}/{COMMENT_MAX}
            </span>
          </p>
          <textarea
            id="rv-comment"
            className="rv-ta"
            rows={4}
            value={comment}
            maxLength={COMMENT_MAX}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went well, what could be better."
          />
        </section>

        <section className="rv-sec">
          <p className="rv-lab">
            <span id="rv-photo-lab">03 · Photos · optional</span>
            <span className="rv-n" aria-hidden="true">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </p>
          <div className="rv-box">
            <PhotoGrid photos={photos} pending={uploading} onRemove={removePhoto} />
            <input
              ref={fileRef}
              className="rv-file"
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              type="button"
              className="rv-btn rv-btn--add"
              aria-describedby="rv-photo-lab"
              disabled={uploading > 0 || photos.length >= MAX_PHOTOS}
              onClick={() => fileRef.current?.click()}
            >
              {uploading > 0 ? <span className="rv-sq" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
              <span>{uploading > 0 ? "Adding photo…" : photos.length ? "Add another" : "Add photos"}</span>
            </button>
          </div>
        </section>

        {error ? (
          <p className="rv-err" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rv-actions">
          <button type="submit" className="rv-btn rv-btn--submit" disabled={busy || uploading > 0} aria-busy={busy || undefined}>
            {busy ? <span className="rv-sq" aria-hidden="true" /> : null}
            <span>{busy ? "Sending…" : "Submit review"}</span>
          </button>
        </div>

        <p className="rv-foot">{foot}</p>
      </div>
    </form>
  );
}

function PhotoGrid({ photos, pending, onRemove }: { photos: string[]; pending: number; onRemove?: (url: string) => void }) {
  if (!photos.length && !pending) return null;
  return (
    <ul className="rv-grid" aria-label="Your photos">
      {photos.map((url, i) => (
        <li key={url} className="rv-ph">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Photo ${i + 1}`} />
          {onRemove ? (
            <button type="button" className="rv-x" aria-label={`Remove photo ${i + 1}`} onClick={() => onRemove(url)}>
              <span className="rv-x-mark">
                <X aria-hidden="true" />
              </span>
            </button>
          ) : null}
        </li>
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <li key={`pending-${i}`} className="rv-ph rv-ph--pending" aria-label="Uploading a photo">
          <span className="rv-sq" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}
