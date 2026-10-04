// THE HOME DASHBOARD — /home/[key] (2026-10-03). The homeowner's own page,
// made by their first request and reached through the key the emails carry.
// No account, no password (lib/home/portal says who may see what).
//
// Owner: "the client's dashboard where all their projects live: review the
// proposal, talk to the contractor, keep the record of everything done to the
// house, plan the next job and get reminded to submit it — make it wow."
// Top to bottom: who and where; what needs them now; the projects (active
// first, each with its contractor, proposal, visit and a message box; the
// finished ones as the house's record); the plans and the calendar; the
// contractors; how to start the next project. It re-reads itself while open.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadHomeDashboard, type HomeDashboard, type HomeNeed } from "@/lib/home/portal";
import type { RequestPortalView, ProposalStage } from "@/lib/requestPortal";
import { publicReviewsPath } from "@/lib/reviews/publicSummary";
import { LiveRefresh, LocalTime } from "@/components/portal/live-time";
import { Planner } from "./planner";
import { MessageBox } from "./message-box";
import { Calendar } from "./calendar";
import s from "./home.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your home — JobFlex",
  description: "Every project on your house, the proposals, your contractors and the jobs you're planning — in one place.",
  robots: { index: false, follow: false },
};

type Tone = "accent" | "emerald" | "rose" | "amber" | "neutral";
const TONE: Record<Tone, string> = { accent: s.stampAccent, emerald: s.stampEmerald, rose: s.stampRose, amber: s.stampAmber, neutral: s.stampNeutral };
const STATUS: Record<RequestPortalView["status2"], { label: string; tone: Tone }> = {
  WAITING: { label: "Finding a pro", tone: "neutral" },
  MATCHED: { label: "Matched", tone: "accent" },
  PROPOSAL: { label: "Proposal ready", tone: "accent" },
  HIRED: { label: "Hired", tone: "emerald" },
  DONE: { label: "Done", tone: "emerald" },
};
const STAGE_WORD: Record<ProposalStage, string> = { NEW: "New", OPENED: "Opened", ACCEPTED: "Accepted", DECLINED: "Declined", PAID: "Paid", COMPLETED: "Completed" };
const NEED_WORD: Record<HomeNeed["kind"], string> = { proposal: "Review", change: "Approve", visit: "Visit", review: "Review", plan: "Submit" };
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function projectTitle(p: RequestPortalView): string {
  return `${p.trade ?? "Project"}${p.place ? ` · ${p.place}` : ""}`;
}

export default async function HomePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const h = await loadHomeDashboard(key);
  if (!h) notFound();
  const active = h.projects.filter((p) => p.status2 !== "DONE" && p.status2 !== "HIRED");
  const record = h.projects.filter((p) => p.status2 === "DONE" || p.status2 === "HIRED");
  const newProjectHref = `/homeowner?home=${encodeURIComponent(h.key)}`;

  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <header className={s.top}>
          <Link href="/" className={s.brand}>
            <span className={s.mark} aria-hidden="true">J</span>
            JobFlex
          </Link>
          <LiveRefresh className={s.live} />
        </header>

        {/* ── who and where ──────────────────────────────────────────── */}
        <section className={s.hero} aria-labelledby="home-title">
          <div className={s.kicker}>Your home dashboard</div>
          <h1 id="home-title" className={s.title}>{h.address ?? h.place ?? `${h.firstName}'s home`}</h1>
          <p className={s.lede}>
            Hi {h.firstName} — every project on your house lives here: the proposals, your contractors, the record of what was done, and the jobs you&apos;re planning. No account, no password: keep this link.
          </p>
          <dl className={s.stats}>
            <div><dt>Projects</dt><dd>{h.stats.projects}</dd></div>
            <div><dt>Hired</dt><dd>{h.stats.hired}</dd></div>
            {h.stats.spent > 0 && <div><dt>Invested</dt><dd>{usd.format(h.stats.spent)}</dd></div>}
            <div><dt>Since</dt><dd><LocalTime iso={h.since} kind="date" tz={h.timeZone} /></dd></div>
          </dl>
          <div className={s.actions}>
            <a className={s.btnPrimary} href={newProjectHref}>Start a new project</a>
            <a className={s.btnGhost} href="#plans">Plan one for later</a>
          </div>
        </section>

        {/* ── what needs them now ────────────────────────────────────── */}
        {h.needs.length > 0 && (
          <section className={`${s.card} ${s.cardAttention}`} aria-labelledby="needs-title">
            <div className={s.cardHead}><h2 id="needs-title" className={s.label}>Needs you</h2></div>
            {h.needs.map((n, i) => (
              <div key={i} className={s.row}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{n.text}</div>
                  {n.at && <div className={s.mono}><LocalTime iso={n.at} tz={h.timeZone} /></div>}
                </div>
                <a className={s.btnPrimary} href={n.href}>{NEED_WORD[n.kind]}</a>
              </div>
            ))}
          </section>
        )}

        {/* ── the projects ───────────────────────────────────────────── */}
        <section className={s.card} aria-labelledby="projects-title">
          <div className={s.cardHead}>
            <h2 id="projects-title" className={s.label}>{active.length === 1 ? "Your project" : "Your projects"}</h2>
            <span className={s.mono}>{active.length} active · {record.length} finished</span>
          </div>
          {active.length === 0 && (
            <p className={s.empty}>Nothing in progress right now. <a className={s.link} href={newProjectHref}>Start a new project</a> — it takes a minute, and a local pro on JobFlex takes it from there.</p>
          )}
          {active.map((p) => <ProjectCard key={p.token} p={p} h={h} />)}
        </section>

        {/* ── plans and the calendar ─────────────────────────────────── */}
        <section className={s.card} id="plans" aria-labelledby="plans-title">
          <div className={s.cardHead}>
            <h2 id="plans-title" className={s.label}>Plan ahead</h2>
            <span className={s.mono}>We remind you by email when the month comes</span>
          </div>
          <div className={s.cardBody}>
            <p className={s.text}>
              Thinking about the garage floor in spring, or paint before the holidays? Put it here with a month. When it comes, we remind you — and one tap sends it to a local pro.
            </p>
            <Planner homeKey={h.key} plans={h.plans} />
          </div>
          <Calendar items={h.calendar} timeZone={h.timeZone} icsHref={`/home/${encodeURIComponent(h.key)}/calendar.ics`} />
        </section>

        {/* ── the house's record ─────────────────────────────────────── */}
        {record.length > 0 && (
          <section className={s.card} aria-labelledby="record-title">
            <div className={s.cardHead}>
              <h2 id="record-title" className={s.label}>Done on your house</h2>
              <span className={s.mono}>Your record — keep it for as long as you own the place</span>
            </div>
            {record.map((p) => <ProjectCard key={p.token} p={p} h={h} />)}
          </section>
        )}

        {/* ── memberships ────────────────────────────────────────────── */}
        {h.memberships.length > 0 && (
          <section className={s.card} aria-labelledby="plans-sp-title">
            <div className={s.cardHead}><h2 id="plans-sp-title" className={s.label}>Your memberships</h2></div>
            {h.memberships.map((m) => (
              <div key={m.href} className={s.row}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{m.name} · {m.orgName}</div>
                  <div className={s.mono}>
                    {m.status === "ACTIVE" ? "Member" : "Offered to you"}
                    {m.nextVisit && <> · next visit <LocalTime iso={m.nextVisit.at} kind="day" tz={h.timeZone} /> — {m.nextVisit.label}</>}
                    {m.endsAt && m.status === "ACTIVE" && <> · through <LocalTime iso={m.endsAt} kind="date" tz={h.timeZone} /></>}
                  </div>
                </div>
                <a className={m.status === "SENT" ? s.btnPrimary : s.btnGhost} href={m.href}>{m.status === "SENT" ? "See the plan" : "Open"}</a>
              </div>
            ))}
          </section>
        )}

        {/* ── the contractors ────────────────────────────────────────── */}
        {h.contractors.length > 0 && (
          <section className={s.card} aria-labelledby="pros-title">
            <div className={s.cardHead}><h2 id="pros-title" className={s.label}>Your contractors</h2></div>
            {h.contractors.map((c) => (
              <div key={c.org.id} className={s.row}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{c.org.name}</div>
                  <div className={s.proMeta}>
                    {c.org.place && <span>{c.org.place}</span>}
                    <span>{c.projects} {c.projects === 1 ? "project" : "projects"}</span>
                    {c.org.rating && (
                      <a className={s.link} href={publicReviewsPath(c.org.slug)} target="_blank" rel="noopener noreferrer">
                        ★ {c.org.rating.avg.toFixed(1)} · {c.org.rating.count} review{c.org.rating.count === 1 ? "" : "s"}
                      </a>
                    )}
                  </div>
                </div>
                <div className={s.actions}>
                  {c.org.telHref && <a className={s.btnGhost} href={c.org.telHref}>Call</a>}
                  {c.org.smsHref && <a className={s.btnGhost} href={c.org.smsHref}>Text</a>}
                  {c.org.email && <a className={s.btnGhost} href={`mailto:${c.org.email}`}>Email</a>}
                  {c.bookingHref && <a className={s.btnGhost} href={c.bookingHref}>Book a visit</a>}
                  <a className={s.btnGhost} href={c.hireHref}>Hire again</a>
                </div>
              </div>
            ))}
          </section>
        )}

        <footer className={s.foot}>
          <p>
            This page is private to you — anyone with the link can see your projects, so share it carefully. Lost the link? Go to <Link href="/home">jobflex.app/home</Link> and we&apos;ll email it to {h.email}.
          </p>
          <p>
            <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}

function ProjectCard({ p, h }: { p: RequestPortalView; h: HomeDashboard }) {
  const st = STATUS[p.status2];
  const href = `/request/${encodeURIComponent(p.token)}`;
  const open = p.proposals.find((q) => q.current && (q.stage === "NEW" || q.stage === "OPENED")) ?? null;
  const won = p.proposals.find((q) => q.current && (q.stage === "ACCEPTED" || q.stage === "PAID" || q.stage === "COMPLETED")) ?? null;
  const shown = open ?? won ?? p.proposals.find((q) => q.current) ?? null;
  const messages = h.messages[p.token] ?? [];
  return (
    <article className={s.project} aria-label={projectTitle(p)}>
      <div className={s.projectTop}>
        <span className={`${s.stamp} ${TONE[st.tone]}`}>{st.label}</span>
        <span className={s.mono}>Sent <LocalTime iso={p.submittedAt} kind="date" tz={h.timeZone} /></span>
      </div>
      <div className={s.projectTitle}>{projectTitle(p)}</div>
      {p.scope && <p className={s.scope}>{p.scope.split("\n")[0]}</p>}
      <dl className={s.facts}>
        {p.current ? (
          <div>
            <dt>Contractor</dt>
            <dd>
              {p.current.org.name}
              {p.current.org.telHref && <> · <a className={s.link} href={p.current.org.telHref}>{p.current.org.phoneDisplay}</a></>}
            </dd>
          </div>
        ) : (
          <div><dt>Contractor</dt><dd>Being matched — you&apos;ll get an email</dd></div>
        )}
        {shown && (
          <div>
            <dt>Proposal</dt>
            <dd>
              {usd.format(shown.total + shown.approvedChanges)} · {STAGE_WORD[shown.stage]} ·{" "}
              <a className={s.link} href={`/portal/q/${encodeURIComponent(shown.publicId)}`}>{open ? "Review & accept" : "Open"}</a>
            </dd>
          </div>
        )}
        {won && (won.paid > 0 || won.remaining > 0) && (
          <div>
            <dt>Payments</dt>
            <dd>
              {won.remaining <= 0 ? "Paid in full" : `${usd.format(won.paid)} paid · ${usd.format(won.remaining)} left`}
              {won.nextDue && won.remaining > 0 && <> · next: {won.nextDue.label} {usd.format(won.nextDue.amount)} — <a className={s.link} href={`/portal/q/${encodeURIComponent(won.publicId)}`}>pay</a></>}
            </dd>
          </div>
        )}
        {p.visits[0] && (
          <div>
            <dt>Next visit</dt>
            <dd><LocalTime iso={p.visits[0].startsAt} kind="day" tz={p.visits[0].timeZone} /> · <LocalTime iso={p.visits[0].startsAt} kind="time" tz={p.visits[0].timeZone} /> — {p.visits[0].title}</dd>
          </div>
        )}
        {p.changeOrders.length > 0 && (
          <div>
            <dt>Waiting for you</dt>
            <dd>{p.changeOrders.map((c) => <a key={c.token} className={s.link} href={`/co/${encodeURIComponent(c.token)}`}>{c.title}</a>).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, " · ", el] : [el]), [])}</dd>
          </div>
        )}
      </dl>
      <div className={s.actions}>
        <a className={open ? s.btnGhost : s.btnPrimary} href={href}>Open project</a>
        {open && <a className={s.btnPrimary} href={`/portal/q/${encodeURIComponent(open.publicId)}`}>Review &amp; accept</a>}
      </div>
      {p.current && <MessageBox homeKey={h.key} token={p.token} orgName={p.current.org.name} sent={messages} timeZone={h.timeZone} />}
    </article>
  );
}
