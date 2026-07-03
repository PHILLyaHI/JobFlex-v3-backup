import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Sparkles, FileText, Users, Calendar, LineChart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  // Signed-in users have no use for the marketing landing — send them to work.
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <main className="relative mx-auto max-w-[1200px] px-6 lg:px-10 pt-8 pb-24">
      <nav className="flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px] leading-none">
            J
          </div>
          <span className="font-display text-[19px] tracking-[-0.015em]">JobFlex</span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-[13px] text-[color:var(--ink-soft)]">
          <Link href={"/pricing" as any}>Pricing</Link>
          <Link href={"/about" as any}>About</Link>
          <Link href={"/homeowners" as any}>For homeowners</Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href={"/auth/register" as any}>
            <Button size="sm">Start free</Button>
          </Link>
        </div>
      </nav>

      <section className="mt-16 md:mt-24 grid md:grid-cols-12 gap-8 items-end">
        <div className="md:col-span-8">
          <div className="quiet-caps mb-5">An operating system for contractors</div>
          <h1 className="font-display text-[54px] md:text-[84px] leading-[0.95] tracking-[-0.035em]">
            Quote.
            <br />
            Schedule.
            <br />
            <span className="italic text-[color:var(--accent)]">Get paid.</span>
          </h1>
          <p className="mt-7 text-[16px] leading-relaxed text-[color:var(--ink-muted)] max-w-lg">
            The modern operating system for contractors — AI-powered proposals, a clear lead pipeline,
            scheduling, client portals, and payments. All in one calm, editorial interface.
          </p>
          <div className="mt-9 flex items-center gap-3">
            <Link href={"/auth/register" as any}>
              <Button size="lg" icon={<Sparkles className="h-4 w-4" />}>
                Start free trial
              </Button>
            </Link>
            <Link href={"/homeowners" as any}>
              <Button variant="serif-link">
                Or request an estimate <ArrowUpRight className="inline h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="md:col-span-4 paper-card p-6 space-y-4">
          <div className="quiet-caps">This week · Acme Contracting</div>
          <div className="stat-numeric text-[42px] leading-none">$142,830</div>
          <div className="text-[12px] text-[color:var(--ink-muted)]">
            Revenue collected · 12 proposals sent, 4 accepted
          </div>
          <div className="divider-ink my-2" />
          <div className="space-y-2 text-[12px]">
            <Row label="Patel · roof replacement" value="$18,444" tone="accent" />
            <Row label="Diaz · kitchen remodel" value="$45,368" />
            <Row label="Reilly · deposit" value="$4,200" tone="success" />
          </div>
        </div>
      </section>

      <section className="mt-32 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Feature
          icon={<Sparkles className="h-4 w-4" />}
          title="AI proposals"
          body="Describe the job in plain English. Line items, measurements, scope, timeline — drafted in seconds."
        />
        <Feature
          icon={<Users className="h-4 w-4" />}
          title="Client CRM"
          body="A real client profile. Timeline, proposals, payments, notes — all one click from every job."
        />
        <Feature
          icon={<FileText className="h-4 w-4" />}
          title="Polished portal"
          body="Clients view, sign, and pay on a full-bleed page that looks like a gallery, not a form."
        />
        <Feature
          icon={<Calendar className="h-4 w-4" />}
          title="Scheduling"
          body="Assign installers, confirm availability, post before/after photos. No spreadsheet tab required."
        />
      </section>

      <section className="mt-24 paper-card p-10 md:p-14 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
        <div className="max-w-xl">
          <div className="quiet-caps mb-3">The operator's edge</div>
          <h2 className="font-display text-[36px] md:text-[42px] leading-[1.05] tracking-[-0.02em]">
            Your tools should feel like a well-kept shop — <em className="text-[color:var(--accent)] not-italic md:italic">calm, precise, ready for the next job.</em>
          </h2>
        </div>
        <div className="flex flex-col items-start md:items-end gap-1.5">
          <LineChart className="h-5 w-5 text-[color:var(--ink-muted)]" />
          <div className="quiet-caps">Trusted across</div>
          <div className="font-display text-[22px]">43 states · 2,100 crews</div>
        </div>
      </section>

      <footer className="mt-24 pt-8 border-t border-[color:var(--ink-line)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[12px] text-[color:var(--ink-muted)]">
        <span>© {new Date().getFullYear()} JobFlex · Philadelphia, PA</span>
        <div className="flex items-center gap-5">
          <Link href={"/privacy" as any}>Privacy</Link>
          <Link href={"/terms" as any}>Terms</Link>
          <Link href="/auth/login">Login</Link>
        </div>
      </footer>
    </main>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "accent" | "success" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[color:var(--ink-soft)] truncate">{label}</span>
      <span
        className={
          tone === "accent"
            ? "font-display text-[color:var(--accent)] tabular"
            : tone === "success"
              ? "font-display text-emerald-700 tabular"
              : "font-display tabular"
        }
      >
        {value}
      </span>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="paper-card p-6 flex flex-col gap-3">
      <div className="h-8 w-8 rounded-[8px] bg-[color:var(--accent-soft)] text-[color:var(--accent)] grid place-items-center">
        {icon}
      </div>
      <div className="font-display text-[20px] tracking-[-0.015em]">{title}</div>
      <p className="text-[13px] leading-relaxed text-[color:var(--ink-muted)]">{body}</p>
    </div>
  );
}
