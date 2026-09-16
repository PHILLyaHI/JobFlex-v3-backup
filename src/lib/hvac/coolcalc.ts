// Cool Calc — the ACCA-approved Manual J report, bought not built.
//
// Cool Calc's REST API (docs.coolcalc.com/developer-docs/current/rest-api)
// is HTTP Basic (API client id / API key) over HTTPS, HATEOAS: every resource
// answers with a `links` array, a POST answers with the new resource in the
// `Location` header. The public docs show the project's address fields and
// the report download; the envelope inputs live in Cool Calc's own UI, which
// is where the contractor finishes the calc. So this client does the plumbing
// — create the project, create the system, fetch the report — and the page
// links the contractor to Cool Calc for the middle.
//
// Env: COOLCALC_CLIENT_ID, COOLCALC_API_KEY, COOLCALC_DEALER_ID, and
// optionally COOLCALC_BASE_URL (defaults to production; the staging base is
// https://stagingapi.coolcalc.com/staging).
//
// Verified against the public documentation on 2026-09-15; not yet run
// against a live account (no credentials in this repo). `fetchImpl` exists so
// scripts/qa/hvac-coolcalc.check.ts can exercise the flow with a fake server.

export const COOLCALC_PRODUCTION_BASE = "https://api3.coolcalc.com/current";
export const COOLCALC_APP_URL = "https://www.coolcalc.com/";

export interface CoolCalcConfig {
  clientId: string;
  apiKey: string;
  dealerId: string;
  baseUrl: string;
}

export function coolCalcConfig(env: NodeJS.ProcessEnv = process.env): CoolCalcConfig | null {
  const clientId = env.COOLCALC_CLIENT_ID?.trim();
  const apiKey = env.COOLCALC_API_KEY?.trim();
  const dealerId = env.COOLCALC_DEALER_ID?.trim();
  if (!clientId || !apiKey || !dealerId) return null;
  return { clientId, apiKey, dealerId, baseUrl: (env.COOLCALC_BASE_URL?.trim() || COOLCALC_PRODUCTION_BASE).replace(/\/+$/, "") };
}

export function isCoolCalcEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return coolCalcConfig(env) !== null;
}

export interface CoolCalcLink { rel?: string; href?: string; name?: string; title?: string; method?: string }

/** The link whose rel/name/title/href names the resource. */
export function findLink(links: unknown, resource: string): string | null {
  if (!Array.isArray(links)) return null;
  const want = resource.toLowerCase();
  for (const l of links as CoolCalcLink[]) {
    if (!l || typeof l.href !== "string") continue;
    const names = [l.rel, l.name, l.title].filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
    if (names.some((n) => n === want || n.endsWith("/" + want)) || l.href.toLowerCase().replace(/\/+$/, "").endsWith("/" + want)) return l.href;
  }
  return null;
}

/** ".../MJ8Projects/2105" → 2105; ".../HVACSystems/2440/" → 2440. */
export function idFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const m = location.replace(/[?#].*$/, "").replace(/\/+$/, "").match(/\/(\d+)$/);
  return m ? m[1] : null;
}

/** "461 Ocean Blvd, Golden Beach, FL 33160" → its parts for the project template. */
export function splitAddress(full: string): { address: string; city: string; state: string; zip: string } {
  const parts = full.split(",").map((p) => p.trim()).filter(Boolean);
  const out = { address: parts[0] ?? full.trim(), city: "", state: "", zip: "" };
  const last = parts[parts.length - 1] ?? "";
  const m = last.match(/^([A-Za-z]{2})\s*(\d{5})?(?:-\d{4})?$/);
  if (parts.length >= 2 && m) {
    out.state = m[1].toUpperCase();
    out.zip = m[2] ?? "";
    out.city = parts.length >= 3 ? parts[parts.length - 2] : "";
  } else if (parts.length >= 3) {
    const st = parts[parts.length - 1].match(/^([A-Za-z]{2})\b/);
    out.state = st ? st[1].toUpperCase() : "";
    out.city = parts[parts.length - 2];
  } else if (parts.length === 2) {
    out.city = parts[1].replace(/\s+[A-Za-z]{2}\s*\d{5}.*$/, "");
    const st = parts[1].match(/\b([A-Za-z]{2})\s*(\d{5})?$/);
    if (st) { out.state = st[1].toUpperCase(); out.zip = st[2] ?? ""; }
  }
  return out;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function authHeaders(cfg: CoolCalcConfig, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.apiKey}`).toString("base64"), Accept: "*/*", ...extra };
}

async function getJson(cfg: CoolCalcConfig, url: string, fetchImpl: FetchLike): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { method: "GET", headers: authHeaders(cfg), cache: "no-store" });
  if (!res.ok) throw new Error(`Cool Calc ${res.status} on GET ${url.replace(cfg.baseUrl, "")}`);
  return (await res.json()) as Record<string, unknown>;
}

async function postJson(cfg: CoolCalcConfig, url: string, body: unknown, fetchImpl: FetchLike): Promise<{ location: string | null; json: Record<string, unknown> | null }> {
  const res = await fetchImpl(url, { method: "POST", headers: authHeaders(cfg, { "Content-Type": "application/json" }), body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`Cool Calc ${res.status} on POST ${url.replace(cfg.baseUrl, "")}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const location = res.headers.get("Location") ?? res.headers.get("location");
  let json: Record<string, unknown> | null = null;
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* some POSTs answer with an empty body */ }
  return { location, json };
}

/** Where the dealer's projects live — the HATEOAS link when the dealer
 *  resource carries one, the documented path otherwise. */
async function projectsUrl(cfg: CoolCalcConfig, fetchImpl: FetchLike): Promise<string> {
  const documented = `${cfg.baseUrl}/dealers/${cfg.dealerId}/MJ8Projects/`;
  try {
    const dealer = await getJson(cfg, `${cfg.baseUrl}/dealers/${cfg.dealerId}`, fetchImpl);
    return findLink(dealer.links, "MJ8Projects") ?? documented;
  } catch {
    return documented;
  }
}

export interface CoolCalcProject { projectId: string; projectUrl: string }
export interface CoolCalcSystem { systemId: string; systemUrl: string; reportUrl: string }

/** Create an MJ8 project for an address. The id comes from the Location
 *  header; when a server omits it, the project is found by name in the list
 *  the POST answers with. */
export async function coolCalcCreateProject(cfg: CoolCalcConfig, input: { project: string; address: string; city: string; state: string; zip?: string }, fetchImpl: FetchLike = fetch): Promise<CoolCalcProject> {
  const url = await projectsUrl(cfg, fetchImpl);
  const body = { MJ8Project: { project: input.project.slice(0, 120), address: input.address, city: input.city, state: input.state, ...(input.zip ? { zip: input.zip } : {}) } };
  const { location, json } = await postJson(cfg, url, body, fetchImpl);
  let projectId = idFromLocation(location);
  if (!projectId && json) {
    const list = (json.MJ8Projects ?? json.items ?? json.data) as unknown;
    if (Array.isArray(list)) {
      const hit = (list as Array<Record<string, unknown>>).find((p) => String(p.project ?? p.name ?? "") === body.MJ8Project.project);
      const id = hit?.projectId ?? hit?.MJ8ProjectId ?? hit?.id;
      if (id !== undefined) projectId = String(id);
    }
  }
  if (!projectId) throw new Error("Cool Calc created the project but returned no id (no Location header and no listing).");
  return { projectId, projectUrl: location ?? `${url.replace(/\/+$/, "")}/${projectId}` };
}

/** Create the HVAC system the report is run for. */
export async function coolCalcCreateSystem(cfg: CoolCalcConfig, project: CoolCalcProject, name: string, fetchImpl: FetchLike = fetch): Promise<CoolCalcSystem> {
  let systemsUrl = `${project.projectUrl.replace(/\/+$/, "")}/HVACSystems/`;
  try {
    const p = await getJson(cfg, project.projectUrl, fetchImpl);
    systemsUrl = findLink(p.links, "HVACSystems") ?? systemsUrl;
  } catch { /* documented path */ }
  const { location, json } = await postJson(cfg, systemsUrl, { HVACSystem: { HVACSystemName: name.slice(0, 80) } }, fetchImpl);
  let systemId = idFromLocation(location);
  if (!systemId && json) {
    const list = (json.HVACSystems ?? json.items ?? json.data) as unknown;
    if (Array.isArray(list)) {
      const hit = (list as Array<Record<string, unknown>>).find((s) => String(s.HVACSystemName ?? "") === name.slice(0, 80));
      const id = hit?.HVACSystemId ?? hit?.id;
      if (id !== undefined) systemId = String(id);
    }
  }
  if (!systemId) throw new Error("Cool Calc created the system but returned no id.");
  const systemUrl = location ?? `${systemsUrl.replace(/\/+$/, "")}/${systemId}`;
  return { systemId, systemUrl, reportUrl: `${systemUrl.replace(/\/+$/, "")}/MJ8Report` };
}

/** The report, as Cool Calc serves it (the docs do not fix the format; the
 *  content type is passed through). */
export async function coolCalcFetchReport(cfg: CoolCalcConfig, reportUrl: string, fetchImpl: FetchLike = fetch): Promise<{ ok: true; contentType: string; bytes: Uint8Array } | { ok: false; status: number; error: string }> {
  const res = await fetchImpl(reportUrl, { method: "GET", headers: authHeaders(cfg), cache: "no-store" });
  if (!res.ok) return { ok: false, status: res.status, error: `Cool Calc answered ${res.status} for the report` };
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { ok: true, contentType: res.headers.get("content-type") ?? "application/octet-stream", bytes };
}
