import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { InviteAcceptCard } from "@/components/billing/InviteAcceptCard";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.invite.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invite || invite.acceptedAt) return notFound();

  const expired = invite.expiresAt < new Date();

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 relative">
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 70% 10%, rgba(79,70,229,0.07), transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 mb-6 text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
        >
          <div className="h-7 w-7 rounded-[6px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[13px]">
            J
          </div>
          <span className="font-display text-[16px] tracking-[-0.015em]">JobFlex</span>
        </Link>
        {expired ? (
          <div className="max-w-md mx-auto paper-card p-10 text-center">
            <div className="quiet-caps mb-3">Expired</div>
            <h1 className="font-display text-[28px] tracking-[-0.02em]">This invite has expired.</h1>
            <p className="mt-3 text-[13px] text-[color:var(--ink-muted)]">
              Ask {invite.invitedBy?.name ?? "your teammate"} for a fresh link.
            </p>
          </div>
        ) : (
          <InviteAcceptCard
            token={token}
            orgName={invite.organization.name}
            role={invite.role}
            inviterName={invite.invitedBy?.name ?? invite.invitedBy?.email ?? null}
            expiresAt={invite.expiresAt}
            invitedEmail={invite.email}
          />
        )}
      </div>
    </main>
  );
}
