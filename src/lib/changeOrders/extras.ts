// Server side of lib/contractTotal: the approved change orders of a proposal,
// from the db or from a transaction client.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ContractCo } from "@/lib/contractTotal";

type DbLike = Prisma.TransactionClient | typeof db;

export async function approvedChangeOrders(proposalId: string, tx: DbLike = db): Promise<ContractCo[]> {
  return tx.changeOrder.findMany({
    where: { proposalId, status: "APPROVED" },
    select: { status: true, total: true },
  });
}
