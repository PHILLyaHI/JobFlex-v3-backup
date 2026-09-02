"use client";

// ADMIN INTEGRATIONS — /admin/integrations, blueprint.
//
// One row per external service: its name, the env keys that drive it, and its
// state. Two states are evidence and the rest are configuration, so the words
// differ and the legend says which is which once, at the top:
//
//   Live            — the service answered a request made for this render.
//                     Only Stripe and PostHog can reach this state; they are
//                     the only two with a live check in the codebase.
//   Configured      — every env key on the row is present. Nothing contacted.
//   Not configured  — at least one key is missing.
//
// Key NAMES are printed; key VALUES never leave the server. Nothing here reads
// a secret's contents, not even its length.

import Link from "next/link";
import type { Route } from "next";
import type { IntegrationGroup, IntegrationStatus, LiveProbe } from "@/lib/sdk/integrations";
import s from "@/components/v3/admin-overview/admin-shared.module.css";
import { Ic } from "@/components/v3/admin-overview/admin-ui";
import { useAdminMotion } from "@/components/v3/admin-overview/admin-motion";
import i from "./integrations.module.css";

const HEALTH = "/admin/health" as Route;

export type LiveState = "ok" | "error" | "off";
export type LiveMap = Partial<Record<LiveProbe, LiveState>>;

const GROUPS: { key: IntegrationGroup; title: string }[] = [
  { key: "payments", title: "Payments" },
  { key: "messaging", title: "Email & SMS" },
  { key: "property", title: "Property data" },
  { key: "platform", title: "Platform" },
];

function state(it: IntegrationStatus, live: LiveMap): { cls: string; label: string } {
  const probe = it.probe ? live[it.probe] : undefined;
  if (probe === "ok") return { cls: "chip ok", label: "Live" };
  if (probe === "error") return { cls: `chip ${s.chipDanger}`, label: "Error" };
  return it.enabled
    ? { cls: `chip ${s.chipInk}`, label: "Configured" }
    : { cls: `chip ${s.chipMuted}`, label: "Not configured" };
}

function GroupCard({
  title,
  items,
  live,
}: {
  title: string;
  items: IntegrationStatus[];
  live: LiveMap;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-titles">
          <div className="card-title">{title}</div>
        </div>
      </div>
      <hr className="card-rule" />
      {items.map((it) => {
        const chip = state(it, live);
        return (
          <div className={`${s.row} ${i.iRow}`} key={it.key}>
            <div className={s.rowMain}>
              <div className={s.rowTitle} title={it.name}>
                {it.name}
              </div>
            </div>
            <span className={chip.cls}>{chip.label}</span>
            <div className={i.keys}>
              {it.envKeys.map((k) => (
                <span className={s.envk} key={k}>
                  {k}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AdminIntegrationsContent({
  items,
  live,
}: {
  items: IntegrationStatus[];
  live: LiveMap;
}) {
  useAdminMotion();

  const configured = items.filter((it) => it.enabled).length;
  const cards = GROUPS.map((g) => ({
    ...g,
    items: items.filter((it) => it.group === g.key),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">
            Platform · {configured} of {items.length} configured
          </div>
          <h1 className="page-title">Integrations</h1>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost" href={HEALTH}>
            <Ic id="i-check" />
            Health
          </Link>
        </div>
      </div>

      <div className={i.legend}>
        <span className="chip ok">Live</span>
        <em>answered</em>
        <span className={`chip ${s.chipInk}`}>Configured</span>
        <em>key present</em>
      </div>

      <div className="grid-11">
        <GroupCard title={cards[0].title} items={cards[0].items} live={live} />
        <GroupCard title={cards[1].title} items={cards[1].items} live={live} />
      </div>

      <div className="grid-11">
        <GroupCard title={cards[2].title} items={cards[2].items} live={live} />
        <GroupCard title={cards[3].title} items={cards[3].items} live={live} />
      </div>
    </>
  );
}
