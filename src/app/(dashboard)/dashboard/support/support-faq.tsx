import { ChevronDown, Mail, Clock, BookOpen } from "lucide-react";

// Self-serve deflection. Native <details> = accessible + zero client JS; the
// chevron rotates via Tailwind's `open:` variant. Answers point at the real
// surfaces in JobFlex so most questions never need a ticket.
const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I send a proposal to a client?",
    a: "Build one under Proposals — it creates a shareable link you can email or text. Your client can review, accept, and pay online, and you'll see the status update in real time.",
  },
  {
    q: "When and how do I get paid?",
    a: "Payments run through your connected Stripe, PayPal, or Square account. Accepted proposals show a payment schedule, and you can send a reminder for any installment in one tap.",
  },
  {
    q: "Can I bring in my existing leads?",
    a: "Yes. Open Leads → Import to paste a list, upload a file, or add them by hand. New inquiries also land in the Incoming tab for you to accept or decline.",
  },
  {
    q: "How do I add my crew?",
    a: "Go to Workers and invite by email. Each worker gets a read-only portal showing only the jobs and schedule assigned to them.",
  },
  {
    q: "How do I change my plan or update billing?",
    a: "Company → Subscription shows your current plan and lets you switch. If something looks off, pick Billing as the category and we'll sort it quickly.",
  },
];

export function SupportFaq() {
  return (
    <div className="space-y-4">
      <div className="paper-card p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[color:var(--ink-line)]">
          <BookOpen className="h-4 w-4 text-[color:var(--accent)]" />
          <h2 className="font-display text-[16px] tracking-[-0.01em] text-[color:var(--ink)]">
            Quick answers
          </h2>
        </div>
        <div className="divide-y divide-[color:var(--ink-line)]">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02] focus-ring [&::-webkit-details-marker]:hidden">
                <span className="text-[13px] font-medium text-[color:var(--ink)]">{f.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--ink-faint)] transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-4 -mt-0.5 text-[12.5px] leading-relaxed text-[color:var(--ink-muted)]">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>

      {/* Other ways to reach us — quiet, hairline, reassurance not decoration. */}
      <div className="paper-card p-5">
        <h3 className="quiet-caps mb-3">Other ways to reach us</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)]">
              <Mail className="h-4 w-4 text-[color:var(--accent-ink)]" />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[color:var(--ink)]">Email</div>
              <a
                href="mailto:support@jobflex.app"
                className="text-[12px] text-[color:var(--accent-ink)] hover:underline"
              >
                support@jobflex.app
              </a>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)]">
              <Clock className="h-4 w-4 text-[color:var(--accent-ink)]" />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[color:var(--ink)]">Response time</div>
              <div className="text-[12px] text-[color:var(--ink-muted)]">
                Typically within one business day, Mon–Fri.
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
