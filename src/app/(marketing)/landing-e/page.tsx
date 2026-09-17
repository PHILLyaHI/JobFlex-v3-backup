// /landing-e — landing-e IS the root now (owner, 2026-09-16). This URL was the
// test copy's address for four days; links to it (review links, ad drafts)
// land on `/` with the same query, so `?industry=` and utm_* survive.

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LandingEPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v)) for (const x of v) q.append(k, x);
  }
  const qs = q.toString();
  permanentRedirect(qs ? `/?${qs}` : "/");
}
