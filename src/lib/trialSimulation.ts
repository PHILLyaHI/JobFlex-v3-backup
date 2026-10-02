import "server-only";
import { db } from "@/lib/db";
export const simulationKey = (orgId: string) => "trialSimulation:org:" + orgId;
export async function isTrialSimulation(orgId: string): Promise<boolean> {
  return Boolean(await db.syncState.findUnique({ where: { key: simulationKey(orgId) } }));
}
