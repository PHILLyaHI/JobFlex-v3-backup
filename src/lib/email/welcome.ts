// THE WELCOME EMAIL (landing-e pass A, 2026-09-11) — every signup since 2026-09-16.
// Built from the organization's trade, rendered by the one email renderer,
// sent through the one transport. Called inside `after()` from
// completePendingSignup; it must never throw into the signup.
import { appBaseUrl } from "@/lib/appUrl";
import { firstEstimateTarget } from "@/lib/firstEstimate";
import { buildWelcomeFirstEstimate } from "./build/platform";
import { renderEmail } from "./renderEmail";
import { sendEmail } from "@/lib/sdk/resend";

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export async function sendWelcomeFirstEstimate(i: {
  to: string;
  name: string;
  tradeTypes: readonly string[];
  landingIndustry: string | null;
  firstChargeAt: Date;
}) {
  const target = firstEstimateTarget(i.tradeTypes, i.landingIndustry);
  const base = (await appBaseUrl()).replace(/\/$/, "");
  const doc = buildWelcomeFirstEstimate({
    name: i.name,
    href: base + target.href,
    ctaLabel: target.label,
    trade: target.trade,
    firstChargeDate: DATE_FMT.format(i.firstChargeAt),
  });
  const { subject, html } = renderEmail(doc);
  return sendEmail({ to: i.to, subject, html });
}
