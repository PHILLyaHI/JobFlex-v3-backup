// "Has this workspace been set up?" — the one rule behind the Google-signup
// company step. A password signup cannot reach the app without step 2 (address
// + at least one trade — what the Lead Center matches on). A Google signup is
// provisioned in the auth callback with a placeholder org, so the same two
// facts decide whether it still owes that step.
export function needsCompanySetup(org: {
  address: string | null;
  tradeTypesJson: string | null;
}): boolean {
  let trades: unknown = [];
  try {
    trades = JSON.parse(org.tradeTypesJson ?? "[]");
  } catch {
    trades = [];
  }
  const hasTrade = Array.isArray(trades) && trades.length > 0;
  return !org.address?.trim() && !hasTrade;
}

/** The placeholder name the Google provisioning writes ("Jamie's workspace"). */
export function isPlaceholderOrgName(name: string | null | undefined): boolean {
  return !name || /['’]s workspace$/i.test(name.trim()) || name.trim() === "My workspace";
}

export const SETUP_PATH = "/auth/register?setup=1";
