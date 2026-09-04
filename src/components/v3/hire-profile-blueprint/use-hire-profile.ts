"use client";

// MANAGE YOUR PROFILE — the state machine, shared by BOTH editions.
//
// /dashboard/hire/profile edits ONE record: the caller's TradeNetworkProfile —
// the row that puts them in other companies' talent directories
// (discoverTradeProfiles) and makes matching trade jobs broadcast to them.
//
// The desktop blueprint (../hire-profile-blueprint/hire-profile-content.tsx)
// and the handheld build (../mobile-hire-profile/mobile-hire-profile.tsx) are
// two RENDERINGS of this one hook, exactly as the video estimator's two
// editions share use-video-estimator.ts. Two renderers of one contract cannot
// drift on what "listed" means, what counts as dirty, or when a save is
// confirmed.
//
// ── WHAT THE WRITER CAN EXPRESS ────────────────────────────────────────────
// `setTradeNetworkOptIn` (src/actions/tradeServices.ts) takes exactly:
//     { optIn: boolean, tradeTypes: string[], specialties: string[],
//       serviceArea?: string | null }
// and returns the re-read DTO. Everything this page edits maps 1:1 onto that
// object, so there is no field here the action cannot carry. The one thing
// worth naming: tradeTypes is an ORDERED array and the directory prints it in
// order (`p.tradeTypes.join(" · ")`), so "primary trade" is not a new column —
// it is index 0, and `setPrimaryTrade` below just rotates the array.
//
// ── NO OPTIMISTIC SUCCESS ──────────────────────────────────────────────────
// `saved` is only ever assigned from the DTO the server hands back. The form
// is "dirty" until that returned object matches what is on screen, so a failed
// write leaves the page visibly unsaved instead of quietly claiming otherwise.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setTradeNetworkOptIn } from "@/actions/tradeServices";
import type { TradeNetworkProfileDTO } from "@/app/(mobile)/trade-services/trade-data";

/** The action's own zod ceilings, restated so the UI refuses before the wire. */
export const LIMITS = {
  trades: 40,
  specialties: 80,
  /** Per-entry length for a trade or a specialty. */
  entry: 60,
  serviceArea: 120,
} as const;

export type SaveState = "idle" | "saving" | "saved";

export type HireProfileForm = {
  optIn: boolean;
  trades: string[];
  specialties: string[];
  serviceArea: string;
};

function toForm(dto: TradeNetworkProfileDTO): HireProfileForm {
  return {
    optIn: dto.optIn,
    trades: [...dto.tradeTypes],
    specialties: [...dto.specialties],
    serviceArea: dto.serviceArea ?? "",
  };
}

function sameForm(a: HireProfileForm, b: HireProfileForm): boolean {
  return (
    a.optIn === b.optIn &&
    a.serviceArea.trim() === b.serviceArea.trim() &&
    a.trades.length === b.trades.length &&
    a.trades.every((t, i) => t === b.trades[i]) &&
    a.specialties.length === b.specialties.length &&
    a.specialties.every((t, i) => t === b.specialties[i])
  );
}

export function useHireProfile(initial: TradeNetworkProfileDTO) {
  // What the database last confirmed. Assigned ONLY from a server response.
  const [saved, setSaved] = useState<HireProfileForm>(() => toForm(initial));
  const [form, setForm] = useState<HireProfileForm>(() => toForm(initial));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // The "Saved ✓" stamp is a confirmation, not a permanent state — it steps
  // back to idle so a later glance at the page cannot read a stale success.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const dirty = useMemo(() => !sameForm(form, saved), [form, saved]);

  /** Any edit invalidates a standing "Saved ✓". */
  const edit = useCallback((patch: Partial<HireProfileForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaveState((s) => (s === "saved" ? "idle" : s));
    setError(null);
  }, []);

  const setOptIn = useCallback((optIn: boolean) => edit({ optIn }), [edit]);
  const setServiceArea = useCallback((serviceArea: string) => {
    edit({ serviceArea: serviceArea.slice(0, LIMITS.serviceArea) });
  }, [edit]);

  const toggleTrade = useCallback((trade: string) => {
    setForm((f) => {
      const on = f.trades.includes(trade);
      if (!on && f.trades.length >= LIMITS.trades) return f;
      return { ...f, trades: on ? f.trades.filter((t) => t !== trade) : [...f.trades, trade] };
    });
    setSaveState((s) => (s === "saved" ? "idle" : s));
    setError(null);
  }, []);

  /** Move `trade` to index 0 — the directory prints the array in order, so the
   *  first entry is what a hirer reads first. */
  const setPrimaryTrade = useCallback((trade: string) => {
    setForm((f) => {
      if (!f.trades.includes(trade) || f.trades[0] === trade) return f;
      return { ...f, trades: [trade, ...f.trades.filter((t) => t !== trade)] };
    });
    setSaveState((s) => (s === "saved" ? "idle" : s));
    setError(null);
  }, []);

  const addSpecialty = useCallback((raw: string): boolean => {
    const value = raw.trim().slice(0, LIMITS.entry);
    if (!value) return false;
    let added = false;
    setForm((f) => {
      if (f.specialties.length >= LIMITS.specialties) return f;
      if (f.specialties.some((s) => s.toLowerCase() === value.toLowerCase())) return f;
      added = true;
      return { ...f, specialties: [...f.specialties, value] };
    });
    setSaveState((s) => (s === "saved" ? "idle" : s));
    setError(null);
    return added;
  }, []);

  const removeSpecialty = useCallback((value: string) => {
    setForm((f) => ({ ...f, specialties: f.specialties.filter((s) => s !== value) }));
    setSaveState((s) => (s === "saved" ? "idle" : s));
    setError(null);
  }, []);

  const save = useCallback(async () => {
    // A listing with no trade matches nothing and reads as an empty row in
    // someone else's directory — refuse it here rather than write it.
    if (form.optIn && form.trades.length === 0) {
      setError("Pick at least one trade — a listing with none has nothing to match on.");
      return;
    }
    setSaveState("saving");
    setError(null);
    try {
      const dto = await setTradeNetworkOptIn({
        optIn: form.optIn,
        tradeTypes: form.trades,
        specialties: form.specialties,
        serviceArea: form.serviceArea.trim() || null,
      });
      // The SERVER's object, not the local one: what came back is what is
      // stored, and the form re-seeds from it.
      const next = toForm(dto);
      setSaved(next);
      setForm(next);
      setSaveState("saved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaveState("idle"), 6000);
    } catch (err) {
      setSaveState("idle");
      setError(err instanceof Error ? err.message : "Could not save your listing. Try again.");
    }
  }, [form]);

  /** Throw away the edits and go back to what the database holds. */
  const revert = useCallback(() => {
    setForm(saved);
    setSaveState("idle");
    setError(null);
  }, [saved]);

  return {
    form,
    saved,
    dirty,
    saveState,
    error,
    busy: saveState === "saving",
    /** The toggle is on screen but not yet written. */
    optInPending: form.optIn !== saved.optIn,
    setOptIn,
    setServiceArea,
    toggleTrade,
    setPrimaryTrade,
    addSpecialty,
    removeSpecialty,
    save,
    revert,
  };
}

export type HireProfileApi = ReturnType<typeof useHireProfile>;

/** The one-line summary a directory row prints under the name — the same
 *  composition discoverTradeProfiles' consumers use:
 *  `trades.join(" · ")` + " — " + `specialties.join(", ")`. */
export function directorySubline(trades: string[], specialties: string[]): string {
  const a = trades.join(" · ");
  const b = specialties.join(", ");
  if (a && b) return `${a} — ${b}`;
  return a || b;
}
