// Partner portal — route-group layout. Mounts the blueprint chrome.
//
// WHY THE SHELL IS CHOSEN BY THE RECORD AND NOT BY THE PATH. Two pages under
// this layout are public by design — /influencer/login, and
// /influencer/set-password, which is reached from an emailed token by someone
// who has no session yet. The (admin) layout tells its own login page apart by
// reading the `x-pathname` header, but that does not work here: src/middleware.ts
// returns early for both of those paths (so they stay reachable without a
// session) and therefore never sets the header. Sniffing it would leave both
// pages looking unauthenticated to this layout and send the login page to
// itself.
//
// So the test is the PRINCIPAL, which is the thing actually being asked about: a
// resolved partner gets the chrome, anything else gets its children bare. That
// covers the two public pages and a stray visitor equally, with no list of paths
// to keep in step with the middleware.
//
// NOT THE GATE. requireInfluencer() here decides what is DRAWN. What may be read
// is decided by each page's own requireInfluencer() — the same shape the
// blueprint chrome uses everywhere else (see blueprint-shell/nav-role, "NOT A
// SECURITY BOUNDARY"). A page that skipped its own guard would render inside a
// shell for a visitor this layout already declined to dress.

import { requireInfluencer } from "@/lib/orgContext";
import { InfluencerShell } from "@/components/v3/influencer-shell/influencer-shell";

export default async function InfluencerRootLayout({ children }: { children: React.ReactNode }) {
  const partner = await requireInfluencer().catch(() => null);
  if (!partner) return <>{children}</>;
  return <InfluencerShell partnerName={partner.displayName}>{children}</InfluencerShell>;
}
