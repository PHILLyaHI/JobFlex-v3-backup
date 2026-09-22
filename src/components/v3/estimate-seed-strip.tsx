"use client";

// THE STRIP AN ESTIMATOR SHOWS WHEN IT WAS OPENED FROM A LEAD (2026-09-21):
// whose job this is, the address that was typed in for them, and the way
// back. Mounting it spends the seed (actions/estimateSeed), so the estimator
// prefills once and a later visit starts empty.

import { useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { consumeEstimateSeed } from "@/actions/estimateSeed";

export function EstimateSeedStrip({ leadId, name, address }: { leadId: string; name: string; address: string | null }) {
  useEffect(() => {
    void consumeEstimateSeed();
  }, []);
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-[color:var(--line)] bg-black/[0.03] px-3 py-2 text-[12.5px] dark:bg-white/[0.04]"
      // Inline, because the blueprint shell's element reset (`.content *`)
      // outranks the utility classes and left the strip a hairline (2026-09-22).
      style={{ padding: "9px 14px", margin: "0 0 14px", border: "1.5px solid var(--ink, #0a0a0a)", background: "#fff", fontSize: 13 }}
      data-estimate-seed
    >
      <span className="quiet-caps">From the lead</span>
      <span className="font-medium">{name || "Homeowner"}</span>
      {address ? <span className="text-[color:var(--ink-muted)]">{address}</span> : null}
      <Link href={`/dashboard/leads/${leadId}` as Route} className="ml-auto underline underline-offset-4">
        Back to the lead
      </Link>
    </div>
  );
}
