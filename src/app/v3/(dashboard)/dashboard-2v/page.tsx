// Variant-2v parallel build — Dashboard page.
// Faithful port of c:/jobflex-variants/variant-2v-neutral/src/pages/Dashboard.jsx,
// wired to real Prisma data. Lives at /v3/dashboard-2v alongside the live /dashboard.
//
// BEM classes from src/styles/variant-2v.css (imported below). Chrome (sidebar +
// topbar) comes from main's existing DashboardShell via the route group layout.

import "@/styles/variant-2v.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";

export const dynamic = "force-dynamic";

type PillStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "paid";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export default async function Dashboard2vPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.dashboard2v)}`);
  }

  const { organizationId } = await requireOrg();

  const [proposals, activities] = await Promise.all([
    db.proposal.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { name: true } },
      },
    }),
    db.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const pipelineTotal = proposals
    .filter((p) => p.status !== "PAID")
    .reduce((sum, p) => sum + p.total, 0);
  const sentCount = proposals.filter((p) => p.status === "SENT").length;
  const viewedCount = proposals.filter((p) => p.status === "VIEWED").length;
  const acceptedCount = proposals.filter((p) => p.status === "ACCEPTED").length;
  const acceptedValue = proposals
    .filter((p) => p.status === "ACCEPTED")
    .reduce((sum, p) => sum + p.total, 0);

  const recent = proposals.slice(0, 4);

  return (
    <div className="v2v-page">
      <header className="v2v-page__head">
        <div>
          <h1 className="v2v-page__title">Overview</h1>
          <p className="v2v-page__subtitle">
            Where the pipeline stands, what moved today, and what needs a nudge before
            the week closes.
          </p>
        </div>
        <div className="v2v-page__actions">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={V3_PORTED_ROUTES.proposals2v as any} className="v2v-btn v2v-btn--ghost">
            View pipeline
          </Link>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/dashboard/proposals/new" as any} className="v2v-btn v2v-btn--primary">
            <Plus size={14} strokeWidth={1.8} />
            New Proposal
          </Link>
        </div>
      </header>

      <section className="v2v-section">
        <div className="v2v-stat-grid">
          <Stat
            label="Pipeline total"
            value={fmtUsd(pipelineTotal)}
            meta={
              <span>
                <span className="v2v-stat__delta v2v-stat__delta--flat">
                  {proposals.length} active proposals
                </span>
              </span>
            }
          />
          <Stat
            label="Sent"
            value={String(sentCount)}
            meta={
              <span>
                <span className="v2v-stat__delta v2v-stat__delta--flat">
                  awaiting client view
                </span>
              </span>
            }
          />
          <Stat
            label="Viewed"
            value={String(viewedCount)}
            meta={
              <span className="v2v-stat__delta v2v-stat__delta--flat">
                {viewedCount === 0 ? "No opens yet" : "opened, not yet accepted"}
              </span>
            }
          />
          <Stat
            label="Accepted"
            value={String(acceptedCount)}
            accent
            meta={
              <span>
                <span className="v2v-stat__delta v2v-stat__delta--up">
                  {acceptedValue > 0 ? `+${fmtUsd(acceptedValue)}` : "—"}
                </span>{" "}
                closed
              </span>
            }
          />
        </div>
      </section>

      <div className="v2v-split">
        <section className="v2v-section">
          <div className="v2v-surface">
            <div className="v2v-surface__head">
              <span className="v2v-surface__title">Recent proposals</span>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Link
                href={V3_PORTED_ROUTES.proposals2v as any}
                className="v2v-section__link"
              >
                See all {proposals.length} →
              </Link>
            </div>
            {recent.length === 0 ? (
              <div style={{ padding: "20px 18px", color: "var(--ink-muted)", fontSize: 13 }}>
                No proposals yet.
              </div>
            ) : (
              recent.map((p) => (
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                <Link
                  key={p.id}
                  href={`/dashboard/proposals/${p.id}` as any}
                  className="v2v-list-row"
                >
                  <div>
                    <span className="v2v-list-row__primary">{p.title}</span>
                    <span className="v2v-list-row__secondary">
                      {p.client?.name ?? "Unassigned"} · Updated{" "}
                      {p.updatedAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <span className={`v2v-pill v2v-pill--${(p.status.toLowerCase() as PillStatus)}`}>
                    {p.status.toLowerCase()}
                  </span>
                  <span className="v2v-list-row__total tabular">{fmtUsd(p.total)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="v2v-section">
          <div className="v2v-surface">
            <div className="v2v-surface__head">
              <span className="v2v-surface__title">Activity</span>
            </div>
            <div className="v2v-activity">
              {activities.length === 0 ? (
                <div style={{ padding: "20px 18px", color: "var(--ink-muted)", fontSize: 13 }}>
                  No activity yet.
                </div>
              ) : (
                activities.map((a, idx) => (
                  <div className="v2v-activity__item" key={a.id}>
                    <span
                      className={
                        idx === 0
                          ? "v2v-activity__dot v2v-activity__dot--accent"
                          : "v2v-activity__dot"
                      }
                    />
                    <span className="v2v-activity__text">
                      {a.actor?.name ? (
                        <>
                          <b>{a.actor.name}</b> {a.summary}
                        </>
                      ) : (
                        a.summary
                      )}
                    </span>
                    <span className="v2v-activity__time">{relativeTime(a.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  meta,
  accent,
}: {
  label: string;
  value: string;
  meta: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="v2v-stat">
      <div className="v2v-stat__label">{label}</div>
      <div className={accent ? "v2v-stat__value v2v-stat__value--accent" : "v2v-stat__value"}>
        {value}
      </div>
      <div className="v2v-stat__meta">{meta}</div>
    </div>
  );
}
