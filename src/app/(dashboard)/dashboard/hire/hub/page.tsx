import Link from "next/link";
import { Search, UserPlus, Users, Briefcase, ScrollText, Send, ArrowRight, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";

// The Hire & Work marketplace data layer (contracts / job posts / applications)
// isn't in the Prisma schema yet, so these stay zeroed — the same graceful-empty
// behavior the original hub used. Wire to real counts when the models land.
const activity = [
  { label: "Active contracts", value: "0", hint: "None in progress" },
  { label: "Job posts", value: "0", hint: "None live" },
  { label: "Applications", value: "0", hint: "None sent" },
];

// Each "door" is a primary pathway into the marketplace. One accent, applied
// confidently to the icon tile + CTA — no second color, no gradients.
const doors = [
  {
    href: "/dashboard/hire/talent",
    icon: Search,
    kicker: "For hirers",
    title: "Discover talent",
    body: "Browse worker profiles, view portfolios, and find the right contractor for your next project.",
    cta: "Browse the marketplace",
  },
  {
    href: "/dashboard/hire?tab=work",
    icon: UserPlus,
    kicker: "For workers",
    title: "Publish your profile",
    body: "Showcase your skills and past work, then get discovered by companies looking to hire.",
    cta: "Manage your profile",
  },
];

const links = [
  {
    href: "/dashboard/hire",
    icon: Users,
    label: "Applicant pipeline",
    sub: "Track candidates through your hiring funnel",
  },
  {
    href: "/dashboard/hire/job-posts",
    icon: Briefcase,
    label: "Job posts",
    sub: "Manage your job listings",
  },
  {
    href: "/dashboard/hire/contracts",
    icon: ScrollText,
    label: "Contracts",
    sub: "View active agreements",
  },
  {
    href: "/dashboard/hire/applications",
    icon: Send,
    label: "Applications",
    sub: "Track what you've applied to",
  },
];

export default function HireHubPage() {
  return (
    <>
      <MarkNavSeen surface="hire" />
      <PageHeader
        eyebrow="Marketplace"
        title="Hire & Work"
        description="Browse trusted contractors when you need a hand, or publish your profile and get hired."
        actions={
          <Badge tone="accent" dot>
            Preview
          </Badge>
        }
      />

      <div className="space-y-6">
        {/* Two doors — the page's memorable anchor: one elevated surface split
            down the middle by a single hairline. */}
        <div className="paper-card grid grid-cols-1 divide-y divide-[color:var(--ink-line)] overflow-hidden sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {doors.map((d) => (
            <Link
              key={d.href}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href={d.href as any}
              className="group flex flex-col gap-5 p-8 transition-colors duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:bg-black/[0.02] focus:outline-none focus-visible:bg-[color:var(--accent-soft)] focus-visible:[box-shadow:inset_0_0_0_2px_var(--accent)]"
            >
              <span className="quiet-caps">{d.kicker}</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-md)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                <d.icon className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-display text-[20px] leading-tight tracking-[-0.015em] text-[color:var(--ink)]">
                  {d.title}
                </h2>
                <p className="max-w-[36ch] text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
                  {d.body}
                </p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[13px] font-medium text-[color:var(--accent)]">
                {d.cta}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>

        {/* Activity ledger — a wide hairline-divided strip of tabular numerals. */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Your activity</CardTitle>
              <CardSubtitle>A running tally across the marketplace</CardSubtitle>
            </div>
            <Link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href={"/dashboard/hire/contracts" as any}
              className="inline-flex items-center gap-1 text-[12px] text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="grid grid-cols-3 divide-x divide-[color:var(--ink-line)]">
            {activity.map((s) => (
              <div key={s.label} className="flex flex-col gap-1.5 px-5 first:pl-0 last:pr-0">
                <span className="quiet-caps">{s.label}</span>
                <span className="stat-numeric text-[40px] leading-none text-[color:var(--ink)]">
                  {s.value}
                </span>
                <span className="text-[11px] text-[color:var(--ink-muted)]">{s.hint}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Go deeper — hairline-divided directory rows, not decorative tiles. */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Go deeper</CardTitle>
              <CardSubtitle>Manage the moving parts of hiring</CardSubtitle>
            </div>
          </CardHeader>
          <div className="divide-y divide-[color:var(--ink-line)]">
            {links.map((l) => (
              <Link
                key={l.href}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={l.href as any}
                className="group -mx-6 flex items-center gap-4 px-6 py-4 transition-colors hover:bg-black/[0.02] focus:outline-none focus-visible:bg-black/[0.02] focus-visible:[box-shadow:inset_0_0_0_2px_var(--accent)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-black/[0.04] text-[color:var(--ink-soft)] transition-colors group-hover:bg-[color:var(--accent-soft)] group-hover:text-[color:var(--accent)]">
                  <l.icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">{l.label}</div>
                  <div className="mt-0.5 text-[11px] text-[color:var(--ink-muted)]">{l.sub}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-[color:var(--ink-faint)] transition-all group-hover:translate-x-1 group-hover:text-[color:var(--ink-muted)]" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
