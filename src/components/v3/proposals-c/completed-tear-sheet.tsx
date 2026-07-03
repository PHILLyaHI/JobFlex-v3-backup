"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ImagePlus,
  Send,
  Check,
  X,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money, longDate } from "@/lib/format";
import { uploadProposalPhoto, removeProposalPhoto, updateProposalStatus } from "@/actions/proposals";
import { Pagination } from "@/components/ui/Pagination";
import { usePagedList } from "@/lib/usePagedList";
import type { ProposalCRow, ProposalPhoto } from "./types";

// Tear-sheet view of completed jobs. Each card is a "filed" record:
// completed-date masthead, a three-column lifecycle dateline (deposit / start /
// completed), a payment-schedule list (installments + amounts, all settled), a
// real before-and-after photo strip, and a receipt sender + "unmark as paid" in
// the footer bar. Photos persist via uploadProposalPhoto; sending a receipt is
// still a local-toast confirmation (no receipt API yet).

interface CompletedTearSheetProps {
  rows: ProposalCRow[];
}

export function CompletedTearSheet({ rows }: CompletedTearSheetProps) {
  const { page, pageCount, setPage, pageItems } = usePagedList(rows, 20);

  if (rows.length === 0) {
    return <EmptyCompleted />;
  }

  return (
    <div className="pt-8">
      <div className="space-y-6">
        {pageItems.map((r, i) => (
          <CompletedCard key={r.id} row={r} index={i} />
        ))}
      </div>
      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
    </div>
  );
}

function CompletedCard({ row, index }: { row: ProposalCRow; index: number }) {
  const router = useRouter();
  // Receipt recipient is seeded from the proposal's client email and stays
  // editable — the contractor can send to a different address per receipt.
  const [recipient, setRecipient] = React.useState(row.clientEmail ?? "");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [unmarking, setUnmarking] = React.useState(false);

  // Undo "mark as paid": revert PAID → ACCEPTED so the card moves back to the
  // Accepted tab. updateProposalStatus clears paidAt on the ACCEPTED transition.
  async function unmark() {
    setUnmarking(true);
    try {
      await updateProposalStatus(row.id, "ACCEPTED");
      toast.success("Unmarked as paid", `"${row.title}" moved back to the Accepted tab.`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Try again.";
      toast.error("Couldn't unmark", msg);
    } finally {
      setUnmarking(false);
    }
  }

  async function sendReceipt() {
    if (!recipient.trim()) {
      toast.error("Add an email", "We need a recipient address.");
      return;
    }
    setSending(true);
    // No receipt API yet — local optimistic confirmation.
    setTimeout(() => {
      setSending(false);
      setSent(true);
      toast.success("Receipt sent", `Paid invoice for "${row.title}" went to ${recipient}.`);
    }, 420);
  }

  // Resolve installment dollar amounts (percent lines compute against total).
  // Everything reads as settled since the proposal is PAID.
  const resolved = row.installments.map((l) => ({
    ...l,
    dollars: l.isPercent ? Math.round(row.total * (l.amount / 100)) : l.amount,
  }));

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className="paper-card p-0 overflow-hidden"
    >
      {/* Tear-sheet masthead */}
      <div className="px-6 pt-5 pb-5 border-b border-[color:var(--ink-line)]">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="quiet-caps !mb-0 text-emerald-800">Completed</span>
              <span aria-hidden className="h-px w-6 bg-[color:var(--ink-line)]" />
              <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">
                {row.paidAtISO ? longDate(row.paidAtISO) : "—"}
              </span>
            </div>
            <Link
              href={`/dashboard/proposals/${row.id}` as never}
              className="block focus-ring rounded-[var(--r-xs)] -mx-1 px-1 group"
            >
              <h3 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.018em] text-[color:var(--ink)] group-hover:text-[color:var(--accent-ink)] transition-colors flex items-center gap-2">
                <span className="truncate">{row.title}</span>
                <ArrowUpRight className="h-4 w-4 text-[color:var(--ink-faint)] group-hover:text-[color:var(--accent)] transition-colors shrink-0" />
              </h3>
              <p className="mt-1 text-[12.5px] text-[color:var(--ink-muted)]">{row.clientName}</p>
            </Link>
          </div>

          <div className="text-right shrink-0">
            <div className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">Banked</div>
            <div className="font-display tabular text-[26px] font-semibold leading-none tracking-[-0.02em] text-emerald-900 mt-1">
              {money(row.total)}
            </div>
          </div>
        </div>
      </div>

      {/* Dateline triplet — the job's lifecycle, deposit → start → done. */}
      <div className="grid grid-cols-3 divide-x divide-[color:var(--ink-line)]">
        <DateCell label="Deposit" value={money(estimateDeposit(row))} sub="Locked in" />
        <DateCell label="Start" value={dateOrDash(row.acceptedAtISO ?? row.sentAtISO)} sub="Work began" />
        <DateCell label="Completed" value={dateOrDash(row.paidAtISO ?? row.updatedAtISO)} sub="Paid in full" emphasis />
      </div>

      {/* Payment schedule list + before/after photo strip */}
      <div className="grid grid-cols-[1.1fr_1fr] gap-0 border-t border-[color:var(--ink-line)]">
        <div className="px-6 py-5 border-r border-[color:var(--ink-line)]">
          {resolved.length > 0 ? (
            <ul className="space-y-2.5">
              {resolved.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="h-4 w-4 rounded-full bg-emerald-100 grid place-items-center shrink-0">
                      <Check className="h-2.5 w-2.5 text-emerald-700" strokeWidth={3} />
                    </span>
                    <span className="text-[13px] text-[color:var(--ink-soft)] truncate">
                      {line.label}
                    </span>
                  </span>
                  <span className="tabular text-[13px] font-medium text-[color:var(--ink)] shrink-0">
                    {money(line.dollars)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[color:var(--ink-muted)]">
              No installments were set on this proposal.
            </p>
          )}
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <PhotoColumn proposalId={row.id} slot="before" label="Before" photos={row.beforePhotos} />
            <PhotoColumn proposalId={row.id} slot="after" label="After" photos={row.afterPhotos} />
          </div>
        </div>
      </div>

      {/* Receipt sender — auto-filled email */}
      <div className="border-t border-[color:var(--ink-line)] px-6 py-4 bg-[color:var(--paper)]/40">
        <div className="flex items-end gap-3 flex-wrap">
          {/* Recipient + Send receipt are one action — kept paired together. */}
          <div className="flex items-end gap-3 flex-1 min-w-[240px]">
            <div className="flex-1 min-w-[200px] max-w-[440px]">
              <label className="quiet-caps block mb-1.5 text-[color:var(--ink-faint)]">
                Send paid receipt to
              </label>
              <input
                type="email"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  if (sent) setSent(false);
                }}
                placeholder="client@example.com"
                className={cn(
                  "h-9 w-full px-3 rounded-[var(--r-md)] text-[13px]",
                  "bg-white/60 hairline text-[color:var(--ink)]",
                  "focus:outline-none focus:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]",
                  "tabular",
                )}
              />
            </div>
            <Button
              size="md"
              variant={sent ? "outline" : "primary"}
              icon={sent ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              onClick={sendReceipt}
              loading={sending}
            >
              {sent ? "Sent" : "Send receipt"}
            </Button>
          </div>
          {/* Unmark is a corrective action — pushed out to the right border edge. */}
          <Button
            size="md"
            variant="ghost"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={unmark}
            loading={unmarking}
          >
            Unmark as paid
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

// Downscale + re-encode a picked image to a modest JPEG before it travels
// through the upload server action. Phone photos are often 10-50MB (and ~33%
// larger as base64), which blows past the Server Action body limit; a 1600px
// max-dimension JPEG keeps before/after shots crisp while staying well under it.
async function fileToUploadDataUrl(file: File): Promise<string> {
  const MAX_DIM = 1600;
  const QUALITY = 0.82;

  let source: CanvasImageSource;
  let srcW: number;
  let srcH: number;
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;

  try {
    // createImageBitmap applies EXIF orientation, so portrait photos aren't sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    srcW = bitmap.width;
    srcH = bitmap.height;
  } catch {
    // Fallback for browsers/formats createImageBitmap can't decode.
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image."));
      el.src = objectUrl as string;
    });
    source = img;
    srcW = img.naturalWidth;
    srcH = img.naturalHeight;
  }

  try {
    const scale = Math.min(1, MAX_DIM / Math.max(srcW || 1, srcH || 1));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.drawImage(source, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    if (bitmap) bitmap.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function PhotoColumn({
  proposalId,
  slot,
  label,
  photos,
}: {
  proposalId: string;
  slot: "before" | "after";
  label: string;
  photos: ProposalPhoto[];
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a remove
    if (!file) return;
    setBusy(true);
    try {
      // Downscale before upload so large phone photos don't exceed the Server
      // Action body limit (and to keep stored images lightweight). Always a JPEG.
      const dataUrl = await fileToUploadDataUrl(file);
      const uploadName = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
      const hadPhoto = photos.length > 0;
      await uploadProposalPhoto(proposalId, dataUrl, uploadName, slot);
      // One photo per slot: clear any prior shot so the new one replaces it.
      for (const old of photos) {
        await removeProposalPhoto(proposalId, slot, old.id);
      }
      router.refresh();
      toast.success(
        hadPhoto ? "Photo replaced" : "Photo added",
        `${label} shot saved to this record.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Try again.";
      toast.error("Upload failed", msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(photoId: string) {
    try {
      await removeProposalPhoto(proposalId, slot, photoId);
      router.refresh();
    } catch {
      toast.error("Couldn't remove photo", "Try again.");
    }
  }

  const photo = photos.length > 0 ? photos[photos.length - 1] : null;

  return (
    <div>
      <div className="quiet-caps text-[color:var(--ink-faint)] mb-2">{label}</div>

      <div className="group relative aspect-[4/3] overflow-hidden rounded-[var(--r-md)]">
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`${label} photo`} className="h-full w-full object-cover" />
            {/* Whole tile is the click target — tap the photo to swap it. */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              aria-label={`Replace ${label.toLowerCase()} photo`}
              className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all group-hover:bg-black/45 group-hover:opacity-100 focus-ring disabled:cursor-default"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-medium text-[color:var(--ink)] shadow-[0_4px_16px_-8px_rgba(17,17,19,0.35)]">
                <ImagePlus className="h-3.5 w-3.5" />
                {busy ? "Uploading…" : "Replace"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleRemove(photo.id)}
              aria-label={`Remove ${label.toLowerCase()} photo`}
              className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-white/90 hairline shadow-[0_4px_16px_-8px_rgba(17,17,19,0.25)] opacity-0 transition-opacity group-hover:opacity-100 focus-ring"
            >
              <X className="h-3.5 w-3.5 text-[color:var(--ink-soft)]" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="absolute inset-0 grid place-items-center rounded-[var(--r-md)] border border-dashed border-[color:var(--ink-line)] bg-black/[0.02] text-center transition-colors hover:border-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring disabled:opacity-60"
          >
            <div className="flex flex-col items-center gap-1.5">
              {busy ? (
                <span className="text-[11px] text-[color:var(--ink-muted)]">Uploading…</span>
              ) : (
                <>
                  <ImagePlus className="h-5 w-5 text-[color:var(--ink-faint)]" />
                  <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">
                    Add {label.toLowerCase()}
                  </span>
                </>
              )}
            </div>
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
    </div>
  );
}

function DateCell({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
}) {
  return (
    <div className="px-6 py-4">
      <div className="quiet-caps text-[color:var(--ink-faint)] mb-1.5">{label}</div>
      <div
        className={cn(
          "font-display tabular text-[18px] font-semibold leading-tight tracking-[-0.012em]",
          emphasis ? "text-emerald-900" : "text-[color:var(--ink)]",
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{sub}</div>
    </div>
  );
}

function dateOrDash(iso: string | null): string {
  if (!iso) return "—";
  return longDate(iso);
}

function estimateDeposit(row: ProposalCRow): number {
  const first = row.installments.find((l) => l.position === 0) ?? row.installments[0];
  if (!first) return 0;
  return first.isPercent ? Math.round(row.total * (first.amount / 100)) : first.amount;
}

function EmptyCompleted() {
  return (
    <div className="pt-8">
      <div className="paper-card text-center py-16 px-6">
        <div className="quiet-caps text-[color:var(--ink-faint)] mb-3">Nothing filed yet</div>
        <h3 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-[color:var(--ink)] mb-1">
          Finished jobs settle here
        </h3>
        <p className="text-[13px] text-[color:var(--ink-muted)] max-w-md mx-auto">
          Mark an accepted proposal completed and it'll move to this tab — receipts, dates, and
          before-and-after photos all in one tear sheet.
        </p>
      </div>
    </div>
  );
}
