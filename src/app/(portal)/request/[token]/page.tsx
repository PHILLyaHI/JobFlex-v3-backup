// The homeowner's request page — the one place a submitted project can be
// followed. Reached only through the capability token the confirmation email
// carries (/request/[token]); the token IS the authorization, so there is no
// session and no account, like the intake that created the request.
//
// Shows the routing state machine in human words, the matched contractor when
// there is one, and the "find me another contractor" button under the owner's
// rules: visible from the moment of a match, locked for the first 24 hours,
// spending one of the cascade's three attempts when pressed.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MAX_ATTEMPTS } from "@/lib/leadCenter/cascade";
import { clientRerouteUnlocksAt } from "@/lib/leadCenter/unmatch";
import { RequestStatusCard } from "./request-status-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your request — JobFlex",
  description: "Follow your project request: who it's matched with and what happens next.",
};

export default async function RequestStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const pl = await db.platformLead.findUnique({ where: { accessToken: token } });
  if (!pl) notFound();

  const org = pl.matchedOrgId
    ? await db.organization.findUnique({
        where: { id: pl.matchedOrgId },
        select: { name: true, phone: true },
      })
    : null;

  const unlockAt = pl.status === "MATCHED" ? clientRerouteUnlocksAt(pl.matchedAt) : null;

  return (
    <main className="min-h-dvh bg-[color:var(--paper)] flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-xl">
        <Link href="/" className="flex items-center gap-2.5 mb-10">
          <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px]">
            J
          </div>
          <span className="font-display text-[19px]">JobFlex</span>
        </Link>

        <RequestStatusCard
          token={token}
          status={pl.status}
          projectType={pl.detectedTrade ?? pl.projectType}
          submittedAt={pl.createdAt.toISOString()}
          orgName={org?.name ?? null}
          orgPhone={org?.phone ?? null}
          matchedAt={pl.matchedAt?.toISOString() ?? null}
          unlockAt={unlockAt?.toISOString() ?? null}
          attemptsLeft={Math.max(0, MAX_ATTEMPTS - pl.attemptCount)}
        />

        <p className="mt-8 text-[12px] text-[color:var(--ink-faint)] leading-relaxed">
          This page is private to you — anyone with the link can see your request status, so share
          it carefully. Questions? Reply to any of our emails.
        </p>
        <p className="mt-3 text-[12px] text-[color:var(--ink-faint)]">
          <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
          {" · "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link>
        </p>
      </div>
    </main>
  );
}
