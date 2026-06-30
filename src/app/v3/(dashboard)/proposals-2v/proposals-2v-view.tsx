"use client";
// Client component for the variant-2v proposals page.
// Handles the local filter-chip state. Server component supplies row data.

import * as React from "react";
import Link from "next/link";
import { Plus, Sparkles, MoreHorizontal } from "lucide-react";

export type Proposal2vStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "paid";

export interface Proposal2vRow {
  id: string;
  title: string;
  clientName: string;
  status: Proposal2vStatus;
  viewCount: number;
  updatedAtISO: string;
  total: number;
  creatorId: string | null;
  creatorName: string | null;
}

type Filter = "all" | Proposal2vStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "viewed", label: "Viewed" },
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" },
  { id: "expired", label: "Expired" },
  { id: "paid", label: "Paid" },
];

const TONES = ["slate", "green", "warm", "ink"] as const;
type Tone = (typeof TONES)[number];

function avatarTone(id: string | null): Tone {
  if (!id) return "ink";
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return TONES[sum % TONES.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function Proposals2vView({ rows }: { rows: Proposal2vRow[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const counts = React.useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      draft: 0,
      sent: 0,
      viewed: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      paid: 0,
    };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const visible = React.useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  return (
    <div className="v2v-page">
      <header className="v2v-page__head">
        <div>
          <h1 className="v2v-page__title">Proposals</h1>
          <p className="v2v-page__subtitle">
            Draft, sent, viewed, accepted. Your full pipeline of quotes in one editorial table.
          </p>
        </div>
        <div className="v2v-page__actions">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/dashboard/advanced-ai" as any} className="v2v-btn v2v-btn--ghost-accent">
            <Sparkles size={14} strokeWidth={1.8} />
            Smart Proposal
          </Link>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/dashboard/proposals/new" as any} className="v2v-btn v2v-btn--primary">
            <Plus size={14} strokeWidth={1.8} />
            Manual
          </Link>
        </div>
      </header>

      <div className="v2v-filters" role="tablist" aria-label="Status filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? "v2v-chip v2v-chip--active" : "v2v-chip"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="v2v-chip__count">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="v2v-table-card">
        <table className="v2v-table">
          <thead>
            <tr>
              <th>Proposal</th>
              <th>Created by</th>
              <th>Status</th>
              <th className="v2v-col-num">Views</th>
              <th>Updated</th>
              <th className="v2v-col-num">Total</th>
              <th aria-label="More" style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "32px 18px", textAlign: "center", color: "var(--ink-muted)" }}>
                  No proposals match this filter.
                </td>
              </tr>
            ) : (
              visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Link
                      href={`/dashboard/proposals/${p.id}` as any}
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <span className="v2v-cell-primary">{p.title}</span>
                      <span className="v2v-cell-secondary">{p.clientName}</span>
                    </Link>
                  </td>
                  <td>
                    {p.creatorName ? (
                      <span className="v2v-cell-user">
                        <span
                          className={`v2v-avatar v2v-avatar--sm v2v-avatar--${avatarTone(p.creatorId)}`}
                        >
                          {initials(p.creatorName)}
                        </span>
                        {p.creatorName}
                      </span>
                    ) : (
                      <span className="v2v-cell-mute">Unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className={`v2v-pill v2v-pill--${p.status}`}>{p.status}</span>
                  </td>
                  <td className="v2v-col-num tabular">
                    {p.status === "draft" ? (
                      <span className="v2v-cell-mute">—</span>
                    ) : (
                      p.viewCount
                    )}
                  </td>
                  <td>
                    <span className="v2v-cell-secondary" style={{ marginTop: 0 }}>
                      {fmtDate(p.updatedAtISO)}
                    </span>
                  </td>
                  <td className="v2v-col-num tabular v2v-cell-total">{fmtUsd(p.total)}</td>
                  <td>
                    <button className="v2v-menu-trigger" type="button" aria-label="More actions">
                      <MoreHorizontal size={16} strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
