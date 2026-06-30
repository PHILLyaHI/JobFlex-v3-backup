"use server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/orgContext";

export type SearchHitType = "client" | "proposal" | "lead";

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/**
 * Global search across clients, proposals, and leads for the current org.
 * Backs the Cmd+K palette. Returns at most ~5 hits per entity, freshest first.
 * SQLite LIKE is case-insensitive for ASCII, so `contains` needs no mode flag.
 */
export async function globalSearch(rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  const { organizationId } = await requireManager();

  const [clients, proposals, leads] = await Promise.all([
    db.client.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
          { city: { contains: q } },
        ],
      },
      select: { id: true, name: true, email: true, city: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.proposal.findMany({
      where: {
        organizationId,
        OR: [
          { title: { contains: q } },
          { client: { is: { name: { contains: q } } } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.lead.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
          { projectType: { contains: q } },
        ],
      },
      select: { id: true, name: true, projectType: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const hits: SearchHit[] = [];

  for (const c of clients) {
    hits.push({
      type: "client",
      id: c.id,
      title: c.name,
      subtitle: c.email ?? c.city ?? null,
      href: `/dashboard/clients/${c.id}`,
    });
  }
  for (const p of proposals) {
    hits.push({
      type: "proposal",
      id: p.id,
      title: p.title,
      subtitle: p.client?.name ?? p.status.toLowerCase(),
      href: `/dashboard/proposals/${p.id}`,
    });
  }
  for (const l of leads) {
    hits.push({
      type: "lead",
      id: l.id,
      title: l.name,
      subtitle: l.projectType ?? l.status.toLowerCase(),
      href: `/dashboard/leads/${l.id}`,
    });
  }

  return hits;
}
