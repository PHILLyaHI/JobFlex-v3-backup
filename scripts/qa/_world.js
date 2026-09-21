// The records the page scripts need, made in QA Co and removed afterwards.
//   node scripts/qa/_world.js up | down | status      (from the project root)
// or, inside a script:   const world = require("./_world"); await world.up(); … await world.down();
//
// QA Co is a test-only organisation (CLAUDE.md, Test accounts): nothing here
// reads or writes an organisation a person works in, and `down` removes every
// row this file made — by organisation id, and the two teammates by address.
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { qaOrg, EMAIL } = require("./_qa");

const TEAM = [
  { email: "qa-morgan@qa.test", name: "Morgan Lane", role: "SALES", says: "Morning — the Hartley estimate is ready for your review." },
  { email: "qa-casey@qa.test", name: "Casey Stone", role: "INSTALLER", says: "Crew is on site, starting tear-off." },
];
const JOBS = ["Roof replacement — Hartley", "Cedar fence — Okafor", "Gutter swap — Lindqvist"];
const CONVERSIONS = [
  { signupEmail: "fixture-one@qa.test", status: "PENDING" },
  { signupEmail: "fixture-two@qa.test", status: "CONVERTED", convertedAt: new Date() },
  { signupEmail: "fixture-three@qa.test", status: "PAID", convertedAt: new Date(), rewardCents: 5000 },
];
/** What the scripts may count on. */
const SHAPE = { conversations: TEAM.length, jobs: JOBS.length, conversions: CONVERSIONS.length, converted: 1, pending: 1 };

async function down(prisma = new PrismaClient()) {
  const org = await qaOrg(prisma);
  const where = { organizationId: org.id };
  await prisma.reviewRequest.deleteMany({ where });
  await prisma.tradePost.deleteMany({ where }); // replies cascade
  await prisma.conversation.deleteMany({ where }); // participants + messages cascade
  await prisma.jobExpense.deleteMany({ where: { job: where } }).catch(() => {});
  await prisma.job.deleteMany({ where });
  await prisma.client.deleteMany({ where });
  await prisma.referralCode.deleteMany({ where }); // conversions cascade
  await prisma.membership.deleteMany({ where: { organizationId: org.id, user: { email: { in: TEAM.map((t) => t.email) } } } });
  await prisma.user.deleteMany({ where: { email: { in: TEAM.map((t) => t.email) } } });
}

async function up(prisma = new PrismaClient(), opts = {}) {
  await down(prisma);
  const org = await qaOrg(prisma);
  const qa = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const hashedPassword = await bcrypt.hash("not-a-login-" + Date.now(), 4);
  for (const t of TEAM) {
    const user = await prisma.user.create({ data: { email: t.email, name: t.name, hashedPassword, activeOrgId: org.id } });
    await prisma.membership.create({ data: { userId: user.id, organizationId: org.id, role: t.role } });
    await prisma.conversation.create({
      data: {
        organizationId: org.id,
        kind: "DIRECT",
        participants: { create: [{ userId: qa.id }, { userId: user.id }] },
        messages: { create: [{ authorId: user.id, body: t.says }] },
      },
    });
  }
  // No e-mail on the client: a review request for it is a copyable link, and nothing is ever sent.
  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Fixture Homeowner", phone: "(555) 010-0142", address: "12618 NE 100th St", city: "Kirkland", state: "WA", zip: "98033" } });
  for (const title of JOBS) {
    await prisma.job.create({ data: { organizationId: org.id, clientId: client.id, title, status: "COMPLETED", startsAt: new Date(Date.now() - 9 * 864e5), endsAt: new Date(Date.now() - 7 * 864e5) } });
  }
  // Only on request: the reviews pass starts from "no reviews yet".
  if (opts.review) {
    const job = await prisma.job.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
    await prisma.reviewRequest.create({ data: { organizationId: org.id, jobId: job.id, clientId: client.id, status: "COMPLETED", rating: 5, comment: "Great crew, clean site, on schedule. (fixture)", completedAt: new Date() } });
  }
  // Only on request: the trade pass starts from an empty board; its tail wants a closed post with a reply.
  if (opts.closedTradePost) {
    await prisma.tradePost.create({ data: { organizationId: org.id, authorId: qa.id, title: "QA Trade Post — dump trailer for the week", body: "Fixture post.", category: "equipment", status: "CLOSED", replies: { create: [{ authorId: qa.id, body: "First reply from QA run." }] } } });
  }
  const code = await prisma.referralCode.create({ data: { organizationId: org.id, userId: qa.id, code: "QAF-" + Math.random().toString(36).slice(2, 7).toUpperCase() } });
  for (const c of CONVERSIONS) await prisma.referralConversion.create({ data: { codeId: code.id, ...c } });
  return { orgId: org.id, orgName: org.name, referralCode: code.code, jobTitles: JOBS, team: TEAM.map((t) => t.name), ...SHAPE };
}

async function status(prisma = new PrismaClient()) {
  const org = await qaOrg(prisma);
  const where = { organizationId: org.id };
  return { org: org.name, conversations: await prisma.conversation.count({ where }), jobs: await prisma.job.count({ where }), clients: await prisma.client.count({ where }), referralCodes: await prisma.referralCode.count({ where }), teammates: await prisma.user.count({ where: { email: { in: TEAM.map((t) => t.email) } } }) };
}

module.exports = { up, down, status, SHAPE, TEAM, JOBS };

if (require.main === module) {
  const prisma = new PrismaClient();
  const mode = process.argv[2];
  const run = mode === "up" ? up : mode === "down" ? down : mode === "status" ? status : null;
  if (!run) { console.log("usage: up | down | status"); process.exit(1); }
  run(prisma).then((r) => { console.log(mode, "→", JSON.stringify(r ?? "done")); return prisma.$disconnect(); }).catch((e) => { console.error(e.message); process.exit(1); });
}
