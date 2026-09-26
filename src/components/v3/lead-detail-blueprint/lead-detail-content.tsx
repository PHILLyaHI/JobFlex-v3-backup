// ONE LEAD ON THE BLUEPRINT SHEET (2026-09-22). The page the Leads list
// opens: who it is, the scope of work (or the homeowner's words with a
// button that writes the scope), and the estimators — the lead's own trade
// first, roof and fence waiting for a street address. Server-rendered;
// the forms bind server actions (actions/leadEstimate), nothing to hydrate.

import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import { startEstimateFromLead, writeLeadScope } from "@/actions/leadEstimate";
import { ESTIMATOR_LABEL, estimatorFor, looksLikeStreetAddress, type EstimatorId } from "@/lib/leadRules";
import styles from "./lead-detail.module.css";

const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");

// The manual proposal last (owner, 2026-09-22): the sheet opens with the
// lead's name, contact, address and scope already on it.
const ENGINES: EstimatorId[] = ["roof", "fence", "hvac", "smart", "manual"];

/** What each way of pricing does, in a line (the estimate list, 2026-09-25). */
const ENGINE_NOTE: Record<EstimatorId, string> = {
  roof: "Measures the roof from the address",
  fence: "Draws the fence on the property lines",
  hvac: "Sizes the system and prices the install",
  smart: "Prices the scope of work with AI",
  manual: "A blank proposal with the lead filled in",
};

/** Roof and fence measure off the parcel — they need a street address. */
const needsStreet = (engine: EstimatorId) => engine === "roof" || engine === "fence";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const two = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return two || name.slice(0, 2).toUpperCase() || "—";
}

export type LeadDetailProps = {
  lead: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    projectType: string | null;
    description: string | null;
    scope: string | null;
    status: string;
    source: string | null;
    aiCategory: string | null;
    aiConfidence: number | null;
    assignee: string | null;
    created: string;
  };
  /** Owners, managers and estimators price; sales reps and workers only read. */
  canEstimate: boolean;
  /** `?scope=failed` — the model could not write the scope just now. */
  scopeFailed: boolean;
};

export function LeadDetailContent({ lead, canEstimate, scopeFailed }: LeadDetailProps) {
  const primary = estimatorFor(lead.aiCategory, lead.description);
  const fullAddress = [lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(" ")]
    .filter((s) => s && s.trim())
    .join(", ");
  const hasStreet = looksLikeStreetAddress(lead.address);
  const others = ENGINES.filter((e) => e !== primary);
  const primaryOff = needsStreet(primary) && !hasStreet;
  const words = (lead.description ?? "").trim();
  const canWriteScope = !lead.scope && canEstimate && words.length >= 12;
  const source = lead.source === "LEAD_CENTER" ? "Lead Center" : lead.source === "HOMEOWNER" ? "Homeowner form" : (lead.source ?? "Manual");

  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Pipeline · Lead · {lead.status}</div>
          <h1 className={cx("page-title")}>{lead.name}</h1>
        </div>
        <div className={cx("page-actions")}>
          <Link className={cx("btn", "btn-ghost")} href={"/dashboard/leads" as Route}>
            ‹ My leads
          </Link>
        </div>
      </div>

      <div className={cx("grid")}>
        <section className={cx("card")} data-lead-contact>
          <div className={cx("who")}>
            <span className={cx("av")}>{initials(lead.name)}</span>
            <div>
              <div className={cx("who-n")}>{lead.name}</div>
              <div className={cx("who-s")}>{[lead.city, lead.state].filter(Boolean).join(", ") || lead.zip || "—"}</div>
            </div>
          </div>
          <dl className={cx("kv")}>
            <dt>Email</dt>
            <dd className={cx("mono")}>{lead.email ?? "—"}</dd>
            <dt>Phone</dt>
            <dd className={cx("mono")}>{lead.phone ?? "—"}</dd>
            <dt>Job address</dt>
            <dd data-lead-address>
              {fullAddress || "Not given"}
              {!hasStreet && <span className={cx("soft")}> — no street address yet; a roof or fence quote needs one</span>}
            </dd>
            <dt>Project</dt>
            <dd>{lead.projectType ?? lead.aiCategory ?? "—"}</dd>
            <dt>Source</dt>
            <dd>{source}</dd>
            <dt>Created</dt>
            <dd className={cx("mono")}>{lead.created}</dd>
          </dl>
        </section>

        <section className={cx("card")}>
          <div className={cx("plates")}>
            <span className={cx("plate", "plate--status")}>{lead.status}</span>
            {lead.aiCategory && (
              <span className={cx("plate")}>
                AI · {lead.aiCategory}
                {lead.aiConfidence != null && <b>{Math.round(lead.aiConfidence * 100)}%</b>}
              </span>
            )}
            {lead.assignee && <span className={cx("plate")}>Assigned · {lead.assignee}</span>}
          </div>

          {/* The scope written for a contractor (lib/leadScope) when the
              request carried one; the homeowner's own words are always kept. */}
          {lead.scope ? (
            <>
              <div className={cx("sec-h")}>Scope of work</div>
              <p className={cx("scope")} data-lead-scope>
                {lead.scope}
              </p>
              <div className={cx("sec-h")}>In the homeowner&apos;s words</div>
            </>
          ) : (
            <div className={cx("sec-h")}>Project description</div>
          )}
          <p className={cx("words")}>{words || "No description provided."}</p>

          {/* A lead without a scope — a request from before the scope
              existed, an import, a hand-typed lead: one click writes it. */}
          {canWriteScope && (
            <form action={writeLeadScope.bind(null, lead.id)} className={cx("write")} data-lead-write-scope>
              <button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">
                Write the scope of work
              </button>
              <span className={cx("hint")}>
                {scopeFailed
                  ? "The scope couldn't be written just now — try again in a minute."
                  : "Turns these words into the scope a contractor prices from; it then opens in the estimators."}
              </span>
            </form>
          )}

          {/* ESTIMATE THIS JOB (owner, 2026-09-25: "better designed, well
              structured and minimal"): the way this lead's trade prices, as
              the one primary action, then every other way as a quiet row —
              each row a form posting the same startEstimateFromLead. */}
          {canEstimate && (
            <div className={cx("est")} data-lead-estimators>
              <div className={cx("sec-h")}>Estimate this job</div>
              <form action={startEstimateFromLead.bind(null, lead.id, primary)} className={cx("est-lead")}>
                <div className={cx("est-lead-txt")}>
                  <div className={cx("est-lead-n")}>
                    {ESTIMATOR_LABEL[primary]}
                    <span className={cx("est-tag")}>Recommended</span>
                  </div>
                  <span className={cx("hint")}>
                    {primary === "smart"
                      ? "The scope lands in the Smart Proposal's brief with the location filled in."
                      : hasStreet
                        ? `The address goes straight into the ${ESTIMATOR_LABEL[primary]} to measure the job.`
                        : `The ${ESTIMATOR_LABEL[primary]} measures off the address — this lead has no street address yet, so ask for it first.`}
                  </span>
                </div>
                <button className={cx("btn", "btn-primary")} type="submit" disabled={primaryOff} data-estimator={primary}>
                  Start estimate
                </button>
              </form>

              <div className={cx("est-alt-h")}>Or price it another way</div>
              <ul className={cx("est-list")}>
                {others.map((engine) => {
                  const off = needsStreet(engine) && !hasStreet;
                  return (
                    <li key={engine}>
                      <form action={startEstimateFromLead.bind(null, lead.id, engine)}>
                        <button className={cx("est-opt")} type="submit" disabled={off} data-estimator={engine}>
                          <span className={cx("est-opt-n")}>{ESTIMATOR_LABEL[engine]}</span>
                          <span className={cx("est-opt-s")}>{off ? "Needs a street address" : ENGINE_NOTE[engine]}</span>
                          <ChevronRight className={cx("est-opt-go")} aria-hidden="true" />
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
