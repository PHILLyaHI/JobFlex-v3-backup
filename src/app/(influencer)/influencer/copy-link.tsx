"use client";
import * as React from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "@/components/ui/Toast";

export function CopyShareLink({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2">
      <code className="truncate max-w-[280px] font-mono text-[11px] text-[color:var(--ink-soft)]">{url}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
          toast.success("Share link copied");
        }}
        aria-label="Copy share link"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
      >
        {copied ? <Check className="h-3 w-3 text-[color:var(--accent)]" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
