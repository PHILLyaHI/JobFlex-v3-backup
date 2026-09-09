// ORDERING AN ADDRESS PACK BY PACK — the planner behind measureRoofInstant.
//
// Until 2026-09-08 one request asked EagleView for all seven diagram packs;
// when the account lost its entitlement to any one of them the whole order
// was refused (403 / 10880) and the page got nothing, though pack 001 still
// orders. This module buys what can be bought:
//
//   1. [001] alone. It is the roof area, the one pack a measurement cannot do
//      without: a refusal here is the caller's error, as before.
//   2. ONE request for every other pack the account is known to be entitled
//      to (`live` in EagleViewEntitlement). Refused → the entitlement changed
//      since it was recorded, so fall through to 3 for those packs.
//   3. Pack by pack, in PROBE_ORDER, for everything unknown, stale-denied, or
//      knocked out of step 2. 202 → live; 403 → denied (a refusal is free);
//      anything else → failed, verdict unchanged.
//
// Whatever the billing model, only accepted packs are paid for: EagleView
// rejects a refused request whole. Every accepted request is written to the
// ledger BEFORE its first poll, exactly as the single order was (a lost
// requestId is a paid result nobody can fetch).
//
// Plain module, no "use server": the I/O comes in through `deps`, so the plan
// can be exercised against fakes without ordering anything.

import {
  PD_DIAGRAM_PACKS,
  PD_PACK,
  PdEntitlementError,
  mergeInstantResults,
  type EvOrderInput,
  type InstantRoofData,
  type InstantStructure,
  type PdPack,
} from "@/lib/eagleview";
import { PROBE_ORDER, needsProbe, type PackRecord, type PackStatus } from "@/lib/eagleviewEntitlements";

/** What a measurement's Instant answer is made of, pack by pack. */
export interface PackReport {
  /** Bought — by this order or an earlier one for the same address. */
  have: string[];
  /** The account is not entitled (403). */
  denied: string[];
  /** Errored for another reason (timeout, 5xx); verdict unchanged. */
  failed: string[];
  /** Neither bought nor refused — not attempted. */
  missing: string[];
  /**
   * No record either way: an answer reused from a measurement row saved
   * before the ledger (2026-08-26) says what it CONTAINS, not what was asked
   * for — a pack whose fields are absent may have been refused, empty for
   * this address, or never ordered.
   */
  unknown?: string[];
}

export function packReport(have: Iterable<string>, denied: Iterable<string>, failed: Iterable<string>, unknown: Iterable<string> = []): PackReport {
  const h = new Set(have);
  const d = new Set([...denied].filter((p) => !h.has(p)));
  const f = new Set([...failed].filter((p) => !h.has(p) && !d.has(p)));
  const u = new Set([...unknown].filter((p) => !h.has(p) && !d.has(p) && !f.has(p)));
  return {
    have: PD_DIAGRAM_PACKS.filter((p) => h.has(p)),
    denied: PD_DIAGRAM_PACKS.filter((p) => d.has(p)),
    failed: PD_DIAGRAM_PACKS.filter((p) => f.has(p)),
    missing: PD_DIAGRAM_PACKS.filter((p) => !h.has(p) && !d.has(p) && !f.has(p) && !u.has(p)),
    ...(u.size ? { unknown: PD_DIAGRAM_PACKS.filter((p) => u.has(p)) } : {}),
  };
}

/**
 * Which packs a stored answer EVIDENTLY contains — read off its fields. For
 * rows saved before the ledger this is the only record of what was bought;
 * everything not evidenced is `unknown`, never assumed.
 */
export function packsFromContent(instant: InstantRoofData): { have: PdPack[]; unknown: PdPack[] } {
  const st = instant.structures ?? [];
  const any = (f: (s: InstantStructure) => boolean) => st.some(f);
  const have: PdPack[] = [];
  if (any((s) => s.areaSqft != null)) have.push(PD_PACK.ROOF_AREA);
  if (any((s) => s.pitch != null || s.eaveHeightFt != null)) have.push(PD_PACK.PITCH_EAVE);
  if (any((s) => s.material != null || s.conditionRating != null)) have.push(PD_PACK.MATERIAL_CONDITION);
  if (any((s) => s.roofAgeYears != null)) have.push(PD_PACK.ROOF_AGE);
  if (any((s) => s.facetCount != null || s.shape != null || s.chimney != null || s.solarPanels != null || s.rooftopAcCount != null)) have.push(PD_PACK.PROPERTY_DETAILS);
  if (any((s) => (s.outline?.length ?? 0) >= 3)) have.push(PD_PACK.OUTLINES);
  if ((instant.imagery ?? []).length > 0) have.push(PD_PACK.ORTHO);
  return { have, unknown: PD_DIAGRAM_PACKS.filter((p) => !have.includes(p)) };
}

/** `InstantOrder.packs` → pack ids. Rows from before per-pack ordering carry
 *  null: those were single seven-pack orders. */
export function rowPacks(packsJson: string | null | undefined): string[] {
  if (!packsJson) return [...PD_DIAGRAM_PACKS];
  try {
    const arr = JSON.parse(packsJson);
    return Array.isArray(arr) ? arr.map(String) : [...PD_DIAGRAM_PACKS];
  } catch {
    return [...PD_DIAGRAM_PACKS];
  }
}

export interface OrderDeps {
  /** Places ONE billed order; throws PdEntitlementError on 403. */
  submit(input: EvOrderInput, packs: PdPack[]): Promise<{ requestId: string; completeAddress: string }>;
  /** Collects a placed order; null while still processing. */
  poll(requestId: string, input: EvOrderInput, completeAddress: string, onRaw: (body: string) => void): Promise<InstantRoofData | null>;
  ledger: {
    create(requestId: string, packs: PdPack[]): Promise<void>;
    complete(requestId: string, instant: InstantRoofData, raw: string | null): Promise<void>;
    fail(requestId: string, error: string): Promise<void>;
  };
  entitlements: {
    read(): Promise<Map<string, PackRecord>>;
    mark(packs: readonly string[], status: PackStatus, error?: string | null): Promise<void>;
  };
  /** Whether a poll error is EagleView's final verdict on the order. */
  isTerminalFailure(err: unknown): boolean;
  log?(msg: string): void;
}

export interface OrderOutcome {
  /** Merged answer, or null when nothing could be bought (base refused → thrown instead). */
  instant: InstantRoofData;
  report: PackReport;
}

const ROOF_AREA = PD_PACK.ROOF_AREA;

/** One accepted order, end to end: ledger row before the first poll. */
async function placeOrder(deps: OrderDeps, input: EvOrderInput, packs: PdPack[]): Promise<InstantRoofData> {
  const { requestId, completeAddress } = await deps.submit(input, packs);
  try {
    await deps.ledger.create(requestId, packs);
  } catch (err) {
    deps.log?.(`COULD NOT RECORD instant order ${requestId} (${packs.join(",")}) — a poll timeout will orphan it: ${String(err)}`);
  }
  let raw: string | null = null;
  let got: InstantRoofData | null;
  try {
    got = await deps.poll(requestId, input, completeAddress, (body) => { raw = body; });
  } catch (err) {
    if (deps.isTerminalFailure(err)) await deps.ledger.fail(requestId, err instanceof Error ? err.message : String(err)).catch(() => {});
    throw err;
  }
  if (!got) {
    throw new Error(
      `Property Data is taking longer than expected (order ${requestId}, ${packs.join(", ")}). The order is saved — measuring this address again will collect it without paying twice.`,
    );
  }
  await deps.ledger.complete(requestId, got, raw).catch(() => {});
  return got;
}

/**
 * Buy the diagram packs for an address, minus `skip` (packs the address
 * already has from earlier complete orders). Throws when pack 001 itself is
 * refused or fails — there is no measurement without the area.
 */
export async function orderPacksFor(
  input: EvOrderInput,
  deps: OrderDeps,
  opts: { skip?: readonly string[]; base?: InstantRoofData | null } = {},
): Promise<OrderOutcome> {
  const skip = new Set(opts.skip ?? []);
  const wanted = PD_DIAGRAM_PACKS.filter((p) => !skip.has(p));
  const parts: InstantRoofData[] = opts.base ? [opts.base] : [];
  const have = new Set<string>(skip);
  const denied = new Set<string>();
  const failed = new Set<string>();

  // 1. the area, alone and first
  if (wanted.includes(ROOF_AREA)) {
    try {
      parts.unshift(await placeOrder(deps, input, [ROOF_AREA]));
      have.add(ROOF_AREA);
      await deps.entitlements.mark([ROOF_AREA], "live");
    } catch (err) {
      if (err instanceof PdEntitlementError) await deps.entitlements.mark([ROOF_AREA], "denied", err.message);
      throw err;
    }
  }

  // 2. everything the account is known to have, in one request
  const rest = wanted.filter((p) => p !== ROOF_AREA);
  const known = await deps.entitlements.read();
  const live = rest.filter((p) => known.get(p)?.status === "live");
  let oneByOne = rest.filter((p) => !live.includes(p) && needsProbe(known.get(p)));
  for (const p of rest) if (!live.includes(p) && !oneByOne.includes(p)) denied.add(p); // fresh refusals, not re-asked
  if (live.length) {
    try {
      parts.push(await placeOrder(deps, input, live));
      live.forEach((p) => have.add(p));
      await deps.entitlements.mark(live, "live");
    } catch (err) {
      if (err instanceof PdEntitlementError) {
        deps.log?.(`grouped order for ${live.join(",")} refused — entitlement changed, probing one by one`);
        oneByOne = [...live, ...oneByOne];
      } else {
        live.forEach((p) => failed.add(p));
      }
    }
  }

  // 3. one pack at a time, in the order the page misses them
  const probeOrder = PROBE_ORDER as readonly string[];
  const pending: string[] = oneByOne;
  const ordered = [...probeOrder.filter((p) => pending.includes(p)), ...pending.filter((p) => !probeOrder.includes(p))];
  for (const pack of ordered as PdPack[]) {
    try {
      parts.push(await placeOrder(deps, input, [pack]));
      have.add(pack);
      await deps.entitlements.mark([pack], "live");
    } catch (err) {
      if (err instanceof PdEntitlementError) {
        denied.add(pack);
        await deps.entitlements.mark([pack], "denied", err.message);
      } else {
        failed.add(pack);
        deps.log?.(`pack ${pack} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (!parts.length) throw new Error("Property Data returned nothing to measure from");
  return { instant: mergeInstantResults(parts), report: packReport(have, denied, failed) };
}
