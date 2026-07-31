// Workers blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-workers-blueprint.html). Every string, duration, easing,
// stagger and formula is the donor's exact value. Adaptations are mechanical
// only:
// - queries are scoped to the mounted `.content` root instead of `document`;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor blocks that belong to the PERSISTENT chrome are omitted, because
//   components/v3/blueprint-shell/shell-behavior.ts already owns them: the
//   mobile nav drawer, FLUID SCALE, the sidebar entry cascade, the sliding
//   active-item indicator and the graph-paper parallax;
// - the reveal cascade reads `.content > *:not(.mdl)`. In the donor the two
//   dialogs are siblings of `.main`, i.e. OUTSIDE `.content`, so they were
//   never part of the donor's `blocks` list; the port renders them inside
//   `.content` (they are position:fixed, so layout is unaffected) and skips
//   them here to keep the donor's block set — and therefore its i*60ms
//   stagger indices — exactly as authored.

import {
  createWorkerInvite,
  removeWorker,
  updateWorker,
} from "@/actions/workers";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { leaveRow, staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { isPlanLimitError } from "@/lib/planLimits";
import {
  WORKER_ROLES,
  WORKERS_SEED,
  type WorkerEntry,
  type WorkerRoleValue,
} from "./workers-data";

export type WorkersContentOptions = {
  /** The org's real roster, read server-side. Omit to fall back to the donor
   *  fixture (the standalone mock routes have no session to read from). */
  entries?: WorkerEntry[];
};

/** Server actions reject with an Error whose message is written for the user
 *  ("That worker has already joined…", "Can't remove the last owner."). Surface
 *  that text; fall back to a generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  // A seat-cap refusal throws the stable "Plan limit reached" string, which on
  // its own tells a contractor nothing about what to do. Nothing in the
  // blueprint shell renders the upgrade dialog (see advanced-ai-behavior.ts for
  // the same call), so the way out is spelled out where they are looking.
  if (isPlanLimitError(err)) {
    return "Plan limit reached — your plan's worker seats are full. Upgrade under Settings → Billing to invite more.";
  }
  const msg = err instanceof Error ? err.message.trim() : "";
  // A Next.js server-action transport failure has no useful message.
  if (!msg || /^\s*$/.test(msg) || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Text interpolated into an innerHTML string. The donor could inline its
 *  fixture names raw; these are database rows a manager typed, so every
 *  worker-supplied value goes through here. */
const escapeText = escapeAttr;

export function initWorkersContent(
  content: HTMLElement,
  options: WorkersContentOptions = {},
): () => void {
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const root = content;
  const main = content.closest<HTMLElement>(".main");
  const disposers: Array<() => void> = [];
  const on = (
    target: EventTarget,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const asEl = (t: EventTarget | null): Element | null => (t instanceof Element ? t : null);

  // Donor `setTimeout` calls, tracked so an unmount mid-flash cannot fire into
  // a detached tree.
  const timers = new Set<number>();
  const after = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  disposers.push(() => {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  });

  // Dismiss Lead Center banners (smooth height + gap collapse) — inert on this
  // page (no banner in the markup), kept for donor parity with shared shells.
  $$(".banner-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = btn.closest<HTMLElement>(".banner");
      if (!b || b.classList.contains("closing")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        b.classList.add("hidden");
        return;
      }
      b.style.height = b.offsetHeight + "px";
      b.style.transitionDelay = "0ms";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          b.classList.add("closing");
          b.style.height = "0px";
        }),
      );
      b.addEventListener("transitionend", function te(e) {
        if (e.propertyName !== "height") return;
        b.classList.add("hidden");
        b.removeEventListener("transitionend", te);
      });
    });
  });

  // ================= WORKERS: DATA =================
  // The org's real roster when the page supplies one (src/app/dashboard/workers),
  // the donor fixture otherwise. Either way it is CLONED, because invite / edit /
  // remove mutate it in place: the server actions are the source of truth, and
  // this array mirrors them so the roster repaints the moment one returns
  // instead of waiting on a round trip through the router.
  const seed = options.entries ?? WORKERS_SEED;
  let workersData: WorkerEntry[] = seed.map((e) => ({
    ...e,
    specialties: e.specialties.slice(),
    jobs: e.jobs.map((j) => ({ ...j })),
  }));

  const wk = {
    filter: "all",
    query: "",
    selected: null as string | null,
    editing: null as string | null,
    inviteRole: "INSTALLER",
    pendingRemove: null as string | null,
    /** True while a server action is in flight — blocks a double submit. */
    saving: false,
  };

  function monogram(name: string) {
    const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    // Guard added for the empty case only (a name with no latin letters); the
    // donor throws there. Every donor-reachable render is byte-identical.
    if (p.length === 0) return "";
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function roleLabel(r: string) {
    const x = WORKER_ROLES.find(function (w) { return w.value === r; });
    return x ? x.label : r.charAt(0) + r.slice(1).toLowerCase();
  }
  function counts() {
    const all = workersData.length;
    const onJob = workersData.filter(function (e) { return e.jobs.length > 0; }).length;
    const available = workersData.filter(function (e) { return e.invite === "ACCEPTED" && e.jobs.length === 0; }).length;
    const active = workersData.reduce(function (a, e) { return a + e.jobs.length; }, 0);
    return { all: all, onJob: onJob, available: available, active: active };
  }
  function filtered() {
    const q = wk.query.trim().toLowerCase();
    return workersData.filter(function (e) {
      if (wk.filter === "on-job" && e.jobs.length === 0) return false;
      if (wk.filter === "available" && (e.invite !== "ACCEPTED" || e.jobs.length > 0)) return false;
      if (!q) return true;
      return e.name.toLowerCase().indexOf(q) !== -1 || (e.email || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  // ================= RENDER =================
  function renderCrumbs() {
    const c = counts();
    const host = $("#wkCrumbs");
    if (!host) return;
    host.innerHTML =
      '<span>Crew</span><i>/</i><span>Roster</span><i>/</i><span><b>' + c.all + '</b> on the books</span>' +
      (c.active > 0 ? '<i>/</i><span><b>' + c.active + '</b> active</span>' : '');
  }
  function renderTiles() {
    const c = counts();
    const tiles = [
      { key: 'all',       label: 'All crew',  value: c.all,       hint: 'on the books' },
      { key: 'on-job',    label: 'On a job',  value: c.onJob,     hint: c.active + ' active assignment' + (c.active === 1 ? '' : 's') },
      { key: 'available', label: 'Available', value: c.available, hint: 'no live work' },
    ];
    const host = $("#wkTiles");
    if (!host) return;
    const existing = Array.from(host.querySelectorAll<HTMLElement>(".wk-tile"));
    if (existing.length === tiles.length) {
      // A REPAINT, not an arrival. The three tiles never change identity — only
      // their number, their hint and which one is lit. Rebuilding the container
      // would destroy the button the user just pressed (taking its focus with
      // it) and replay the tile entrance on every keystroke in the search box.
      existing.forEach((btn, i) => {
        const t = tiles[i];
        btn.classList.toggle("on", wk.filter === t.key);
        const v = btn.querySelector(".wk-tile-v");
        if (v && v.textContent !== String(t.value)) v.textContent = String(t.value);
        const h = btn.querySelector(".wk-tile-h");
        if (h && h.textContent !== t.hint) h.textContent = t.hint;
      });
      return;
    }
    host.innerHTML = tiles.map(function (t) {
      return '<button class="wk-tile' + (wk.filter === t.key ? ' on' : '') + '" type="button" data-f="' + t.key + '">' +
        '<div class="kpi-lbl">' + t.label + '</div>' +
        '<div class="wk-tile-v">' + t.value + '</div>' +
        '<div class="wk-tile-h">' + t.hint + '</div></button>';
    }).join('');
  }
  /** The roster's "N on the books" / "N of M — clear" plate. Broken out so a
   *  single-row change can refresh the totals without touching the rows. */
  function renderCount() {
    const count = $("#wkCount");
    if (!count) return;
    const rows = filtered();
    const total = workersData.length;
    count.innerHTML = (wk.filter === 'all' && !wk.query.trim())
      ? '<span class="wk-static">' + total + ' on the books</span>'
      : '<button class="wk-clear" type="button" id="wkClear">' + rows.length + ' of ' + total +
        ' <svg class="ic"><use href="#i-undo"/></svg>clear</button>';
  }

  /** Folio is a row's position in the roster, so every row after a removed one
   *  renumbers. Patch the one span that changed rather than rebuilding rows. */
  function repaintFolios() {
    $$(".wk-row").forEach((row) => {
      const idx = workersData.findIndex((x) => x.id === row.dataset.id);
      const folio = row.querySelector(".wk-folio");
      if (idx >= 0 && folio) folio.textContent = String(idx + 1).padStart(2, '0');
    });
  }

  /** Swap the empty state in or out from the CURRENT row count. */
  function renderEmptyState() {
    const list = $("#wkList");
    const empty = $("#wkEmpty");
    if (!list || !empty) return;
    const shown = list.querySelectorAll(".wk-row").length;
    const total = workersData.length;
    empty.classList.toggle('is-hidden', shown !== 0);
    list.classList.toggle('is-hidden', shown === 0);
    if (shown === 0) {
      empty.innerHTML = total === 0
        ? '<div class="kpi-lbl">Empty roster</div><h2>No workers on the books yet.</h2>' +
          '<p>Invite your first crew member. They get a token portal: no password, no account juggling. You stay in control of the link.</p>' +
          '<button class="btn btn-primary btn--sm" type="button" data-act="invite"><svg class="ic"><use href="#i-plus"/></svg>Invite the first worker</button>'
        : '<div class="kpi-lbl">No match</div><h2>No workers match this filter.</h2>' +
          '<p>Try a different filter or clear the search.</p>';
    }
  }

  /** One roster row. Also used on its own to patch a single edited worker. */
  function rowHtml(e: WorkerEntry): string {
      const load = e.jobs.length > 0
        ? '<div class="wk-load"><b>' + e.jobs.length + '</b> <span>job' + (e.jobs.length === 1 ? '' : 's') + '</span></div>'
        : '<div class="wk-load quiet">' + (e.invite === 'ACCEPTED' ? 'available' : e.invite === 'DECLINED' ? 'declined' : 'invited') + '</div>';
      return '<li><button class="wk-row' + (wk.selected === e.id ? ' on' : '') + '" type="button" data-id="' + escapeAttr(e.id) + '">' +
        '<span class="wk-folio">' + String(workersData.indexOf(e) + 1).padStart(2, '0') + '</span>' +
        '<span class="wk-mono">' + escapeText(monogram(e.name)) + '</span>' +
        '<span class="wk-main">' +
          '<span class="wk-name">' + escapeText(e.name) +
            (e.invite !== 'ACCEPTED' ? '<span class="pstatus inv--' + e.invite.toLowerCase() + '">' + e.invite.toLowerCase() + '</span>' : '') +
          '</span>' +
          '<span class="wk-contact" style="display:block">' +
            (e.email ? escapeText(e.email) : '<i>no email</i>') +
            (e.phone ? ' · <b>' + escapeText(e.phone) + '</b>' : '') +
          '</span>' +
        '</span>' +
        '<span class="wk-role"><span class="pstatus role-pill">' + escapeText(roleLabel(e.role).toLowerCase()) + '</span></span>' +
        load +
        '<svg class="ic wk-go"><use href="#i-chev"/></svg>' +
      '</button></li>';
  }

  /** Repaint the roster.
   *
   *  @param arriving true only when the list is genuinely ARRIVING — first
   *    paint, or a filter the user just switched to. Typing in the search box
   *    and selecting a row are NOT arrivals: they repaint silently. (The rule,
   *    and the bug it fixes, are documented in blueprint-shell/list-motion.ts.)
   */
  function renderList(arriving = false) {
    const list = $("#wkList");
    if (!list) return;
    renderCount();
    list.innerHTML = filtered().map(rowHtml).join('');
    if (arriving) staggerIn(Array.from(list.querySelectorAll<HTMLElement>(".wk-row")));
    renderEmptyState();
  }
  function renderInspector() {
    const insp = $("#wkInsp");
    const space = $("#wkSpace");
    if (!insp || !space) return;
    const e = workersData.find(function (x) { return x.id === wk.selected; });
    if (!e) { insp.classList.add('is-hidden'); insp.innerHTML = ''; space.classList.remove('with-insp'); return; }
    insp.classList.remove('is-hidden');
    space.classList.add('with-insp');
    const link = portalLink(e.token);
    insp.innerHTML =
      '<div class="insp-head">' +
        '<span class="wk-mono">' + escapeText(monogram(e.name)) + '</span>' +
        '<span><span class="insp-name" style="display:block">' + escapeText(e.name) + '</span>' +
        '<span class="insp-folio" style="display:block">Folio ' + String(workersData.indexOf(e) + 1).padStart(2, '0') + '</span></span>' +
        '<button class="insp-x" type="button" data-act="close-insp" aria-label="Close inspector">×</button>' +
      '</div>' +
      '<div class="insp-body">' +
        '<div class="fld-row"><div class="kpi-lbl">Email</div>' +
          (e.email ? '<div class="fld-v">' + escapeText(e.email) + '</div>' : '<div class="fld-v none">no email</div>') + '</div>' +
        '<div class="fld-row"><div class="kpi-lbl">Phone</div>' +
          (e.phone ? '<div class="fld-v mono">' + escapeText(e.phone) + '</div>' : '<div class="fld-v none">no phone</div>') + '</div>' +
        '<div class="fld-row"><div class="kpi-lbl">Role</div><div class="fld-v">' + escapeText(roleLabel(e.role)) + '</div></div>' +
        '<div class="fld-row"><div class="kpi-lbl">Specialties</div>' +
          (e.specialties.length
            ? '<div class="fld-v">' + escapeText(e.specialties.join(' · ')) + '</div>'
            : '<div class="fld-v none">none set</div>') + '</div>' +
        '<div class="fld-row"><div class="kpi-lbl">Hourly rate</div>' +
          (e.rate ? '<div class="fld-v mono">$' + e.rate + '/hr</div>' : '<div class="fld-v none">not set</div>') + '</div>' +
        '<div class="fld-row"><div class="kpi-lbl">Joined</div><div class="fld-v mono">' + escapeText(e.joined) + '</div></div>' +
        '<div class="fld-row"><div class="kpi-lbl">Active jobs (' + e.jobs.length + ')</div>' +
          (e.jobs.length
            // The donor's `href="#"` went nowhere. These are real job ids, and
            // /dashboard/jobs/<id> is the live job page the classic roster
            // linked to — same destination, same one-click reach from the crew
            // sheet to the work.
            ? '<ul class="insp-jobs">' + e.jobs.map(function (j) {
                return '<li><a href="/dashboard/jobs/' + encodeURIComponent(j.id) + '">' +
                  escapeText(j.title) + '<svg class="ic"><use href="#i-arrow"/></svg></a></li>';
              }).join('') + '</ul>'
            : '<div class="fld-v none">no live work</div>') + '</div>' +
        '<div class="link-box">' +
          '<div class="kpi-lbl">Worker dashboard link</div>' +
          '<div class="link-row"><span class="link-url">' + escapeText(link) + '</span>' +
            '<button class="link-btn" type="button" data-act="copy-link" data-link="' + escapeAttr(link) + '" aria-label="Copy link"><svg class="ic"><use href="#i-dup"/></svg></button>' +
            // Was a `data-flash-icon` button: it lit a checkmark and opened
            // nothing. The portal is a real route (/w/<token>) — an anchor to it
            // in a new tab, as on the classic roster, so the manager keeps the
            // roster they were reading.
            '<a class="link-btn" href="/w/' + escapeAttr(e.token) + '" target="_blank" rel="noopener noreferrer" aria-label="Open portal in a new tab" title="Open portal in a new tab"><svg class="ic"><use href="#i-ext"/></svg></a>' +
          '</div>' +
        '</div>' +
        // The classic roster's "Open full profile" — the detail page at
        // /dashboard/workers/<id> still exists and still carries the token
        // rotation ("Revoke & rotate") this sheet has no room for.
        '<a class="insp-profile" href="/dashboard/workers/' + encodeURIComponent(e.id) + '">Open full profile' +
          '<svg class="ic"><use href="#i-arrow"/></svg></a>' +
        '<div class="insp-act">' +
          '<button class="btn btn-ghost btn--sm" type="button" data-act="edit"><svg class="ic"><use href="#i-pen"/></svg>Edit</button>' +
          '<button class="btn btn-ghost btn--sm btn--danger" type="button" data-act="ask-remove"><svg class="ic"><use href="#i-trash"/></svg>Remove</button>' +
        '</div>' +
      '</div>';
  }
  function renderWorkers(arriving = false) { renderCrumbs(); renderTiles(); renderList(arriving); renderInspector(); }

  /** Selecting a row changes ONE class on ONE node. Re-rendering the list for
   *  it would replace the button under the user's finger mid-click. */
  function paintSelection() {
    $$(".wk-row").forEach((row) => row.classList.toggle("on", row.dataset.id === wk.selected));
  }

  // ================= INVITE FORM =================
  /** Portal links are absolute in the real product; the roster only ever shows
   *  the shareable form, and this is the one place that decides it. */
  function portalLink(token: string) {
    const host = typeof window === "undefined" ? "jobflex.app" : window.location.host;
    return host + "/w/" + token;
  }

  function openInvite(entry: WorkerEntry | null) {
    wk.editing = entry ? entry.id : null;
    wk.inviteRole = entry ? entry.role : 'INSTALLER';
    wk.saving = false;
    const title = $("#inviteTitle");
    const body = $("#inviteBody");
    const mdl = $("#inviteMdl");
    if (!title || !body || !mdl) return;
    title.textContent = entry ? 'Edit worker' : 'Invite worker';
    const link = entry ? portalLink(entry.token) : '';
    // Email is the worker's login identity: required to send an invite, and
    // locked once they have one (updateWorker deliberately cannot change it).
    body.innerHTML =
      '<div class="mf"><label class="mf-lbl">Full name</label><input class="mf-in" data-i="name" placeholder="Casey Stone" value="' + escapeAttr(entry ? entry.name : '') + '"></div>' +
      '<div class="mf"><label class="mf-lbl">Email' + (entry ? ' (locked)' : '') + '</label><input class="mf-in" type="email" data-i="email" placeholder="casey@example.com" value="' + escapeAttr(entry && entry.email ? entry.email : '') + '"' + (entry ? ' disabled' : '') + '></div>' +
      '<div class="mf mf-row">' +
        '<div><label class="mf-lbl">Phone (optional)</label><input class="mf-in" data-i="phone" placeholder="(425) 555-0199" value="' + escapeAttr(entry && entry.phone ? entry.phone : '') + '"></div>' +
        '<div><label class="mf-lbl">Hourly rate</label><input class="mf-in" type="number" min="0" data-i="rate" placeholder="38" value="' + escapeAttr(entry && entry.rate ? String(entry.rate) : '') + '"></div>' +
      '</div>' +
      '<div class="mf"><label class="mf-lbl">Specialties</label><input class="mf-in" data-i="spec" placeholder="Roofing, Fencing" value="' + escapeAttr(entry ? entry.specialties.join(', ') : '') + '"></div>' +
      '<div class="mf"><label class="mf-lbl">Role</label><div class="mf-roles" id="mfRoles">' +
        WORKER_ROLES.map(function (r) {
          return '<button class="mf-role' + (wk.inviteRole === r.value ? ' on' : '') + '" type="button" data-role="' + r.value + '">' + r.label + '</button>';
        }).join('') +
      '</div></div>' +
      (entry ? '<div class="mf link-box"><div class="kpi-lbl">Worker dashboard link</div>' +
        '<div class="link-row"><span class="link-url">' + escapeAttr(link) + '</span>' +
        '<button class="link-btn" type="button" data-act="copy-link" data-link="' + escapeAttr(link) + '" aria-label="Copy"><svg class="ic"><use href="#i-dup"/></svg></button></div></div>' : '') +
      '<div class="mf-note" id="inviteNote">' + (entry
        ? 'Changes save straight to the roster.'
        : 'We email them an invite link. They accept, set a password, and see only their own jobs.') + '</div>' +
      '<div class="mf-err is-hidden" id="inviteErr" role="alert"></div>' +
      '<div class="mdl-foot" style="margin:16px -17px -16px">' +
        '<button class="btn btn-ghost btn--sm" type="button" data-mdl="invite">Cancel</button>' +
        '<button class="btn btn-primary btn--sm" type="button" data-act="save-invite"><svg class="ic"><use href="#i-check"/></svg>' +
          '<span data-save-lbl>' + (entry ? 'Save changes' : 'Send invite') + '</span></button>' +
      '</div>';
    openMdl(mdl);
    staggerFields(body);
    // Land on the first editable field rather than on the dialog frame.
    requestAnimationFrame(() => $<HTMLInputElement>('[data-i="name"]')?.focus());
  }

  /** The form is rebuilt on every open, so its blocks settle in behind the box
   *  the same way list rows do — 260ms, 34ms apart, on the system's ease-out. */
  function staggerFields(body: HTMLElement) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    Array.from(body.children).forEach((node, i) => {
      const el = node as HTMLElement;
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      el.style.transition =
        "opacity 260ms cubic-bezier(0.22,0.61,0.36,1) " + (90 + i * 34) + "ms," +
        "transform 260ms cubic-bezier(0.22,0.61,0.36,1) " + (90 + i * 34) + "ms";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.opacity = "1";
          el.style.transform = "none";
        }),
      );
      // Inline `transform: none` outranks every stylesheet :hover rule, so the
      // styles come back off once the cascade lands (same lesson as the rows).
      el.addEventListener("transitionend", function te(e) {
        if (e.propertyName !== "transform") return;
        el.style.opacity = "";
        el.style.transform = "";
        el.style.transition = "";
        el.removeEventListener("transitionend", te);
      });
    });
  }

  function inviteError(msg: string | null) {
    const box = $("#inviteErr");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-hidden", !msg);
  }

  /** Button label + disabled state while an action is in flight. */
  function setSaving(scope: HTMLElement | null, on: boolean, busyLabel: string, idleLabel: string) {
    wk.saving = on;
    const btn = scope?.querySelector<HTMLButtonElement>('[data-act="save-invite"], #removeOk');
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle("is-busy", on);
    const lbl = btn.querySelector<HTMLElement>("[data-save-lbl]");
    if (lbl) lbl.textContent = on ? busyLabel : idleLabel;
  }

  function closeWkMdl(which: string) {
    const mdl = $(which === 'invite' ? "#inviteMdl" : "#removeMdl");
    if (mdl) closeMdl(mdl, after);
  }

  // ================= EVENTS =================
  const tiles = $("#wkTiles");
  if (tiles) {
    on(tiles, "click", (ev) => {
      const t = asEl(ev.target)?.closest<HTMLElement>('.wk-tile');
      if (!t) return;
      const next = t.dataset.f || '';
      if (next === wk.filter) return;
      wk.filter = next;
      // A filter switch IS an arrival: a different set of people is being put
      // in front of the manager, so the rows come in.
      renderWorkers(true);
    });
  }
  const search = $<HTMLInputElement>("#wkSearch");
  if (search) {
    on(search, "input", () => {
      wk.query = search.value;
      // Silent repaint. Re-staggering once per keystroke is the exact bug
      // list-motion.ts exists to stop.
      renderList();
    });
  }
  const inviteBtn = $("#inviteBtn");
  if (inviteBtn) on(inviteBtn, "click", () => { openInvite(null); });

  on(document, "click", (ev) => {
    const target = asEl(ev.target);
    if (!target) return;

    const clear = target.closest('#wkClear');
    if (clear) {
      wk.filter = 'all'; wk.query = '';
      const input = $<HTMLInputElement>("#wkSearch");
      if (input) input.value = '';
      renderWorkers(true);
      return;
    }
    const row = target.closest<HTMLElement>('.wk-row');
    if (row) {
      wk.selected = wk.selected === row.dataset.id ? null : row.dataset.id || null;
      paintSelection(); renderInspector();
      return;
    }
    const mdlClose = target.closest<HTMLElement>('[data-mdl]');
    // A dismiss must never interrupt a write that is already on the wire.
    if (mdlClose) { if (!wk.saving) closeWkMdl(mdlClose.dataset.mdl || ''); return; }
    const roleBtn = target.closest<HTMLElement>('[data-role]');
    if (roleBtn) {
      wk.inviteRole = roleBtn.dataset.role || '';
      $$("#mfRoles .mf-role").forEach(function (b) { b.classList.toggle('on', b === roleBtn); });
      return;
    }
    // (The donor's `[data-flash-icon]` branch is gone with its only user: the
    // inspector's "open portal" control is now a real anchor to /w/<token>.)

    const act = target.closest<HTMLElement>('[data-act]');
    if (!act) return;
    const kind = act.dataset.act;

    if (kind === 'close-insp') { wk.selected = null; paintSelection(); renderInspector(); return; }
    if (kind === 'invite') { openInvite(null); return; }
    if (kind === 'edit') {
      const entry = workersData.find(function (x) { return x.id === wk.selected; });
      if (entry) openInvite(entry);
      return;
    }
    if (kind === 'copy-link') {
      // The donor only flashed a checkmark. The link is the thing a manager
      // actually hands to a worker, so put it on the clipboard for real and
      // keep the flash as the confirmation of a write that happened.
      const link = act.dataset.link || '';
      const html = act.innerHTML;
      const flashOk = () => {
        act.classList.add('done');
        act.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
        after(1400, function () { act.classList.remove('done'); act.innerHTML = html; });
      };
      if (link && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(
          link.startsWith("http") ? link : window.location.protocol + "//" + link,
        ).then(flashOk, flashOk);
      } else {
        flashOk();
      }
      return;
    }
    if (kind === 'ask-remove') {
      const entry = workersData.find(function (x) { return x.id === wk.selected; });
      if (!entry) return;
      wk.pendingRemove = entry.id;
      wk.saving = false;
      const title = $("#removeTitle");
      const mdl = $("#removeMdl");
      const err = $("#removeErr");
      if (title) title.textContent = 'Remove ' + entry.name + '?';
      if (err) { err.textContent = ''; err.classList.add('is-hidden'); }
      setSaving($("#removeMdl"), false, '', 'Remove worker');
      if (mdl) openMdl(mdl);
      return;
    }
    if (kind === 'save-invite') {
      if (wk.saving) return;
      void submitInvite();
      return;
    }
  });

  // ================= WRITES (real server actions) =================
  // These are the live worker actions from src/actions/workers.ts — the same
  // ones the classic roster used. They are org-scoped and manager-gated on the
  // server, they send the actual invite email, and they revalidate
  // /dashboard/workers. `workersData` is patched from the result so the roster
  // repaints immediately; a reload reads the same rows back from the database.

  async function submitInvite() {
    const val = function (f: string) {
      const input = $<HTMLInputElement>('[data-i="' + f + '"]');
      return input ? input.value.trim() : '';
    };
    const name = val('name');
    if (!name) {
      inviteError('Enter the worker’s full name.');
      $<HTMLInputElement>('[data-i="name"]')?.focus();
      return;
    }
    const email = val('email');
    // createWorkerInvite needs a real address: the invite link is emailed, and
    // the address doubles as the worker's login identity.
    if (!wk.editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      inviteError('A valid email is required — that’s where the invite link goes.');
      $<HTMLInputElement>('[data-i="email"]')?.focus();
      return;
    }
    inviteError(null);

    const rateRaw = val('rate');
    const rate = rateRaw ? Number(rateRaw) : null;
    if (rate !== null && !isFinite(rate)) {
      inviteError('Hourly rate must be a number.');
      return;
    }
    const specialties = val('spec')
      ? val('spec').split(',').map(function (x) { return x.trim(); }).filter(Boolean)
      : [];
    const role = (wk.inviteRole || 'INSTALLER') as WorkerRoleValue;
    const editingId = wk.editing;

    /** Set to the new profile's id when an invite creates a row. */
    let arrivedId: string | null = null;

    setSaving($("#inviteMdl"), true, editingId ? 'Saving…' : 'Sending…', '');
    try {
      if (editingId) {
        await updateWorker({
          id: editingId,
          name,
          role,
          phone: val('phone') || null,
          specialties,
          hourlyRate: rate,
        });
        const entry = workersData.find(function (x) { return x.id === editingId; });
        if (entry) {
          entry.name = name;
          entry.phone = val('phone') || null;
          entry.rate = rate;
          entry.specialties = specialties;
          entry.role = role;
        }
      } else {
        const created = await createWorkerInvite({
          name,
          email,
          role,
          phone: val('phone') || null,
          specialties,
          hourlyRate: rate,
        });
        // The action returns the real profile id and magic-link token, so the
        // row it appends is the database row — including a working portal link.
        workersData.push({
          id: created.id,
          name,
          email,
          phone: val('phone') || null,
          specialties,
          rate,
          token: created.token,
          invite: 'PENDING',
          role,
          joined: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          jobs: [],
        });
        arrivedId = created.id;
      }
      setSaving($("#inviteMdl"), false, '', editingId ? 'Save changes' : 'Send invite');
      closeWkMdl('invite');

      renderCrumbs();
      renderTiles();
      renderCount();
      if (editingId) {
        // ONE worker changed. Swap that one row; the rest of the roster is
        // untouched, so it must not blink or re-cascade behind the dialog.
        const entry = workersData.find(function (x) { return x.id === editingId; });
        const row = root.querySelector<HTMLElement>('.wk-row[data-id="' + CSS.escape(editingId) + '"]');
        // …unless the rename dropped them out of the active search, in which
        // case the row has to go and a full repaint is the honest answer.
        const stillShown = !!entry && filtered().indexOf(entry) !== -1;
        if (entry && stillShown && row?.parentElement) row.parentElement.outerHTML = rowHtml(entry);
        else renderList();
      } else {
        // A person genuinely joined the roster. Repaint the list silently, then
        // play the entrance on the ONE row that arrived.
        renderList();
        const fresh = arrivedId
          ? root.querySelector<HTMLElement>('.wk-row[data-id="' + CSS.escape(arrivedId) + '"]')
          : null;
        if (fresh) staggerIn([fresh]);
      }
      renderEmptyState();
      renderInspector();
    } catch (err) {
      setSaving($("#inviteMdl"), false, '', editingId ? 'Save changes' : 'Send invite');
      inviteError(actionError(err));
    }
  }

  const removeOk = $("#removeOk");
  if (removeOk) {
    on(removeOk, "click", () => {
      if (wk.saving) return;
      void confirmRemove();
    });
  }

  async function confirmRemove() {
    const id = wk.pendingRemove;
    if (!id) return;
    const errBox = $("#removeErr");
    if (errBox) { errBox.textContent = ''; errBox.classList.add('is-hidden'); }
    setSaving($("#removeMdl"), true, 'Removing…', '');
    try {
      await removeWorker(id);
      wk.pendingRemove = null;
      setSaving($("#removeMdl"), false, '', 'Remove worker');
      closeWkMdl('remove');

      // One row leaves and the rest close the gap. Re-rendering the list here
      // would make the whole roster blink and hide the one thing that happened.
      const row = root.querySelector<HTMLElement>('.wk-row[data-id="' + CSS.escape(id) + '"]');
      const li = row?.parentElement;
      const commit = () => {
        workersData = workersData.filter(function (x) { return x.id !== id; });
        if (wk.selected === id) wk.selected = null;
        renderCrumbs();
        renderTiles();
        renderCount();
        repaintFolios();
        renderEmptyState();
        renderInspector();
      };
      if (li) leaveRow(li, commit, after);
      else commit();
    } catch (err) {
      setSaving($("#removeMdl"), false, '', 'Remove worker');
      // The action refuses on the last owner — say so instead of silently
      // closing a dialog that did nothing.
      if (errBox) {
        errBox.textContent = actionError(err);
        errBox.classList.remove('is-hidden');
      }
    }
  }

  // ================= INITIALIZATION =================
  renderWorkers();

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: slow scroll — the full 420ms animation;
    // fast — a short one (down to 200ms): it never lags but stays visible.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost)
      on(
        scrollHost,
        "scroll",
        () => {
          const now = performance.now();
          scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
          velLastY = scrollHost.scrollTop;
          velLastT = now;
        },
        { passive: true },
      );
    const blocks = $$(".content > *:not(.mdl)");
    blocks.forEach((el, i) => {
      el.classList.add('rv');
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = '1';
      el.style.transitionDelay = initial ? (i * 60) + 'ms' : '200ms';
    });
    const cells = $$(".kpi");
    cells.forEach((el, i) => {
      el.classList.add('rv-cell');
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = '1';
      el.style.transitionDelay = initial ? (160 + (i % 8) * 45) + 'ms' : '200ms';
    });
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          const target = en.target as HTMLElement;
          if (target.dataset.rvScroll) {
            // element below the fold: duration from the current scroll speed
            const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
            target.style.transitionDuration = dur + 'ms';
          }
          target.classList.add('rv-in');
          io.unobserve(target);
          target.addEventListener("transitionend", function te() {
            target.style.transitionDelay = '';
            target.style.transitionDuration = '';
            target.removeEventListener("transitionend", te);
          });
        });
      },
      { threshold: 0, rootMargin: '0px 0px 60px 0px' },
    );
    blocks.concat(cells).forEach((el) => io.observe(el));
    disposers.push(() => io.disconnect());

    // (Sidebar cascade lives in the shell — it plays once, on first load.)

    // Row + tile stagger — FIRST PAINT ONLY.
    //
    // The donor drove this from a `MutationObserver({childList:true})` on both
    // containers, which fires on every render: a keystroke in the search box, a
    // row selection or a removal each wiped the roster to opacity 0 and crawled
    // it back. That is the exact failure blueprint-shell/list-motion.ts was
    // written to end, so the observer is gone and the callers that know a list
    // is genuinely ARRIVING (filter switch, clear, a new invite) play it
    // themselves via `staggerIn`.
    ['wkList', 'wkTiles'].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      staggerIn(Array.from(list.querySelectorAll<HTMLElement>('.wk-row, .wk-tile')));
    });

    // Numeral count-up — Overview's `.kpi-val`; here the crew tiles' values,
    // which are this page's stat strip. The donor rebuilt the text from digits
    // alone, safe only for its own plain "$12,400"/"18": it drops any trailing
    // unit and would wipe an inline icon. So keep whatever frames the number,
    // skip decimals (digits-only mangles them), and skip nodes that hold
    // elements rather than bare text.
    $$('.wk-tile-v').forEach((el) => {
      if (el.children.length) return;
      const m = (el.textContent || '').trim().match(/^([^\d]*)(\d[\d,]*)([^\d]*)$/);
      if (!m) return;
      const [, prefix, digits, suffix] = m;
      const target = parseInt(digits.replace(/,/g, ''), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = prefix + Math.round(target * e).toLocaleString('en-US') + suffix;
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects
    function pressify(sel: string, cls: string) {
      $$(sel).forEach((el) => {
        el.addEventListener("click", () => {
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        });
        el.addEventListener("animationend", () => el.classList.remove(cls));
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
    pressify('.btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open', 'pressed');
    pressify('.week-strip .day', 'day-pressed');

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
  };
}
