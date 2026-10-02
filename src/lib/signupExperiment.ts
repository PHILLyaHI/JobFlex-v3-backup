import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import type Stripe from "stripe";

export const SIGNUP_EXPERIMENT = "signup_trial_v1";
export const SIGNUP_ALLOCATION_KEY = `${SIGNUP_EXPERIMENT}:allocation`;
export type SignupAllocation = "split" | "a" | "b";
const COOKIE = "jf_signup_trial_v1";
export type SignupAssignment = { id: string; variant: "a" | "b"; at: number; environment: "production" | "development"; allocation?: SignupAllocation };
const key = (id: string) => `${SIGNUP_EXPERIMENT}:browser:${id}`;

export async function readSignupAllocation(): Promise<SignupAllocation> {
  const row = await db.syncState.findUnique({ where: { key: SIGNUP_ALLOCATION_KEY } });
  if (!row) return "a";
  const { mode } = JSON.parse(row.cursor);
  if (mode !== "split" && mode !== "a" && mode !== "b") throw new Error("Invalid signup allocation setting.");
  return mode;
}

export async function readSignupAssignment(): Promise<SignupAssignment | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id || !/^[a-f0-9]{48}$/.test(id)) return null;
  const row = await db.syncState.findUnique({ where: { key: key(id) } });
  return row ? JSON.parse(row.cursor) as SignupAssignment : null;
}

/** Admin allocation applies to new browsers. Never change an in-progress flow. */
export async function assignSignupBrowser(): Promise<SignupAssignment> {
  const existing = await readSignupAssignment();
  if (existing) return existing;
  const allocation = await readSignupAllocation();
  const id = randomBytes(24).toString("hex");
  const hostname = (await headers()).get("host") ?? "";
  const variant = allocation === "split" ? (randomBytes(1)[0] < 128 ? "a" : "b") : allocation;
  const assignment: SignupAssignment = { id, variant, allocation, at: Date.now(), environment: /^(www\.)?jobflex\.app$/.test(hostname) ? "production" : "development" };
  await db.syncState.create({ data: { key: key(id), cursor: JSON.stringify(assignment) } });
  (await cookies()).set(COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  return assignment;
}

export async function recordSignupRegistration(assignment: SignupAssignment, orgId: string, userId: string) {
  await db.syncState.upsert({ where: { key: `${SIGNUP_EXPERIMENT}:org:${orgId}` }, update: {}, create: { key: `${SIGNUP_EXPERIMENT}:org:${orgId}`, cursor: JSON.stringify({ ...assignment, orgId, userId, registeredAt: Date.now() }) } });
}

/** Durable invoice ledger. Invoice IDs deduplicate webhook delivery; no $0 trials. */
export async function recordSignupPayment(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid" || invoice.amount_paid <= 0) return;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  await db.syncState.upsert({ where: { key: `${SIGNUP_EXPERIMENT}:invoice:${invoice.id}` }, update: {}, create: { key: `${SIGNUP_EXPERIMENT}:invoice:${invoice.id}`, cursor: JSON.stringify({ customerId, paidAt: (invoice.status_transitions.paid_at ?? invoice.created) * 1000, cents: invoice.amount_paid, live: invoice.livemode }) } });
}
