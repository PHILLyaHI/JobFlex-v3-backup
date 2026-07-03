"use server";
// Recurring worker unavailability + team busy lookups.
//
// Permission model: limited roles (field workers, sales reps, estimators)
// manage only their own recurring rules (requireOrg + self check); managers
// manage anyone's. Team-wide busy data is manager-only — a limited role's
// calendar never needs the whole crew's schedule.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg, requireManager, isLimitedRole, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { expandRules, busyAt, type BusyInterval } from "@/lib/availability";
import { viewerTimeZone } from "@/lib/viewerTz";

const ruleInput = z
  .object({
    // Manager may create a rule for any org member; omitted = self.
    ownerId: z.string().optional().nullable(),
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
    reason: z.string().min(1).max(120).default("Unavailable"),
  })
  // end < start is allowed and means an overnight window (wraps past midnight,
  // e.g. 10pm→8am). Only a zero-length window (end === start) is rejected.
  .refine((d) => d.endMinute !== d.startMinute, {
    message: "Start and end can't be the same time",
  });

export async function createUnavailabilityRule(raw: unknown) {
  const { organizationId, user, role } = await requireOrg();
  const data = ruleInput.parse(raw);
  const ownerId = data.ownerId ?? user.id;
  if (isLimitedRole(role) && ownerId !== user.id) {
    throw new UnauthorizedError("You can only set your own unavailability");
  }
  if (ownerId !== user.id) {
    const member = await db.membership.findFirst({
      where: { userId: ownerId, organizationId },
    });
    if (!member) throw new Error("Not a member of this organization");
  }
  const rule = await db.unavailabilityRule.create({
    data: {
      organizationId,
      ownerId,
      dayOfWeek: data.dayOfWeek,
      startMinute: data.startMinute,
      endMinute: data.endMinute,
      reason: data.reason,
    },
  });
  revalidatePath("/dashboard/calendar");
  return { id: rule.id };
}

export async function deleteUnavailabilityRule(id: string) {
  const { organizationId, user, role } = await requireOrg();
  const rule = await db.unavailabilityRule.findUnique({ where: { id } });
  if (!rule || rule.organizationId !== organizationId) throw new Error("Not found");
  if (isLimitedRole(role) && rule.ownerId !== user.id) {
    throw new UnauthorizedError("You can only remove your own unavailability");
  }
  await db.unavailabilityRule.delete({ where: { id } });
  revalidatePath("/dashboard/calendar");
}

// Free (or re-block) one occurrence of a recurring rule. dateISO is the local
// date of the occurrence; time-of-day is discarded.
export async function setRuleInstanceFreed(ruleId: string, dateISO: string, freed: boolean) {
  const { organizationId, user, role } = await requireOrg();
  const rule = await db.unavailabilityRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.organizationId !== organizationId) throw new Error("Not found");
  if (isLimitedRole(role) && rule.ownerId !== user.id) {
    throw new UnauthorizedError("You can only override your own unavailability");
  }
  // Parse the date parts explicitly: new Date("YYYY-MM-DD") is UTC midnight,
  // which in western timezones is the PREVIOUS local day.
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getDay() !== rule.dayOfWeek) throw new Error("Date doesn't match the rule's weekday");
  if (freed) {
    await db.unavailabilityException.upsert({
      where: { ruleId_date: { ruleId, date } },
      update: { freed: true },
      create: { ruleId, date, freed: true },
    });
  } else {
    await db.unavailabilityException.deleteMany({ where: { ruleId, date } });
  }
  revalidatePath("/dashboard/calendar");
}

export interface OwnRule {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  reason: string;
  ownerId: string;
  ownerName: string;
}

// Rules visible to the caller: their own, plus (for managers) the whole org's.
export async function listUnavailabilityRules(): Promise<OwnRule[]> {
  const { organizationId, user, role } = await requireOrg();
  const rules = await db.unavailabilityRule.findMany({
    where: {
      organizationId,
      active: true,
      ...(isLimitedRole(role) ? { ownerId: user.id } : {}),
    },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
  return rules.map((r) => ({
    id: r.id,
    dayOfWeek: r.dayOfWeek,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    reason: r.reason,
    ownerId: r.ownerId,
    ownerName: r.owner.name ?? r.owner.email,
  }));
}

export interface PersonBusy {
  /** WorkerProfile.id when the person is an invited worker, else `u:<userId>`. */
  key: string;
  userId: string;
  name: string;
  busy: { startISO: string; endISO: string; kind: BusyInterval["kind"]; label: string }[];
}

// Every schedulable person's busy intervals in [from, to]: job events (via
// assignments), appointment assignments, one-off blocked time, and expanded
// recurring rules. Powers the worker-picker availability dots and the team
// quick view.
export async function getTeamBusy(fromISO: string, toISO: string): Promise<PersonBusy[]> {
  const { organizationId } = await requireManager();
  const from = new Date(fromISO);
  const to = new Date(toISO);
  // The range is client-supplied and feeds a week-walking expansion — reject
  // garbage and cap it so a crafted call can't spin the loop for centuries.
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new Error("Invalid date range");
  }
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new Error("Date range too large");
  }

  const [tz, workers, memberships, jobEvents, appointments, blocked, rules, exceptions] =
    await Promise.all([
      db.organization
        .findUnique({ where: { id: organizationId }, select: { timezone: true } })
        .then((o) => viewerTimeZone(o?.timezone)),
      db.workerProfile.findMany({
        where: { organizationId, inviteStatus: { not: "DECLINED" } },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      db.membership.findMany({
        where: { organizationId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      db.jobEvent.findMany({
        where: {
          organizationId,
          startsAt: { lte: to },
          endsAt: { gte: from },
          // A canceled job isn't busy time. The OR keeps standalone events
          // (jobId null) — filtering on the relation alone would drop them.
          OR: [{ jobId: null }, { job: { status: { not: "CANCELED" } } }],
        },
        include: { job: { select: { assignments: { select: { workerId: true } } } } },
      }),
      db.appointmentAssignment.findMany({
        where: {
          appointment: {
            organizationId,
            startsAt: { lte: to },
            endsAt: { gte: from },
            status: { notIn: ["CANCELED", "NO_SHOW"] },
          },
        },
        include: { appointment: { select: { title: true, startsAt: true, endsAt: true } } },
      }),
      db.blockedTime.findMany({
        where: { organizationId, startsAt: { lte: to }, endsAt: { gte: from } },
      }),
      db.unavailabilityRule.findMany({ where: { organizationId, active: true } }),
      db.unavailabilityException.findMany({
        where: { rule: { organizationId } },
      }),
    ]);

  // People = invited workers + non-worker members (owner/managers) without a profile.
  const byKey = new Map<string, PersonBusy>();
  for (const w of workers) {
    byKey.set(w.id, {
      key: w.id,
      userId: w.userId,
      name: w.displayName,
      busy: [],
    });
  }
  for (const m of memberships) {
    const hasProfile = workers.some((w) => w.userId === m.userId);
    if (hasProfile) continue;
    byKey.set(`u:${m.userId}`, {
      key: `u:${m.userId}`,
      userId: m.userId,
      name: m.user.name ?? m.user.email,
      busy: [],
    });
  }
  const keyByUserId = new Map<string, string>();
  for (const p of byKey.values()) keyByUserId.set(p.userId, p.key);

  const push = (key: string | undefined, iv: BusyInterval) => {
    if (!key) return;
    const p = byKey.get(key);
    if (!p) return;
    p.busy.push({
      startISO: iv.start.toISOString(),
      endISO: iv.end.toISOString(),
      kind: iv.kind,
      label: iv.label,
    });
  };

  for (const e of jobEvents) {
    for (const a of e.job?.assignments ?? []) {
      push(a.workerId, { start: e.startsAt, end: e.endsAt, kind: "job", label: e.title });
    }
  }
  for (const aa of appointments) {
    push(aa.workerId, {
      start: aa.appointment.startsAt,
      end: aa.appointment.endsAt,
      kind: "appointment",
      label: aa.appointment.title,
    });
  }
  for (const b of blocked) {
    if (!b.ownerId) continue; // org-wide blocks are not a per-person signal
    push(keyByUserId.get(b.ownerId), {
      start: b.startsAt,
      end: b.endsAt,
      kind: "blocked",
      label: b.reason,
    });
  }
  const recurring = expandRules(rules, exceptions, from, to, tz);
  for (const iv of recurring) {
    const rule = rules.find((r) => r.id === iv.ruleId);
    if (!rule) continue;
    push(keyByUserId.get(rule.ownerId), iv);
  }

  return [...byKey.values()];
}

// Lightweight point query used by pickers: is each of these workers free in
// [start, end]? Returns the first conflict label per busy worker.
export async function getWorkerConflicts(
  startISO: string,
  endISO: string,
): Promise<Record<string, { kind: string; label: string } | null>> {
  const people = await getTeamBusy(startISO, endISO);
  const start = new Date(startISO);
  const end = new Date(endISO);
  const out: Record<string, { kind: string; label: string } | null> = {};
  for (const p of people) {
    const hit = busyAt(
      p.busy.map((b) => ({
        start: new Date(b.startISO),
        end: new Date(b.endISO),
        kind: b.kind,
        label: b.label,
      })),
      start,
      end,
    );
    out[p.key] = hit ? { kind: hit.kind, label: hit.label } : null;
  }
  return out;
}
