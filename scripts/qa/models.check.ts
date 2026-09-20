// Which model reads what (2026-09-19): the estimators run on OPENAI_MODEL;
// photos and video frames follow it unless it is a mini or nano tier (then
// gpt-4o), and each has its own override. Reasoning models get no
// temperature. No model call.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/models.check.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getVisionModel, isReasoningModelName, samplingOptions } from "../../src/lib/sdk/openai";

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const withEnv = (env: Record<string, string | undefined>, fn: () => string) => {
  const saved = { OPENAI_MODEL: process.env.OPENAI_MODEL, OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try { return fn(); } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
};

check("the owner's setting: estimators on gpt-4.1, pictures read by gpt-4.1 too", withEnv({ OPENAI_MODEL: "gpt-4.1", OPENAI_VISION_MODEL: undefined }, () => getVisionModel()) === "gpt-4.1");
check("no setting (gpt-4o-mini): pictures keep gpt-4o", withEnv({ OPENAI_MODEL: undefined, OPENAI_VISION_MODEL: undefined }, () => getVisionModel()) === "gpt-4o");
check("a mini or nano tier never reads pictures", withEnv({ OPENAI_MODEL: "gpt-4.1-mini", OPENAI_VISION_MODEL: undefined }, () => getVisionModel()) === "gpt-4o" && withEnv({ OPENAI_MODEL: "gpt-4.1-nano", OPENAI_VISION_MODEL: undefined }, () => getVisionModel()) === "gpt-4o");
check("OPENAI_VISION_MODEL and a caller's own model win", withEnv({ OPENAI_MODEL: "gpt-4.1", OPENAI_VISION_MODEL: "gpt-4o" }, () => getVisionModel()) === "gpt-4o" && getVisionModel("gpt-4.1-2025-04-14") === "gpt-4.1-2025-04-14");
check("gpt-5 and the o-series are reasoning models; gpt-4.1 and gpt-4o are not", isReasoningModelName("gpt-5") && isReasoningModelName("o3") && isReasoningModelName("o4-mini") && !isReasoningModelName("gpt-4.1") && !isReasoningModelName("gpt-4o"));

// ── Every chat call is safe for a reasoning model ───────────────────────────
// gpt-5 and the o-series reject a temperature and a seed. A call that sends
// one fails outright, so no call may name a temperature of its own: they all
// go through samplingOptions (lib/sdk/openai), which drops it for those
// models. This is the check that lets OPENAI_MODEL move to gpt-5.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
const callers = walk("src").filter((f) => readFileSync(f, "utf8").includes("chat.completions.create"));
const raw = callers.filter((f) => /^\s*temperature:/m.test(readFileSync(f, "utf8")));
check(`every file that calls the model routes its temperature through samplingOptions (${callers.length} files)`, callers.length >= 8 && raw.length === 0, raw.join(", "));
const seedy = callers.filter((f) => /^\s*seed:/m.test(readFileSync(f, "utf8")));
check("no call sends a bare seed either", seedy.length === 0, seedy.join(", "));

// ── The pages that run the model allow it time to think ─────────────────────
const PAGES = [
  "src/app/dashboard/advanced-ai/page.tsx",
  "src/app/(mobile)/mobile-advanced-ai-v2/page.tsx",
  "src/app/dashboard/video-estimator/page.tsx",
  "src/app/dashboard/fence-estimator/page.tsx",
  "src/app/dashboard/hvac-estimator/page.tsx",
  "src/app/dashboard/roof-estimator/page.tsx",
];
const short = PAGES.filter((f) => {
  const m = /export const maxDuration = (\d+)/.exec(readFileSync(f, "utf8"));
  return !m || Number(m[1]) < 300;
});
check(`every estimator page gives its action five minutes (${PAGES.length} pages)`, short.length === 0, short.join(", "));

// ── What a reasoning model is sent ──────────────────────────────────────────
// resolveOpenAIModel remembers the first answer, so this runs last.
process.env.OPENAI_MODEL = "gpt-5";
samplingOptions(0.2, 42)
  .then((sampling) => {
    check("a reasoning model is sent no temperature and no seed", Object.keys(sampling).length === 0, JSON.stringify(sampling));
    console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
    process.exit(bad ? 1 : 0);
  })
  .catch((err) => {
    console.log(`FAIL samplingOptions threw — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
