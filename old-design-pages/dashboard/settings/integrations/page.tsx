import Link from "next/link";
import { AtSign, Webhook, ChevronRight } from "lucide-react";

const INTEGRATIONS = [
  {
    href: "/dashboard/settings/gmail",
    label: "Gmail",
    description: "Send proposals and follow-ups from your own address.",
    icon: AtSign,
  },
  {
    href: "/dashboard/settings/meta",
    label: "Meta business",
    description: "Pull Facebook and Instagram leads straight into JobFlex.",
    icon: Webhook,
  },
];

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <h2 className="text-[20px] font-medium tracking-tight text-[color:var(--ink)]">
        Integrations
      </h2>
      <div className="flex flex-col gap-3">
        {INTEGRATIONS.map((item) => (
          <Link
            key={item.href}
            href={item.href as any}
            className="hairline flex items-center gap-4 rounded-[var(--r-lg)] bg-white px-5 py-4 shadow-[var(--shadow-sm)] transition-colors hover:bg-black/[0.02]"
          >
            <span className="hairline grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[color:var(--ink)]">
              <item.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-[color:var(--ink)]">
                {item.label}
              </span>
              <span className="block text-[13px] text-[color:var(--ink-muted)]">
                {item.description}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ink-faint)]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
