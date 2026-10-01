/* eslint-disable @typescript-eslint/no-unused-vars -- stand-ins keep the real signatures */
// DEMO stand-in for @/stores/usePlanLimitStore (2026-10-01): the landing has
// no plan and no meter, so every check passes and nothing is reported.

export async function ensureWithinLimit(_resource?: unknown): Promise<boolean> {
  return true;
}
export function reportPlanLimit(_err?: unknown): boolean {
  return false;
}
export function reportPlanLimitResult(_res?: unknown): boolean {
  return false;
}
