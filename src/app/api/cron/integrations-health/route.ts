// GET /api/cron/integrations-health — the nightly sweep.
//
// Runs every check in lib/integrationsHealth, stores the report, and emails the
// platform admins once a day while anything is down. Nothing here spends money:
// two checks speak to a free endpoint, the rest read state this deployment
// already holds. Fail-closed cron auth, same as every other cron route.
import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { alertIfDown, runIntegrationsHealth } from "@/lib/integrationsHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await runIntegrationsHealth();
  const alert = await alertIfDown(report);
  console.info(
    `[cron/integrations-health] ${report.worst} in ${report.tookMs} ms · ` +
      report.services.map((s) => `${s.key}=${s.level}`).join(" ") +
      ` · alert=${alert}`,
  );
  return NextResponse.json({
    ok: true,
    worst: report.worst,
    alert,
    services: report.services.map((s) => ({ key: s.key, level: s.level, reason: s.reason })),
  });
}
