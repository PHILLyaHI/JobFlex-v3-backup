"use client";
import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, MapPin, Inbox, Send, ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { relative } from "@/lib/format";
import { type LeadRow, sourceLabel } from "./leads-shared";

interface Props {
  leads: LeadRow[];
  /** Persists the lead as CLAIMED via the claimLead server action (optimistic in the parent). */
  onAccept: (id: string) => void;
  /** Persists the lead as LOST via updateLeadStatus (optimistic in the parent). */
  onDecline: (id: string) => void;
}

/**
 * The receive side of lead routing: leads the lead center has sent (status ROUTED) and
 * brand-new leads (NEW) land here as job tickets to accept or decline. Accept/decline
 * persist through server actions in the parent workspace, then router.refresh() reconciles.
 */
export function IncomingLeads({ leads, onAccept, onDecline }: Props) {
  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title="You're all caught up"
        description="Leads routed to you from the lead center — and fresh inquiries — show up here to accept or decline."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AnimatePresence initial={false}>
        {leads.map((lead) => (
          <IncomingCard
            key={lead.id}
            lead={lead}
            onAccept={onAccept}
            onDecline={onDecline}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function IncomingCard({ lead, onAccept, onDecline }: { lead: LeadRow } & Pick<Props, "onAccept" | "onDecline">) {
  const [resolving, setResolving] = React.useState<"accept" | "decline" | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const location = [lead.city, lead.state].filter(Boolean).join(", ") || lead.address;

  function accept() {
    if (resolving) return;
    setResolving("accept");
    timer.current = setTimeout(() => {
      onAccept(lead.id);
      toast.success("Lead accepted", `${lead.name} is now in your pipeline as claimed.`);
    }, 460);
  }

  function decline() {
    if (resolving) return;
    setResolving("decline");
    timer.current = setTimeout(() => {
      onDecline(lead.id);
      toast.info("Lead declined", `${lead.name} was returned to the pool.`);
    }, 320);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        resolving === "accept"
          ? { opacity: 0, scale: 0.96, transition: { duration: 0.2 } }
          : { opacity: 0, x: 24, transition: { duration: 0.2 } }
      }
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="relative paper-card !p-0 overflow-hidden flex flex-col"
    >
      {/* Routed banner — the lead-center signal */}
      {lead.status === "ROUTED" && (
        <div className="flex items-center gap-1.5 px-5 py-2 bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] text-[11px] font-medium tracking-[0.01em]">
          <Send className="h-3 w-3" />
          Routed to you from the lead center
        </div>
      )}

      <div className="flex flex-col gap-3.5 p-5 flex-1">
        <div className="flex items-start gap-3">
          <Avatar name={lead.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-[17px] leading-tight tracking-[-0.015em] truncate">
                {lead.name}
              </h3>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[color:var(--ink-muted)]">
              <span>{relative(lead.createdAt)}</span>
              {lead.source && (
                <>
                  <span className="text-[color:var(--ink-faint)]">·</span>
                  <span>{sourceLabel(lead.source)}</span>
                </>
              )}
              {location && (
                <>
                  <span className="text-[color:var(--ink-faint)]">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {location}
                  </span>
                </>
              )}
            </div>
          </div>
          <Badge tone={lead.status === "ROUTED" ? "accent" : "neutral"}>
            {lead.status === "ROUTED" ? "Routed" : "New"}
          </Badge>
        </div>

        {/* Job detail */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-[color:var(--ink)]">
              {lead.projectType ?? "General inquiry"}
            </span>
            {lead.aiCategory && (
              <Badge tone="accent">
                {lead.aiCategory}
                {lead.aiConfidence && lead.aiConfidence > 0 && (
                  <span className="ml-1 tabular opacity-60">{Math.round(lead.aiConfidence * 100)}%</span>
                )}
              </Badge>
            )}
          </div>
          {lead.description && (
            <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)] line-clamp-3">
              {lead.description}
            </p>
          )}
        </div>

        {/* Contact + actions */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="primary"
            icon={<Check className="h-3.5 w-3.5" />}
            loading={resolving === "accept"}
            disabled={resolving === "decline"}
            onClick={accept}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="h-3.5 w-3.5" />}
            disabled={resolving !== null}
            onClick={decline}
          >
            Decline
          </Button>
          <Link
            href={`/dashboard/leads/${lead.id}` as never}
            className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors"
          >
            View
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Accept confirmation sweep — the memorable beat */}
      <AnimatePresence>
        {resolving === "accept" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 grid place-items-center bg-[color:var(--accent-soft)]/85 backdrop-blur-[1px]"
          >
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 18 }}
              className="grid h-11 w-11 place-items-center rounded-full bg-[color:var(--accent)] text-white shadow-pop"
            >
              <Check className="h-5 w-5" />
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
