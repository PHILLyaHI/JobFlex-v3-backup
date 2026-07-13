"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Check, X, MapPin, Timer, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { pendingLeadOffers, acceptLeadOffer, declineLeadOffer } from "@/actions/leadOffers";

interface Offer {
  id: string;
  name: string;
  projectType: string | null;
  detectedTrade: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  description: string | null;
  attempt: number;
  expiresAt: string;
}

const POLL_MS = 45_000;

/**
 * App-wide "elite lead routed to you" pop-up. Polls for live platform-lead
 * offers and slides one in wherever the contractor is working — accept or
 * decline right from the card (an email also fires from the cascade). Mounted
 * in the dashboard layout, gated to roles that can act on leads.
 */
export function LeadOfferPopup() {
  const router = useRouter();
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [resolving, setResolving] = React.useState<"accept" | "decline" | null>(null);
  // Offers dismissed this session shouldn't re-pop while polling; a genuinely
  // new offer (different id) still surfaces.
  const dismissed = React.useRef<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    try {
      const list = await pendingLeadOffers();
      setOffers(list.filter((o) => !dismissed.current.has(o.id)));
    } catch {
      // Role not allowed / signed out mid-poll — stay silent.
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Newest un-dismissed offer is the one on screen.
  const current = offers[0] ?? null;

  function dismiss(id: string) {
    dismissed.current.add(id);
    setOffers((os) => os.filter((o) => o.id !== id));
  }

  async function accept(offer: Offer) {
    if (resolving) return;
    setResolving("accept");
    try {
      await acceptLeadOffer(offer.id);
      toast.success("Lead accepted", `${offer.name} is now in your pipeline.`);
      setOffers((os) => os.filter((o) => o.id !== offer.id));
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't accept", err instanceof Error ? err.message : "Please try again.");
      dismiss(offer.id); // likely already taken/expired — clear it
    } finally {
      setResolving(null);
    }
  }

  async function decline(offer: Offer) {
    if (resolving) return;
    setResolving("decline");
    try {
      await declineLeadOffer(offer.id);
      toast.info("Lead passed", "It's on its way to the next shop.");
      setOffers((os) => os.filter((o) => o.id !== offer.id));
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't pass", err instanceof Error ? err.message : "Please try again.");
      dismiss(offer.id);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+80px)] md:inset-x-auto md:right-6 md:bottom-6 md:justify-end md:px-0 md:pb-0">
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-[var(--r-lg)] bg-[color:var(--paper)] shadow-[var(--shadow-lg)] ring-1 ring-black/5"
          >
            {/* Bold, color-blocked header — the celebratory "you were picked" beat */}
            <div className="relative flex items-center gap-2.5 bg-[color:var(--accent)] px-5 py-3 text-white">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20">
                <Zap className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold leading-tight tracking-[0.01em]">
                  Elite lead routed to you
                </div>
                <div className="text-[11px] leading-tight text-white/85">
                  You ranked as a top pro for this job
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-medium tabular">
                <Timer className="h-3 w-3" />
                <Countdown expiresAt={current.expiresAt} />
              </span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(current.id)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-2">
                <span className="font-display text-[16px] leading-tight tracking-[-0.01em]">
                  {current.projectType ?? current.detectedTrade ?? "New project"}
                </span>
                {current.detectedTrade && (
                  <span className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10.5px] font-medium leading-none text-[color:var(--accent-ink)]">
                    {current.detectedTrade}
                  </span>
                )}
              </div>
              {locationOf(current) && (
                <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-[color:var(--ink-muted)]">
                  <MapPin className="h-3 w-3" />
                  {locationOf(current)}
                </div>
              )}
              {current.description && (
                <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-[color:var(--ink-soft)]">
                  {current.description}
                </p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  disabled={resolving !== null}
                  onClick={() => accept(current)}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-3 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" />
                  {resolving === "accept" ? "Accepting…" : "Accept lead"}
                </button>
                <button
                  type="button"
                  disabled={resolving !== null}
                  onClick={() => decline(current)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--r-sm)] px-3 text-[12.5px] font-medium text-[color:var(--ink-muted)] transition-colors hover:bg-black/[0.04] disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                  Pass
                </button>
                <Link
                  href={"/dashboard/leads" as never}
                  onClick={() => dismiss(current.id)}
                  className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
                >
                  View
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              {offers.length > 1 && (
                <div className="mt-3 text-[10.5px] text-[color:var(--ink-faint)]">
                  +{offers.length - 1} more lead{offers.length - 1 > 1 ? "s" : ""} waiting
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function locationOf(o: Offer): string {
  return [o.city, o.state].filter(Boolean).join(", ") || o.zip || "";
}

// "22h 14m" live countdown; warms toward urgency inside the last hours.
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) return <>expiring</>;
  const totalMin = Math.floor(msLeft / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return <>{h > 0 ? `${h}h ${m}m` : `${m}m`}</>;
}
