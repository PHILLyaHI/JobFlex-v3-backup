"use client";

// ADMIN · USERS & SUBSCRIPTIONS — the page.
// Route: /admin/users. Renders ONLY the shell's `.content` children (the admin
// layout mounts the blueprint chrome), as a fragment, so the reveal cascade
// walks `.content > *`.
//
// Database control over the local mirror: every account, the org it belongs
// to, the org's Subscription row, and the platform-admin flag. Writes go
// through src/actions/adminUsers.ts — updateAdminUser (name/email),
// setPlatformAdmin, updateAdminSubscription (stamps provider MANUAL) and
// deleteAdminUser (typed confirmation; refuses self and the last owner).

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { longDate } from "@/lib/format";
import { SubscriptionStatus } from "@/lib/prismaEnums";
import {
  updateAdminUser,
  setPlatformAdmin,
  updateAdminSubscription,
  deleteAdminUser,
  syncSubscriptionsFromStripe,
} from "@/actions/adminUsers";
import type { AdminUsersData, SubscriptionSummary } from "@/actions/adminUsers";
import {
  LIVE_RECORD_STATUSES,
  STRIPE_SCAN_CEILING_LABEL,
} from "@/components/v3/admin-subscribers/billing-metrics";
import shared from "./admin-shared.module.css";
import s from "./admin-users.module.css";
import {
  makeCx,
  KIT_BTN_CLASS,
  useSheet,
  Sheet,
  SheetBody,
  SheetFoot,
  Field,
  Select,
  Toggle,
  Note,
  StatusBadge,
  errorMessage,
  toDay,
  fromDay,
} from "./admin-kit";
import { useAdminMotion } from "./use-admin-motion";

const cx = makeCx(s, shared);

export interface AdminUserDTO {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  orgId: string | null;
  orgName: string | null;
  roles: string[];
  /** What the table shows: Stripe's answer when it has one, else the record's. */
  plan: string;
  planStatus: string;
  planSource: "stripe" | "record" | "none";
  /** The stored Subscription row — what the sheet's fields write. */
  recordPlan: string;
  recordStatus: string;
  provider: string | null;
  /** What Stripe holds for this org, even when the stored row outranks it. */
  stripePlan: string | null;
  stripeStatus: string | null;
  stripeSubId: string | null;
  externalSubId: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  canceledAt: string | null;
  orgMemberCount: number;
  createdAt: string;
}

export interface PlanOption {
  slug: string;
  name: string;
}

type BillingSource = AdminUsersData["source"];

const STATUS_OPTIONS = Object.values(SubscriptionStatus).map((v) => ({
  value: v,
  label: v.replace("_", " "),
}));

function planLabel(plan: string, plans: PlanOption[]): string {
  const match = plans.find((p) => p.slug.toUpperCase() === plan.toUpperCase());
  return match?.name ?? plan.toLowerCase();
}

export function AdminUsersContent({
  users,
  plans,
  summary,
  source,
  meId,
}: {
  users: AdminUserDTO[];
  plans: PlanOption[];
  summary: SubscriptionSummary;
  source: BillingSource;
  meId: string;
}) {
  useAdminMotion(KIT_BTN_CLASS);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUserDTO | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ text: string; bad: boolean } | null>(null);
  const sheet = useSheet();

  // Pull the live Stripe subscriptions into the platform's own record, then
  // re-render the server component so the numerals above are the new truth.
  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await syncSubscriptionsFromStripe();
      // Every subscription read lands in exactly one bucket; the parts that
      // are zero are left off rather than padded onto the line.
      const parts = [
        `${r.written} written`,
        r.unchanged ? `${r.unchanged} unchanged` : "",
        r.superseded ? `${r.superseded} superseded` : "",
        r.keptManual ? `${r.keptManual} kept as grants` : "",
        r.conflicts ? `${r.conflicts} conflicts` : "",
        r.unnamed ? `${r.unnamed} unnamed plan` : "",
        r.unmatched ? `${r.unmatched} unmatched` : "",
      ].filter(Boolean);
      // A partition of a silently cut set reads exactly like a partition of
      // the whole account, so the cut has to be part of the sentence.
      const scanned = r.truncated
        ? `first ${STRIPE_SCAN_CEILING_LABEL} of more`
        : `${r.scanned} read`;
      setSyncResult({
        text: `${scanned} · ${parts.join(" · ")}`,
        bad: r.conflicts > 0 || r.unnamed > 0 || r.truncated,
      });
      router.refresh();
    } catch (e) {
      setSyncResult({ text: errorMessage(e, "Sync failed."), bad: true });
    } finally {
      setSyncing(false);
    }
  }, [router, syncing]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? users
      : users.filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.orgName ?? "").toLowerCase().includes(q) ||
            u.plan.toLowerCase().includes(q),
        );
    // The signed-in admin first, so "where am I?" is always answerable.
    return [...matched].sort((a, b) => (b.id === meId ? 1 : 0) - (a.id === meId ? 1 : 0));
  }, [users, query, meId]);

  const openRow = useCallback(
    (u: AdminUserDTO) => {
      setSelected(u);
      sheet.open();
    },
    [sheet],
  );
  const closeSheet = useCallback(() => sheet.close(() => setSelected(null)), [sheet]);

  const sourceLabel = source.stripeLive
    ? "Stripe · live"
    : source.stripeEnabled
      ? "Stripe unreachable"
      : "Platform record";

  // One number for "not shown here" cannot be acted on. Each cause has a
  // different fix: an id this database has no record of is a data problem, no
  // id at all is a checkout that stamped no metadata, and the last two are
  // about organizations rather than links.
  const offCauses = [
    { n: summary.offNamedUnknown, text: "name an id no account here holds" },
    { n: summary.offNoLink, text: "name nobody" },
    { n: summary.offOtherOrg, text: "sit on orgs with no account listed" },
    { n: summary.offSecond, text: "are a second on a listed org" },
  ].filter((c) => c.n > 0);

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, u: AdminUserDTO) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openRow(u);
    }
  };

  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Platform</div>
          <h1 className={cx("page-title")}>Users &amp; subscriptions</h1>
        </div>
        <div className={cx("au-head-actions")}>
          <label className={cx("search")}>
            <Search className={cx("ic")} aria-hidden="true" />
            <input
              type="search"
              placeholder="Name, email, org or plan…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search users"
            />
            <kbd>
              {filtered.length}/{users.length}
            </kbd>
          </label>
        </div>
      </div>

      <div className={cx("au-kpis")} aria-label="Subscriptions">
        <div className={cx("au-kpi")}>
          <div className={cx("au-kpi-l")}>Active</div>
          <div className={cx("au-kpi-v", "accent")}>{summary.active}</div>
        </div>
        <div className={cx("au-kpi")}>
          <div className={cx("au-kpi-l")}>Trialing</div>
          <div className={cx("au-kpi-v")}>{summary.trialing}</div>
        </div>
        <div className={cx("au-kpi")}>
          <div className={cx("au-kpi-l")}>Past due</div>
          <div className={cx("au-kpi-v", summary.pastDue > 0 && "warn")}>{summary.pastDue}</div>
        </div>
        <div className={cx("au-kpi")}>
          <div className={cx("au-kpi-l")}>Lapsed</div>
          <div className={cx("au-kpi-v", summary.lapsed > 0 && "danger")}>{summary.lapsed}</div>
        </div>
        <div className={cx("au-kpi")}>
          <div className={cx("au-kpi-l")}>Free</div>
          <div className={cx("au-kpi-v")}>{summary.free}</div>
        </div>
        <div className={cx("au-ribbon")}>
          <span className={cx("au-ribbon-k")}>By plan</span>
          {summary.byPlan.length === 0 ? (
            <span className={cx("au-dash")}>—</span>
          ) : (
            summary.byPlan.map(([plan, n]) => (
              <span key={plan}>
                {planLabel(plan, plans)}
                <b>{n}</b>
              </span>
            ))
          )}
          <div className={cx("au-sync")}>
            {syncResult ? (
              <span className={cx("au-sync-r", syncResult.bad && "bad")} role="status">
                {syncResult.text}
              </span>
            ) : null}
            <button
              type="button"
              className={cx("btn", "btn-sm")}
              onClick={runSync}
              disabled={syncing}
            >
              <RefreshCw className={cx("ic")} aria-hidden="true" />
              {syncing ? "Syncing…" : "Sync from Stripe"}
            </button>
          </div>
        </div>
        {/* What the numerals above are counted over, and where they came from.
            One organization can hold several accounts, so the strip counts
            organizations while the table lists people. */}
        <div className={cx("au-scope")}>
          <span className={cx(source.stripeLive && "au-scope-live")}>{sourceLabel}</span>
          <span>
            {summary.orgs} organization{summary.orgs === 1 ? "" : "s"} on this page
          </span>
          {summary.offList > 0 ? (
            <span className={cx("au-scope-bad")}>
              {summary.offList} not shown here
              {offCauses.length === 1 ? ` · all ${offCauses[0].text}` : ""}
            </span>
          ) : null}
          {offCauses.length > 1
            ? offCauses.map((c) => (
                <span key={c.text}>
                  {c.n} {c.text}
                </span>
              ))
            : null}
          {source.truncated ? (
            <span className={cx("au-scope-bad")}>
              first {STRIPE_SCAN_CEILING_LABEL} only
            </span>
          ) : null}
        </div>
        {source.stripeEnabled && !source.stripeLive ? (
          <div className={cx("au-scope", "au-scope--err")}>
            <span>Stripe did not answer — showing the platform’s own record.</span>
            {source.stripeError ? <span>{source.stripeError}</span> : null}
          </div>
        ) : null}
      </div>

      <section className={cx("card", "tbl-card")}>
        {filtered.length === 0 ? (
          <div className={cx("tbl-empty")}>
            {users.length === 0 ? "No accounts." : "No matches."}
          </div>
        ) : (
          <div className={cx("tbl-wrap")}>
            <table className={cx("tbl", "tbl--stack")}>
              <colgroup>
                <col className={cx("au-c-user")} />
                <col className={cx("au-c-org")} />
                <col className={cx("au-c-roles")} />
                <col className={cx("au-c-plan")} />
                <col className={cx("au-c-admin")} />
                <col className={cx("au-c-created")} />
              </colgroup>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Organization</th>
                  <th>Roles</th>
                  <th>Plan</th>
                  <th>Admin</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className={cx("is-link")}
                    tabIndex={0}
                    role="button"
                    aria-label={`Edit ${u.name ?? u.email}`}
                    onClick={() => openRow(u)}
                    onKeyDown={(e) => onRowKey(e, u)}
                  >
                    <td>
                      <div className={cx("au-name")}>
                        <div className={cx("t-title", "au-name-t")} title={u.name ?? undefined}>
                          {u.name ?? "—"}
                        </div>
                        {u.id === meId ? <span className={cx("stamp", "stamp--bp")}>You</span> : null}
                      </div>
                      <div className={cx("t-sub")} title={u.email}>
                        {u.email}
                      </div>
                    </td>
                    <td data-l="Org">
                      {u.orgName ? (
                        <>
                          <div className={cx("t-clip")} title={u.orgName}>
                            {u.orgName}
                          </div>
                          <div className={cx("t-mono")}>
                            {u.orgMemberCount} member{u.orgMemberCount === 1 ? "" : "s"}
                          </div>
                        </>
                      ) : (
                        <span className={cx("au-dash")}>—</span>
                      )}
                    </td>
                    <td data-l="Roles">
                      {u.roles.length ? (
                        <div className={cx("t-chips")}>
                          {u.roles.map((r) => (
                            <span key={r} className={cx("st")}>
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className={cx("au-dash")}>—</span>
                      )}
                    </td>
                    <td data-l="Plan">
                      <div className={cx("au-plan")}>
                        <span className={cx("au-plan-name")}>
                          {!u.plan || u.plan === "NONE" ? (
                            <span className={cx("au-dash")}>—</span>
                          ) : (
                            planLabel(u.plan, plans)
                          )}
                        </span>
                        {u.planStatus !== "NONE" ? <StatusBadge status={u.planStatus} /> : null}
                        {/* Where the plan on this row came from, but only when
                            it is not the ordinary case. A grant and a
                            Stripe-only subscription are read differently. */}
                        {u.planSource === "stripe" && u.recordStatus === "NONE" ? (
                          <span className={cx("au-plan-src")}>Stripe only</span>
                        ) : u.planSource === "record" && u.provider === "MANUAL" ? (
                          <span className={cx("au-plan-src")}>Grant</span>
                        ) : null}
                      </div>
                    </td>
                    <td data-l="Admin">
                      {u.isPlatformAdmin ? <span className={cx("stamp")}>Admin</span> : <span className={cx("au-dash")}>—</span>}
                    </td>
                    <td data-l="Created" className={cx("t-mono")}>
                      {longDate(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Sheet
        handle={sheet}
        kicker={selected ? selected.email : "Account"}
        title={selected?.name || selected?.email || "Account"}
        onClose={closeSheet}
      >
        {selected ? (
          <UserForm key={selected.id} user={selected} plans={plans} meId={meId} onDone={closeSheet} />
        ) : null}
      </Sheet>
    </>
  );
}

// ── The edit form ──────────────────────────────────────────────────
// Keyed on the user id by the parent, so every field initialises from props
// and there is no effect that syncs state — the sheet stays mounted through
// its exit with the last user's values still in place.

function UserForm({
  user,
  plans,
  meId,
  onDone,
}: {
  user: AdminUserDTO;
  plans: PlanOption[];
  meId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const isMe = user.id === meId;

  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [admin, setAdmin] = useState(user.isPlatformAdmin);

  // The fields edit the STORED row, so they initialise from it — not from the
  // merged value in the table, which may be Stripe's and is not what save writes.
  const initialPlan =
    plans.find((p) => p.slug.toUpperCase() === user.recordPlan.toUpperCase())?.slug ?? "";
  // No record → no status. Pre-selecting ACTIVE would put a status on screen
  // that nothing in the database claims.
  const initialStatus = user.recordStatus === "NONE" ? "" : user.recordStatus;
  const [plan, setPlan] = useState(initialPlan);
  const [status, setStatus] = useState(initialStatus);
  const [periodEnd, setPeriodEnd] = useState(toDay(user.currentPeriodEnd));
  const [trialEnd, setTrialEnd] = useState(toDay(user.trialEndsAt));
  const [canceled, setCanceled] = useState(toDay(user.canceledAt));

  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const profileDirty = name.trim() !== (user.name ?? "") || email.trim().toLowerCase() !== user.email;
  const adminDirty = admin !== user.isPlatformAdmin;
  const subDirty =
    !!user.orgId &&
    (plan !== initialPlan ||
      status !== initialStatus ||
      periodEnd !== toDay(user.currentPeriodEnd) ||
      trialEnd !== toDay(user.trialEndsAt) ||
      canceled !== toDay(user.canceledAt));
  const dirty = profileDirty || adminDirty || subDirty;

  async function save() {
    if (!dirty || busy) return;
    setBusy("save");
    setErr(null);
    try {
      if (subDirty && !plan) throw new Error("Pick a plan before saving the subscription.");
      if (subDirty && !status) throw new Error("Pick a status before saving the subscription.");
      const subPayload = subDirty
        ? {
            organizationId: user.orgId as string,
            plan,
            status,
            currentPeriodEnd: fromDay(periodEnd, "Period end"),
            trialEndsAt: fromDay(trialEnd, "Trial end"),
            canceledAt: fromDay(canceled, "Canceled"),
          }
        : null;

      if (profileDirty) {
        await updateAdminUser({
          userId: user.id,
          email: email.trim().toLowerCase() !== user.email ? email.trim() : undefined,
          name: name.trim() !== (user.name ?? "") ? name.trim() || null : undefined,
        });
      }
      if (adminDirty) await setPlatformAdmin(user.id, admin);
      if (subPayload) await updateAdminSubscription(subPayload);

      toast.success("Saved");
      router.refresh();
      onDone();
    } catch (e) {
      setErr(errorMessage(e, "Couldn't save."));
    } finally {
      setBusy(null);
    }
  }

  const confirmMatches = confirm.trim().toLowerCase() === user.email.toLowerCase();

  async function remove() {
    if (!confirmMatches || isMe || busy) return;
    setBusy("delete");
    setErr(null);
    try {
      await deleteAdminUser(user.id);
      toast.success("Account deleted", user.email);
      router.refresh();
      onDone();
    } catch (e) {
      setErr(errorMessage(e, "Couldn't delete."));
    } finally {
      setBusy(null);
    }
  }

  const planOptions = plans.map((p) => ({ value: p.slug, label: p.name }));
  const stripeManaged = user.provider === "STRIPE" && !!user.externalSubId;
  // A live hand grant. It outranks anything Stripe holds, the limits engine
  // obeys it, and Sync from Stripe reports it instead of writing over it.
  const liveGrant = user.provider === "MANUAL" && LIVE_RECORD_STATUSES.has(user.recordStatus);
  // Stripe holds a subscription for this org saying something else. The fields
  // below write the stored row, which is the one the product reads — so this
  // gap is the operator's to settle, in one direction or the other.
  const stripeDisagrees =
    !!user.stripeStatus &&
    (user.stripePlan !== user.recordPlan || user.stripeStatus !== user.recordStatus);

  return (
    <>
      <SheetBody>
      {err ? <Note tone="danger">{err}</Note> : null}

      <div className={cx("sec")}>
        <div className={cx("sec-h")}>
          <span className={cx("sec-t")}>Account</span>
          <span className={cx("sec-m")}>Since {longDate(user.createdAt)}</span>
        </div>
        <div className={cx("row")}>
          <Field label="Name" htmlFor="au-name">
            <input id="au-name" className={cx("in")} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="au-email">
            <input
              id="au-email"
              className={cx("in")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Toggle
          on={admin}
          onChange={setAdmin}
          disabled={isMe}
          label="Platform admin"
          title={isMe ? "You can't remove your own flag" : "Not an org role"}
        />
      </div>

      <div className={cx("sec")}>
        <div className={cx("sec-h")}>
          <span className={cx("sec-t")}>Subscription</span>
          {user.orgId ? (
            <span className={cx("sec-m")}>
              {user.orgName} · {user.orgMemberCount} member{user.orgMemberCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {!user.orgId ? (
          <Note>No organization.</Note>
        ) : (
          <>
            <div className={cx("meta")}>
              <span>
                Provider <b>{user.provider ?? "—"}</b>
              </span>
              {user.externalSubId ? (
                <span title={user.externalSubId}>
                  Sub <b>{user.externalSubId}</b>
                </span>
              ) : user.stripeSubId ? (
                // The row names no subscription; Stripe still holds one for
                // this org, and the id is what the operator looks it up by.
                <span title={user.stripeSubId}>
                  Stripe holds <b>{user.stripeSubId}</b>
                </span>
              ) : null}
            </div>
            {stripeDisagrees ? (
              <Note>
                Stripe says <b>{user.stripePlan || "—"}</b> · <b>{user.stripeStatus}</b>; this row
                says <b>{user.recordPlan}</b> · <b>{user.recordStatus}</b>.{" "}
                {liveGrant
                  ? "The grant stands — Sync from Stripe reports it and writes nothing. End it (Canceled or Expired) to hand the row back to Stripe."
                  : "Sync from Stripe writes it."}
              </Note>
            ) : liveGrant ? (
              <Note tone="ok">Hand grant — outside MRR, and the sync leaves it alone.</Note>
            ) : null}
            {stripeManaged ? (
              <Note>
                Stripe-managed — saving detaches this row from the subscription and stamps{" "}
                <b>MANUAL</b>.
              </Note>
            ) : null}
            <div className={cx("row")}>
              <Field label="Plan" htmlFor="au-plan">
                <Select
                  id="au-plan"
                  value={plan}
                  onChange={setPlan}
                  options={planOptions}
                  placeholder={plans.length ? "— pick a plan —" : "No plans in the catalog"}
                  disabled={plans.length === 0}
                />
              </Field>
              <Field label="Status" htmlFor="au-status">
                <Select
                  id="au-status"
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                  placeholder="— pick a status —"
                />
              </Field>
            </div>
            <div className={cx("row", "row--3")}>
              <Field label="Period end" htmlFor="au-cpe">
                <input
                  id="au-cpe"
                  className={cx("in", "in--mono")}
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </Field>
              <Field label="Trial ends" htmlFor="au-trial">
                <input
                  id="au-trial"
                  className={cx("in", "in--mono")}
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  value={trialEnd}
                  onChange={(e) => setTrialEnd(e.target.value)}
                />
              </Field>
              <Field label="Canceled" htmlFor="au-canc">
                <input
                  id="au-canc"
                  className={cx("in", "in--mono")}
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  value={canceled}
                  onChange={(e) => setCanceled(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
      </div>

      <div className={cx("sec", "sec--danger")}>
        <div className={cx("sec-h")}>
          <span className={cx("sec-t")}>Delete account</span>
        </div>
        <div className={cx("au-del-row")}>
          <Field label="Confirm email" htmlFor="au-confirm">
            <input
              id="au-confirm"
              className={cx("in", "in--mono")}
              placeholder={user.email}
              value={confirm}
              disabled={isMe}
              autoComplete="off"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className={cx("btn", "btn-danger", "btn-field")}
            title={isMe ? "You can't delete your own account" : undefined}
            disabled={!confirmMatches || isMe || busy !== null}
            onClick={remove}
          >
            {busy === "delete" ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>

      </SheetBody>
      <SheetFoot>
        <button type="button" className={cx("btn", "btn-ghost")} onClick={onDone} disabled={busy !== null}>
          Cancel
        </button>
        <button
          type="button"
          className={cx("btn", "btn-primary")}
          onClick={save}
          disabled={!dirty || busy !== null}
        >
          {busy === "save" ? "Saving…" : "Save changes"}
        </button>
      </SheetFoot>
    </>
  );
}
