"use client";
import * as React from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";

interface Props {
  code: string;
  /** Primary share link — contractor signup with ?ref= (30-day capture). */
  shareUrl: string;
  /** Optional secondary link — the homeowner lead funnel. */
  homeownerUrl?: string;
  rewardSummary: string;
}

function LinkChip({
  label,
  url,
  copied,
  onCopy,
}: {
  label: string;
  url: string;
  copied: boolean;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.04] hairline max-w-full min-w-0">
      <span className="quiet-caps !mb-0 shrink-0">{label}</span>
      <code className="text-[11px] font-mono text-[color:var(--ink-soft)] truncate max-w-[320px]">{url}</code>
      <button
        onClick={() => onCopy(url, `${label} link`)}
        aria-label={`Copy ${label} link`}
        className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05] shrink-0"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function ReferralHeroCard({ code, shareUrl, homeownerUrl, rewardSummary }: Props) {
  const [copied, setCopied] = React.useState<string | null>(null);

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
    toast.success(`${label} copied`);
  }

  async function webShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Try JobFlex",
          text: `Use my code ${code} to sign up on JobFlex — ${rewardSummary}.`,
          url: shareUrl,
        });
      } catch {
        // cancelled
      }
    } else {
      copy(shareUrl, "Share link");
    }
  }

  return (
    <div className="paper-card p-8 md:p-10 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-24 -right-28 h-72 w-72 rounded-full blur-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(closest-side, rgba(31,122,82,0.18), rgba(31,122,82,0.05) 60%, transparent 80%)",
        }}
      />
      <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] items-end gap-8">
        <div>
          <div className="quiet-caps mb-2">Your code</div>
          <div className="flex items-center gap-3">
            <div
              className="font-mono text-[38px] tracking-[0.08em] font-semibold text-[color:var(--ink)] select-all cursor-pointer hover:bg-[color:var(--accent-soft)]/60 rounded-[var(--r-sm)] px-2 py-1 -mx-2 -my-1 transition-colors"
              onClick={() => copy(code, "Code")}
            >
              {code}
            </div>
            <button
              onClick={() => copy(code, "Code")}
              aria-label="Copy code"
              className="h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
            >
              {copied === code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-4 text-[13px] text-[color:var(--ink-muted)] leading-relaxed max-w-lg">
            Share your code with other contractors. {rewardSummary}.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <LinkChip label="Signup" url={shareUrl} copied={copied === shareUrl} onCopy={copy} />
            {homeownerUrl ? (
              <LinkChip label="Homeowners" url={homeownerUrl} copied={copied === homeownerUrl} onCopy={copy} />
            ) : null}
            <Button size="sm" variant="outline" icon={<Share2 className="h-3.5 w-3.5" />} onClick={webShare}>
              Share
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
