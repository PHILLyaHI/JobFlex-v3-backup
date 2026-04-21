import { PrismaClient } from "@prisma/client";
import { Role, LeadStatus, ProposalStatus, MeasurementType } from "../src/lib/prismaEnums";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("▸ Seeding JobFlex demo data");

  const org = await prisma.organization.upsert({
    where: { slug: "acme-contracting" },
    update: {},
    create: {
      slug: "acme-contracting",
      name: "Acme Contracting",
      billingEmail: "owner@acme.test",
      phone: "(555) 010-0100",
      address: "220 Market St, Philadelphia, PA",
      defaultTaxRate: 0.06,
      primaryColor: "#4F46E5",
    },
  });

  const password = await bcrypt.hash("password123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@acme.test" },
    update: { hashedPassword: password, activeOrgId: org.id, name: "Jamie Rivera" },
    create: {
      email: "owner@acme.test",
      name: "Jamie Rivera",
      hashedPassword: password,
      activeOrgId: org.id,
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: "sales@acme.test" },
    update: { hashedPassword: password, activeOrgId: org.id, name: "Morgan Lane" },
    create: {
      email: "sales@acme.test",
      name: "Morgan Lane",
      hashedPassword: password,
      activeOrgId: org.id,
    },
  });

  const installer = await prisma.user.upsert({
    where: { email: "installer@acme.test" },
    update: { hashedPassword: password, activeOrgId: org.id, name: "Casey Stone" },
    create: {
      email: "installer@acme.test",
      name: "Casey Stone",
      hashedPassword: password,
      activeOrgId: org.id,
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: org.id } },
    update: { role: Role.OWNER },
    create: { userId: owner.id, organizationId: org.id, role: Role.OWNER },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: sales.id, organizationId: org.id } },
    update: { role: Role.SALES },
    create: { userId: sales.id, organizationId: org.id, role: Role.SALES },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: installer.id, organizationId: org.id } },
    update: { role: Role.INSTALLER },
    create: { userId: installer.id, organizationId: org.id, role: Role.INSTALLER },
  });

  const tagVIP = await prisma.tag.upsert({
    where: { organizationId_label: { organizationId: org.id, label: "VIP" } },
    update: {},
    create: { organizationId: org.id, label: "VIP", color: "#C89450" },
  });

  const clients = await Promise.all(
    [
      { name: "Rohan Patel", email: "rohan@patel.test", phone: "(555) 221-0044", address: "118 Cedar Ave" },
      { name: "Elena Diaz", email: "elena@diaz.test", phone: "(555) 221-0055", address: "221 Oak St" },
      { name: "Marcus Reilly", email: "marcus@reilly.test", phone: "(555) 221-0066", address: "910 Fir Ln" },
    ].map((c) =>
      prisma.client.create({
        data: {
          organizationId: org.id,
          ...c,
          city: "Philadelphia",
          state: "PA",
          zip: "19103",
        },
      }),
    ),
  );

  await prisma.clientTag.create({
    data: { clientId: clients[0].id, tagId: tagVIP.id },
  });

  await Promise.all(
    [
      {
        name: "Sarah Wu",
        email: "sarah@wu.test",
        phone: "(555) 410-2020",
        projectType: "Roof replacement",
        description: "20-year architectural shingles, 2,400 sqft roof, minor decking repair expected.",
        status: LeadStatus.NEW,
        aiCategory: "Roofing",
        aiConfidence: 0.88,
      },
      {
        name: "Ben Okafor",
        email: "ben@okafor.test",
        phone: "(555) 410-2021",
        projectType: "Kitchen remodel",
        description: "Full gut, island, quartz counters, shaker cabs, mid-tier appliances.",
        status: LeadStatus.CONTACTED,
        aiCategory: "Kitchen",
        aiConfidence: 0.92,
        assignedToId: sales.id,
        contactedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
      {
        name: "Priya Shah",
        email: "priya@shah.test",
        phone: "(555) 410-2022",
        projectType: "Fence install",
        description: "180 linear ft cedar privacy fence, one gate, sloped yard.",
        status: LeadStatus.QUOTED,
        aiCategory: "Fencing",
        aiConfidence: 0.95,
        assignedToId: sales.id,
      },
      {
        name: "Luis Romero",
        email: "luis@romero.test",
        projectType: "Deck",
        description: "16x20 composite deck, railings, staircase.",
        status: LeadStatus.NEW,
        aiCategory: "Decking",
        aiConfidence: 0.9,
      },
    ].map((l) =>
      prisma.lead.create({
        data: {
          organizationId: org.id,
          ...l,
          city: "Philadelphia",
          state: "PA",
          zip: "19103",
        },
      }),
    ),
  );

  const publicId1 = randomUUID();
  const proposal1 = await prisma.proposal.create({
    data: {
      publicId: publicId1,
      organizationId: org.id,
      ownerId: sales.id,
      clientId: clients[0].id,
      title: "Patel Residence — Roof Replacement",
      description: "Full tear-off, architectural shingle upgrade, new ridge vents, drip edge, and ice/water shield.",
      scopeOfWork:
        "Remove existing 3-tab shingles to decking. Replace ice & water shield, install synthetic underlayment, 30-year architectural shingles (Owens Corning Duration), new drip edge, new ridge vents, pipe collars. Full cleanup and magnetic sweep.",
      notes: "Material upgrade available: lifetime shingle — +$1,250.",
      status: ProposalStatus.SENT,
      subtotal: 17400,
      taxRate: 0.06,
      taxTotal: 1044,
      total: 18444,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
      viewCount: 2,
      viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      lineItems: {
        create: [
          {
            name: "Tear-off & disposal",
            description: "Remove existing shingles, dispose of debris, dumpster included.",
            measurementType: MeasurementType.SQFT,
            quantity: 2400,
            unitPrice: 1.2,
            materialCost: 0.4,
            laborCost: 0.8,
            total: 2880,
            position: 0,
          },
          {
            name: "Architectural shingles (30-yr)",
            description: "Owens Corning Duration, full roof.",
            measurementType: MeasurementType.SQFT,
            quantity: 2400,
            unitPrice: 4.6,
            materialCost: 2.8,
            laborCost: 1.8,
            total: 11040,
            position: 1,
          },
          {
            name: "Ridge vent system",
            measurementType: MeasurementType.LINEAR_FT,
            quantity: 60,
            unitPrice: 14,
            materialCost: 6,
            laborCost: 8,
            total: 840,
            position: 2,
          },
          {
            name: "Ice & water shield — valleys and eaves",
            measurementType: MeasurementType.SQFT,
            quantity: 400,
            unitPrice: 3.6,
            materialCost: 1.8,
            laborCost: 1.8,
            total: 1440,
            position: 3,
          },
          {
            name: "Project setup + cleanup",
            measurementType: MeasurementType.LUMP_SUM,
            quantity: 1,
            unitPrice: 1200,
            materialCost: 100,
            laborCost: 1100,
            total: 1200,
            position: 4,
          },
        ],
      },
      installments: {
        create: [
          { label: "Deposit on signing", amount: 30, isPercent: true, position: 0 },
          { label: "Materials delivered", amount: 40, isPercent: true, position: 1 },
          { label: "Completion", amount: 30, isPercent: true, position: 2 },
        ],
      },
    },
  });

  const publicId2 = randomUUID();
  await prisma.proposal.create({
    data: {
      publicId: publicId2,
      organizationId: org.id,
      ownerId: sales.id,
      clientId: clients[1].id,
      title: "Diaz — Kitchen Remodel Quote",
      description: "Full kitchen remodel — cabinetry, counters, appliances, lighting.",
      status: ProposalStatus.DRAFT,
      subtotal: 42800,
      taxRate: 0.06,
      taxTotal: 2568,
      total: 45368,
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
      lineItems: {
        create: [
          {
            name: "Shaker cabinetry — painted",
            measurementType: MeasurementType.LINEAR_FT,
            quantity: 28,
            unitPrice: 550,
            materialCost: 380,
            laborCost: 170,
            total: 15400,
            position: 0,
          },
          {
            name: "Quartz counters — 3cm",
            measurementType: MeasurementType.SQFT,
            quantity: 52,
            unitPrice: 85,
            materialCost: 60,
            laborCost: 25,
            total: 4420,
            position: 1,
          },
          {
            name: "Island — seating for 4",
            measurementType: MeasurementType.LUMP_SUM,
            quantity: 1,
            unitPrice: 6800,
            materialCost: 4200,
            laborCost: 2600,
            total: 6800,
            position: 2,
          },
          {
            name: "Appliance package (mid-tier)",
            measurementType: MeasurementType.LUMP_SUM,
            quantity: 1,
            unitPrice: 8800,
            materialCost: 8800,
            laborCost: 0,
            total: 8800,
            position: 3,
          },
          {
            name: "Lighting + electrical",
            measurementType: MeasurementType.LUMP_SUM,
            quantity: 1,
            unitPrice: 3400,
            materialCost: 1200,
            laborCost: 2200,
            total: 3400,
            position: 4,
          },
          {
            name: "Plumbing rough + finish",
            measurementType: MeasurementType.LUMP_SUM,
            quantity: 1,
            unitPrice: 3980,
            materialCost: 1400,
            laborCost: 2580,
            total: 3980,
            position: 5,
          },
        ],
      },
    },
  });

  await prisma.activityEvent.createMany({
    data: [
      {
        organizationId: org.id,
        actorId: sales.id,
        clientId: clients[0].id,
        proposalId: proposal1.id,
        kind: "SENT",
        summary: `Proposal "${proposal1.title}" sent to Rohan Patel`,
      },
      {
        organizationId: org.id,
        actorId: sales.id,
        clientId: clients[0].id,
        proposalId: proposal1.id,
        kind: "VIEWED",
        summary: `Rohan Patel opened the proposal`,
      },
    ],
  });

  await prisma.payment.create({
    data: {
      organizationId: org.id,
      clientId: clients[2].id,
      amount: 4200,
      provider: "STRIPE",
      status: "PAID",
      paidAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      method: "card",
    },
  });

  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      plan: "PROFESSIONAL",
      status: "ACTIVE",
      provider: "STRIPE",
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });

  console.log("✓ Seed complete");
  console.log("   owner@acme.test / password123");
  console.log("   sales@acme.test / password123");
  console.log("   installer@acme.test / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
