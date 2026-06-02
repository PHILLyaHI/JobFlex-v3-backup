import Link from "next/link";
import { HomeownerForm } from "./homeowner-form";

export default function HomeownersPage() {
  return (
    <main className="min-h-dvh grid md:grid-cols-5">
      <aside className="md:col-span-2 p-8 md:p-14 bg-[color:var(--paper-deep)] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_80%_10%,rgba(31,122,82,0.12),transparent_60%)]" />
        <Link href="/" className="relative flex items-center gap-2.5 mb-16">
          <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px]">
            J
          </div>
          <span className="font-display text-[19px]">JobFlex</span>
        </Link>
        <div className="relative max-w-md">
          <div className="quiet-caps mb-4">Free · No obligation</div>
          <h1 className="font-display text-[44px] md:text-[52px] leading-[1.02] tracking-[-0.025em]">
            Tell us about your project.
            <br />
            <em className="italic text-[color:var(--accent)] not-italic md:italic">We'll match you with a trusted contractor.</em>
          </h1>
          <p className="mt-6 text-[14px] leading-relaxed text-[color:var(--ink-muted)]">
            Three minutes now saves days of chasing quotes. Describe the work, drop a photo if you
            have one, and we'll do the rest.
          </p>
          <div className="mt-10 space-y-2 text-[13px] text-[color:var(--ink-soft)]">
            {["Licensed and insured contractors only", "Written estimates with line items", "Zero spam — one considered introduction"].map((v) => (
              <div key={v} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[color:var(--accent)]" />
                {v}
              </div>
            ))}
          </div>
        </div>
      </aside>
      <section className="md:col-span-3 p-8 md:p-14 flex items-center justify-center">
        <HomeownerForm />
      </section>
    </main>
  );
}
