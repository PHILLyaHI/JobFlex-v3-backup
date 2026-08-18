// JobFlex team invite — PORT of the approved mockup
// `jobflex-auth-invite-blueprint.html` (route: /auth/invite/[token]).
//
// This REPLACES the previous surface in place. It is not a side-by-side
// `-blueprint` twin: the standing "donor and successor live side by side"
// convention recorded in the headers of src/app/(marketing)/landing/page.tsx
// and src/app/dashboard/manual-blueprint/page.tsx was REVERSED for this pass
// — ports now overwrite the surface they replace, same route, same files. The
// old paper-card layout and its src/components/billing/InviteAcceptCard.tsx
// are gone with it.
//
// The data layer is untouched. Same query, same hashed-token lookup, same
// notFound() on a missing or already-accepted invite, same expiry test. Only
// the markup and styles changed; accept/decline still call the pre-existing
// acceptInvite / declineInvite server actions.
//
// Metadata is the donor's <title>, verbatim.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { AuthInviteContent } from "@/components/v3/auth-invite-blueprint/auth-invite-content";

export const metadata: Metadata = {
  title: "JobFlex · Team invite",
};

// The mockup's Expires row reads "in 6 days" — a relative string, not the
// absolute date the old card showed. Rendered on the SERVER so the markup the
// client hydrates against is identical. src/lib/format.ts `relative()` only
// handles times in the past, so this is its forward-looking counterpart and
// stays local to the one row that needs it.
function expiresIn(d: Date) {
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `in ${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return "in under an hour";
}

// Token-scoped, never static. Declared so the dev server does not fork its
// static-paths worker for this route — see the workerThreads note in
// next.config.ts.
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.invite.findUnique({
    where: { token: hashToken(token) },
    include: {
      organization: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invite || invite.acceptedAt) return notFound();

  const expired = invite.expiresAt < new Date();

  return (
    <AuthInviteContent
      token={token}
      orgName={invite.organization.name}
      role={invite.role}
      inviterName={invite.invitedBy?.name ?? invite.invitedBy?.email ?? "your teammate"}
      invitedEmail={invite.email}
      expiresIn={expiresIn(invite.expiresAt)}
      expired={expired}
    />
  );
}
