"use client";
import { create } from "zustand";
import { isPlanLimitError, isPlanLimitFailure, type LimitKey } from "@/lib/planLimits";
import { getLimitUsage } from "@/actions/limits";

interface PlanLimitState {
  open: boolean;
  resource: LimitKey | null;
  openLimit: (resource?: LimitKey | null) => void;
  close: () => void;
}

export const usePlanLimitStore = create<PlanLimitState>((set) => ({
  open: false,
  resource: null,
  openLimit: (resource) => set({ open: true, resource: resource ?? null }),
  close: () => set({ open: false }),
}));

/**
 * Call from a create handler's catch block. If `err` is a plan-limit error,
 * raises the upgrade dialog and returns true (handled). Otherwise returns false
 * so the caller can fall back to its normal error toast.
 *
 *   catch (err) { if (reportPlanLimit(err)) return; toast.error(...); }
 */
export function reportPlanLimit(err: unknown): boolean {
  if (!isPlanLimitError(err)) return false;
  // enforcePlanLimit attaches the resource in dev; prod redacts thrown errors
  // so this falls back to the dialog's generic copy.
  const resource = (err as { resource?: LimitKey }).resource ?? null;
  usePlanLimitStore.getState().openLimit(resource);
  return true;
}

/**
 * Companion to reportPlanLimit for actions that RETURN a failure union instead
 * of throwing (estimator/AI runs). If `res` is a plan-limit failure, raises the
 * upgrade dialog and returns true (handled).
 *
 *   const res = await estimateRoof(input);
 *   if (!res.ok) { if (reportPlanLimitResult(res)) return; toast.error(res.error); }
 */
export function reportPlanLimitResult(res: unknown): boolean {
  if (!isPlanLimitFailure(res)) return false;
  usePlanLimitStore.getState().openLimit(res.resource ?? null);
  return true;
}

/**
 * Pre-flight check before a create call. Returns true when the action may
 * proceed; returns false and raises the upgrade dialog when the org is at its
 * cap. Reliable across dev AND prod (a normal action return, not a thrown
 * message that Next.js would redact). The server-side enforcePlanLimit remains
 * the hard backstop. On a check failure we allow the action (server enforces).
 *
 *   if (!(await ensureWithinLimit("jobs"))) return;
 */
export async function ensureWithinLimit(resource: LimitKey): Promise<boolean> {
  const ok = await checkWithinLimit(resource);
  if (!ok) usePlanLimitStore.getState().openLimit(resource);
  return ok;
}

/**
 * Silent variant of ensureWithinLimit — returns whether the action is allowed
 * WITHOUT opening the dialog. Use in background paths (e.g. autosave) that
 * shouldn't pop a modal on every tick. On check failure, allow (server enforces).
 */
export async function checkWithinLimit(resource: LimitKey): Promise<boolean> {
  try {
    return (await getLimitUsage(resource)).allowed;
  } catch {
    return true;
  }
}
