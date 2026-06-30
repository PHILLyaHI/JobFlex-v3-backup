import Link from "next/link";

// Visual shell only — intentionally NOT guarded, so /influencer/login (which it
// also wraps) stays reachable without a session. The real principal gate lives
// in each protected page via requireInfluencer(); see page.tsx.
export default function InfluencerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[color:var(--paper)]">
      <header className="sticky top-0 z-20 border-b border-[color:var(--ink-line)] bg-[color:var(--paper)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <Link href={"/influencer" as never} className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-[6px] bg-[color:var(--ink)] font-display text-[13px] leading-none text-[color:var(--paper)]">
              J
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[15px] tracking-[-0.015em]">JobFlex</span>
              <span className="quiet-caps">Partners</span>
            </div>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-6 py-8">{children}</main>
    </div>
  );
}
