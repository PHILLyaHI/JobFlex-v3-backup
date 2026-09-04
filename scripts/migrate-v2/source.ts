// Every read from the OLD database, in one place.
//
// Raw SQL, because the reader must see the live catalogue rather than the old
// schema.prisma (which the old app patches around on every deploy). All identifiers
// are double-quoted: the old schema has no @@map, so the physical names are
// PascalCase tables with camelCase columns.
//
// Scoping mirrors what the old app itself did — a proposal belongs to the account if
// `ownerId` matches, or the denormalised `companyOwnerId` does.
import type { Reader } from "./client";

export interface OldUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  phone: string | null;
  password: string | null;
  businessName: string | null;
  role: string | null;
  emailVerified: Date | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionCurrentPeriodEnd: Date | null;
  createdAt: Date;
}

export interface OldSettings {
  companyName: string | null;
  companyLogo: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  taxRate: number | null;
  customSpecialties: unknown;
  palette: string | null;
}

export interface OldQuote {
  id: string;
  publicId: string;
  status: string | null;
  clientId: string | null;
  ownerId: string | null;
  title: string | null;
  projectName: string | null;
  scope: string | null;
  notes: string | null;
  taxRate: number | null;
  lineItems: unknown;
  addOns: unknown;
  calc: unknown;
  beforeAfterPhotos: unknown;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  acceptanceIp: string | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  viewCount: number | null;
  createdAt: Date;
  updatedAt: Date | null;
  invoice_count: number;
  invoice_paid: number;
  invoice_last_paid: Date | null;
}

export interface OldClient {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  state: string | null;
  zip: string | null;
  description: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface OldJobEvent {
  id: string;
  quoteId: string | null;
  title: string | null;
  startsAt: Date;
  endsAt: Date | null;
  notes: string | null;
  status: string | null;
  createdById: string | null;
  ownerId: string | null;
}

export interface OldAppointment {
  id: string;
  leadId: string | null;
  workerId: string | null;
  schedulerId: string | null;
  status: string | null;
  type: string | null;
  startAt: Date;
  endAt: Date | null;
  location: string | null;
  notes: string | null;
  customerNotes: string | null;
  createdById: string | null;
  createdAt: Date;
  lead_name: string | null;
}

export interface OldLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  state: string | null;
  zip: string | null;
  projectType: string | null;
  description: string | null;
  source: string | null;
  status: string | null;
  photos: unknown;
  contactedAt: Date | null;
  createdAt: Date;
  assignedUserId: string | null;
  claimedById: string | null;
  claimedAt: Date | null;
}

export interface OldConversation {
  id: string;
  jobEventId: string | null;
  workerId: string | null;
  ownerId: string | null;
  archived: boolean | null;
  lastReadByOwnerAt: Date | null;
  createdAt: Date;
  job_title: string | null;
  worker_name: string | null;
}

export interface OldMessage {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorType: string | null;
  body: string | null;
  createdAt: Date;
}

export interface OldAccount {
  type: string;
  provider: string;
  providerAccountId: string;
}

/**
 * Who a quote or calendar row belongs to.
 *
 * The old app showed a row to an account if EITHER `ownerId` or the denormalised
 * `companyOwnerId` matched, which means one row can be visible to two accounts —
 * and importing both would put it in whichever workspace ran first. `ownerId` is
 * the real owner and wins; `companyOwnerId` only claims a row nobody owns. Checked
 * against this data: no quote is ambiguous, and the 15 job events that are all
 * belong to their `ownerId`, rolled up to a company owner who merely had a view
 * of them. Nothing is orphaned by this — no row here is owned by someone outside
 * the imported set.
 */
const OWNED = `("ownerId" = $1 OR ("ownerId" IS NULL AND "companyOwnerId" = $1))`;

export async function findUserByEmail(db: Reader, email: string): Promise<OldUser | null> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT id, lower(email) AS email, name, image, phone, password, "businessName",
            role::text AS role, "emailVerified", "subscriptionPlan"::text AS "subscriptionPlan",
            "subscriptionStatus"::text AS "subscriptionStatus", "stripeCustomerId",
            "stripeSubscriptionId", "subscriptionCurrentPeriodEnd", "createdAt"
       FROM "User" WHERE lower(email) = $1 LIMIT 1`,
    email,
  )) as OldUser[];
  return rows[0] ?? null;
}

export async function findSettings(db: Reader, uid: string): Promise<OldSettings | null> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT "companyName", "companyLogo", "companyAddress", "companyPhone", "companyEmail",
            "companyWebsite", "taxRate", "customSpecialties", palette
       FROM "Settings" WHERE "userId" = $1 LIMIT 1`,
    uid,
  )) as OldSettings[];
  return rows[0] ?? null;
}

/** Company rows are often empty shells in this data; specialties are the useful part. */
export async function findCompanySpecialties(db: Reader, uid: string): Promise<string[]> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT c.specialties, c.name, c.location, c.phone, c.website, c."logoUrl"
       FROM "CompanyMember" cm JOIN "Company" c ON c.id = cm."companyId"
      WHERE cm."userId" = $1`,
    uid,
  )) as { specialties: unknown }[];
  const out = new Set<string>();
  for (const r of rows) if (Array.isArray(r.specialties)) for (const s of r.specialties) if (typeof s === "string" && s.trim()) out.add(s.trim());
  return [...out];
}

export async function findAccounts(db: Reader, uid: string): Promise<OldAccount[]> {
  return (await db.$queryRawUnsafe(
    `SELECT type, provider, "providerAccountId" FROM "Account" WHERE "userId" = $1`,
    uid,
  )) as OldAccount[];
}

export async function findClients(db: Reader, uid: string): Promise<OldClient[]> {
  return (await db.$queryRawUnsafe(
    `SELECT id, name, email, phone, address, state, zip, description, "deletedAt", "createdAt"
       FROM "Client" WHERE "ownerId" = $1 ORDER BY "createdAt"`,
    uid,
  )) as OldClient[];
}

/**
 * Live, non-template quotes, with their invoice tally folded in: a quote whose every
 * invoice is PAID gets a real paidAt (the status itself is left faithful to the old
 * app rather than being upgraded to v3's PAID).
 */
export async function findQuotes(db: Reader, uid: string): Promise<OldQuote[]> {
  return (await db.$queryRawUnsafe(
    `SELECT q.id, q."publicId", q.status::text AS status, q."clientId", q."ownerId", q.title,
            q."projectName", q.scope, q.notes, q."taxRate", q."lineItems", q."addOns", q.calc,
            q."beforeAfterPhotos", q."acceptedBy", q."acceptedAt", q."acceptanceIp", q."sentAt",
            q."viewedAt", q."viewCount", q."createdAt", q."updatedAt",
            (SELECT count(*)::int FROM "Invoice" i WHERE i."quoteId" = q.id) AS invoice_count,
            (SELECT count(*)::int FROM "Invoice" i WHERE i."quoteId" = q.id AND i.status::text = 'PAID') AS invoice_paid,
            (SELECT max(i."paidAt") FROM "Invoice" i WHERE i."quoteId" = q.id AND i.status::text = 'PAID') AS invoice_last_paid
       FROM "Quote" q
      WHERE ${OWNED} AND q."deletedAt" IS NULL AND q."isTemplate" = false
      ORDER BY q."createdAt"`,
    uid,
  )) as OldQuote[];
}

/** Client rows referenced by a quote but owned elsewhere — pulled in so no FK dangles. */
export async function findExtraClients(db: Reader, uid: string, ids: string[]): Promise<OldClient[]> {
  if (!ids.length) return [];
  return (await db.$queryRawUnsafe(
    `SELECT id, name, email, phone, address, state, zip, description, "deletedAt", "createdAt"
       FROM "Client" WHERE id = ANY($2::text[]) AND "ownerId" <> $1`,
    uid,
    ids,
  )) as OldClient[];
}

export async function findJobEvents(db: Reader, uid: string): Promise<OldJobEvent[]> {
  return (await db.$queryRawUnsafe(
    `SELECT id, "quoteId", title, "startsAt", "endsAt", notes, status, "createdById", "ownerId"
       FROM "JobEvent" WHERE ${OWNED} AND "deletedAt" IS NULL ORDER BY "startsAt"`,
    uid,
  )) as OldJobEvent[];
}

export async function findAppointments(db: Reader, uid: string): Promise<OldAppointment[]> {
  return (await db.$queryRawUnsafe(
    `SELECT a.id, a."leadId", a."workerId", a."schedulerId", a.status::text AS status,
            a.type::text AS type, a."startAt", a."endAt", a.location, a.notes, a."customerNotes",
            a."createdById", a."createdAt", l.name AS lead_name
       FROM "Appointment" a LEFT JOIN "Lead" l ON l.id = a."leadId"
      WHERE a."companyOwnerId" = $1 OR a."schedulerId" = $1 OR a."createdById" = $1
      ORDER BY a."startAt"`,
    uid,
  )) as OldAppointment[];
}

/** Lead is scoped by companyOwnerId / assignment, not by an ownerId column. */
export async function findLeads(db: Reader, uid: string): Promise<OldLead[]> {
  return (await db.$queryRawUnsafe(
    `SELECT id, name, email, phone, address, state, zip, "projectType", description, source,
            status::text AS status, photos, "contactedAt", "createdAt", "assignedUserId",
            "claimedById", "claimedAt"
       FROM "Lead"
      WHERE ("companyOwnerId" = $1 OR "assignedUserId" = $1 OR "createdById" = $1 OR "claimedById" = $1)
        AND "deletedAt" IS NULL
      ORDER BY "createdAt"`,
    uid,
  )) as OldLead[];
}

export async function findConversations(db: Reader, uid: string): Promise<OldConversation[]> {
  return (await db.$queryRawUnsafe(
    `SELECT c.id, c."jobEventId", c."workerId", c."ownerId", c.archived, c."lastReadByOwnerAt",
            c."createdAt", je.title AS job_title, w.name AS worker_name
       FROM "Conversation" c
       LEFT JOIN "JobEvent" je ON je.id = c."jobEventId"
       LEFT JOIN "User" w ON w.id = c."workerId"
      WHERE c."ownerId" = $1 ORDER BY c."createdAt"`,
    uid,
  )) as OldConversation[];
}

export async function findMessages(db: Reader, conversationIds: string[]): Promise<OldMessage[]> {
  if (!conversationIds.length) return [];
  return (await db.$queryRawUnsafe(
    `SELECT id, "conversationId", "authorId", "authorType"::text AS "authorType", body, "createdAt"
       FROM "Message" WHERE "conversationId" = ANY($1::text[]) ORDER BY "createdAt"`,
    conversationIds,
  )) as OldMessage[];
}

export interface PaidSubscriber {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  status: string;
  stripeSubscriptionId: string | null;
  has_password: boolean;
  quotes: number;
  clients: number;
}

/**
 * The comped accounts: a paid tier the operator set by hand, with NO Stripe
 * subscription behind it. These are on a paid plan just as much as the billed
 * ones, and Stripe cannot know about them, so the old database is the only
 * source. An account that does carry a Stripe subscription id is deliberately
 * NOT here — Stripe decides whether that one is paying (see stripe.ts), and the
 * old database's ACTIVE flag next to a canceled subscription is simply stale.
 */
export async function findCompedSubscribers(db: Reader): Promise<PaidSubscriber[]> {
  return (await db.$queryRawUnsafe(
    `SELECT u.id, lower(u.email) AS email, u.name,
            u."subscriptionPlan"::text AS plan, u."subscriptionStatus"::text AS status,
            u."stripeSubscriptionId", (u.password IS NOT NULL) AS has_password,
            (SELECT count(*)::int FROM "Quote" q
              WHERE (q."ownerId" = u.id OR q."companyOwnerId" = u.id)
                AND q."deletedAt" IS NULL AND q."isTemplate" = false) AS quotes,
            (SELECT count(*)::int FROM "Client" c WHERE c."ownerId" = u.id) AS clients
       FROM "User" u
      WHERE u."subscriptionStatus"::text = 'ACTIVE'
        AND u."subscriptionPlan"::text <> 'FREE'
        AND u."stripeSubscriptionId" IS NULL
      ORDER BY lower(u.email)`,
  )) as PaidSubscriber[];
}

/** Old accounts matching any of these emails or Stripe customer ids. */
export async function findUsersByEmailOrCustomer(
  db: Reader,
  emails: string[],
  customerIds: string[],
): Promise<PaidSubscriber[]> {
  if (!emails.length && !customerIds.length) return [];
  return (await db.$queryRawUnsafe(
    `SELECT u.id, lower(u.email) AS email, u.name,
            u."subscriptionPlan"::text AS plan, u."subscriptionStatus"::text AS status,
            u."stripeSubscriptionId", (u.password IS NOT NULL) AS has_password,
            (SELECT count(*)::int FROM "Quote" q
              WHERE (q."ownerId" = u.id OR (q."ownerId" IS NULL AND q."companyOwnerId" = u.id))
                AND q."deletedAt" IS NULL AND q."isTemplate" = false) AS quotes,
            (SELECT count(*)::int FROM "Client" c WHERE c."ownerId" = u.id) AS clients
       FROM "User" u
      WHERE lower(u.email) = ANY($1::text[]) OR u."stripeCustomerId" = ANY($2::text[])
      ORDER BY lower(u.email)`,
    emails,
    customerIds,
  )) as PaidSubscriber[];
}
