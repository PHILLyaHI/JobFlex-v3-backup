// Which model reads what (2026-09-19): the estimators run on OPENAI_MODEL;
// photos and video frames follow it unless it is a mini or nano tier (then
// gpt-4o), and each has its own override. Reasoning models get no
// temperature. No model call.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/models.check.ts
import { getVisionModel, isReasoningModelName } from "../../src/lib/sdk/openai";

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

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
