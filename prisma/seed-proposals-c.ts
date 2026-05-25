// Seeds the Pressroom proposals page with realistic ACCEPTED and PAID rows
// so the Accepted and Completed tabs aren't empty. Idempotent: uses a
// stable `publicId` per fixture so re-running upserts instead of duplicates.
//
// Usage: npx tsx prisma/seed-proposals-c.ts

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

interface InstallmentSpec {
  label: string;
  amount: number;
  isPercent: boolean;
}

interface ProposalSpec {
  publicId: string;
  title: string;
  status: "ACCEPTED" | "PAID";
  total: number;
  clientName: string;
  clientEmail: string;
  clientAddress?: string;
  clientCity?: string;
  clientState?: string;
  clientZip?: string;
  installments: InstallmentSpec[];
  acceptedDaysAgo: number;
  paidDaysAgo?: number;
}

const FIXTURES: ProposalSpec[] = [
  // ── ACCEPTED — money in motion ──────────────────────────────
  {
    publicId: "seed-c-accepted-1",
    title: "Bayard kitchen — full remodel",
    status: "ACCEPTED",
    total: 42800,
    clientName: "Renata Bayard",
    clientEmail: "renata.bayard@gmail.com",
    clientAddress: "117 Spruce St",
    clientCity: "Philadelphia",
    clientState: "PA",
    clientZip: "19106",
    installments: [
      { label: "Deposit", amount: 30, isPercent: true },
      { label: "Demo + rough-in", amount: 25, isPercent: true },
      { label: "Cabinets + counters", amount: 30, isPercent: true },
      { label: "Final + punchlist", amount: 15, isPercent: true },
    ],
    acceptedDaysAgo: 9,
  },
  {
    publicId: "seed-c-accepted-2",
    title: "Hollins back-deck rebuild",
    status: "ACCEPTED",
    total: 18650,
    clientName: "Theo Hollins",
    clientEmail: "theo@hollinsdesign.co",
    clientAddress: "32 Pine Hill Rd",
    clientCity: "Narberth",
    clientState: "PA",
    clientZip: "19072",
    installments: [
      { label: "Deposit", amount: 5500, isPercent: false },
      { label: "Framing complete", amount: 6500, isPercent: false },
      { label: "Final walkthrough", amount: 6650, isPercent: false },
    ],
    acceptedDaysAgo: 21,
  },
  {
    publicId: "seed-c-accepted-3",
    title: "Mendez basement waterproofing",
    status: "ACCEPTED",
    total: 11200,
    clientName: "Luis Mendez",
    clientEmail: "luis.m@gmail.com",
    clientAddress: "4419 Walnut St",
    clientCity: "Philadelphia",
    clientState: "PA",
    clientZip: "19104",
    installments: [
      { label: "Deposit", amount: 33, isPercent: true },
      { label: "Mid-job", amount: 33, isPercent: true },
      { label: "Completion", amount: 34, isPercent: true },
    ],
    acceptedDaysAgo: 4,
  },
  {
    publicId: "seed-c-accepted-4",
    title: "Okonkwo primary bath — tile + fixtures",
    status: "ACCEPTED",
    total: 26400,
    clientName: "Adaeze Okonkwo",
    clientEmail: "adaeze@okonkwoarch.com",
    clientAddress: "8 Crescent Ave",
    clientCity: "Wynnewood",
    clientState: "PA",
    clientZip: "19096",
    installments: [
      { label: "Deposit", amount: 25, isPercent: true },
      { label: "Demo + plumbing", amount: 25, isPercent: true },
      { label: "Tile + glass", amount: 30, isPercent: true },
      { label: "Punchlist + sign-off", amount: 20, isPercent: true },
    ],
    acceptedDaysAgo: 14,
  },

  // ── PAID — banked ──────────────────────────────────────────
  {
    publicId: "seed-c-paid-1",
    title: "Sullivan front-porch repair",
    status: "PAID",
    total: 8400,
    clientName: "Maeve Sullivan",
    clientEmail: "maeve.sull@outlook.com",
    clientAddress: "928 Cherry Ln",
    clientCity: "Ardmore",
    clientState: "PA",
    clientZip: "19003",
    installments: [
      { label: "Deposit", amount: 2500, isPercent: false },
      { label: "Materials delivered", amount: 2500, isPercent: false },
      { label: "Final", amount: 3400, isPercent: false },
    ],
    acceptedDaysAgo: 62,
    paidDaysAgo: 18,
  },
  {
    publicId: "seed-c-paid-2",
    title: "Park Ave duplex — exterior paint",
    status: "PAID",
    total: 15800,
    clientName: "Jonas Park",
    clientEmail: "jonas@parkholdings.co",
    clientAddress: "401 Park Ave",
    clientCity: "Bryn Mawr",
    clientState: "PA",
    clientZip: "19010",
    installments: [
      { label: "Deposit", amount: 40, isPercent: true },
      { label: "Prep complete", amount: 30, isPercent: true },
      { label: "Final coat", amount: 30, isPercent: true },
    ],
    acceptedDaysAgo: 90,
    paidDaysAgo: 33,
  },
  {
    publicId: "seed-c-paid-3",
    title: "Castellano kitchen lighting + tile",
    status: "PAID",
    total: 12350,
    clientName: "Sofia Castellano",
    clientEmail: "sofia.c@gmail.com",
    clientAddress: "55 Linden Way",
    clientCity: "Haverford",
    clientState: "PA",
    clientZip: "19041",
    installments: [
      { label: "Deposit", amount: 3500, isPercent: false },
      { label: "Mid-job", amount: 4500, isPercent: false },
      { label: "Final", amount: 4350, isPercent: false },
    ],
    acceptedDaysAgo: 48,
    paidDaysAgo: 5,
  },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  // Find any org — prefer the seeded acme-contracting if present.
  let org = await prisma.organization.findFirst({
    where: { slug: "acme-contracting" },
  });
  if (!org) {
    org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  }
  if (!org) {
    throw new Error("No organization found. Run `npx prisma db seed` first.");
  }
  const owner = await prisma.user.findFirst({
    where: { memberships: { some: { organizationId: org.id } } },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) {
    throw new Error(`No user belongs to org ${org.slug}.`);
  }

  console.log(`▸ Seeding into org "${org.name}" (${org.id}) as ${owner.email}`);

  for (const f of FIXTURES) {
    // Upsert client by (org, email).
    let client = await prisma.client.findFirst({
      where: { organizationId: org.id, email: f.clientEmail },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          organizationId: org.id,
          name: f.clientName,
          email: f.clientEmail,
          address: f.clientAddress ?? null,
          city: f.clientCity ?? null,
          state: f.clientState ?? null,
          zip: f.clientZip ?? null,
        },
      });
    }

    const subtotal = f.total;
    const taxTotal = 0;
    const total = f.total;
    const acceptedAt = daysAgo(f.acceptedDaysAgo);
    const paidAt = f.paidDaysAgo != null ? daysAgo(f.paidDaysAgo) : null;
    const sentAt = daysAgo(f.acceptedDaysAgo + 3);

    // Upsert proposal by publicId (stable per fixture).
    const existing = await prisma.proposal.findUnique({
      where: { publicId: f.publicId },
    });

    if (existing) {
      await prisma.proposal.update({
        where: { id: existing.id },
        data: {
          title: f.title,
          status: f.status,
          subtotal,
          taxTotal,
          total,
          clientId: client.id,
          acceptedAt,
          paidAt,
          sentAt,
          installments: {
            deleteMany: {},
            create: f.installments.map((i, idx) => ({
              label: i.label,
              amount: i.amount,
              isPercent: i.isPercent,
              position: idx,
            })),
          },
        },
      });
      console.log(`  ↻ updated ${f.status}: ${f.title}`);
    } else {
      await prisma.proposal.create({
        data: {
          publicId: f.publicId,
          organizationId: org.id,
          ownerId: owner.id,
          clientId: client.id,
          title: f.title,
          status: f.status,
          subtotal,
          taxTotal,
          total,
          taxRate: 0,
          acceptedAt,
          paidAt,
          sentAt,
          validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          installments: {
            create: f.installments.map((i, idx) => ({
              label: i.label,
              amount: i.amount,
              isPercent: i.isPercent,
              position: idx,
            })),
          },
          lineItems: {
            create: [
              {
                name: f.title,
                description: "Seeded line item",
                measurementType: "LUMP_SUM",
                quantity: 1,
                unitPrice: total,
                materialCost: Math.round(total * 0.35),
                laborCost: Math.round(total * 0.45),
                total,
                position: 0,
              },
            ],
          },
        },
      });
      console.log(`  + created ${f.status}: ${f.title}`);
    }
  }

  const counts = await prisma.proposal.groupBy({
    by: ["status"],
    where: { organizationId: org.id },
    _count: { _all: true },
  });
  console.log("\nProposal counts in org:");
  for (const c of counts) {
    console.log(`  ${c.status.padEnd(10)} ${c._count._all}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
