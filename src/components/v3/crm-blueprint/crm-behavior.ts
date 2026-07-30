// CRM blueprint — runtime behaviors, ported verbatim from the donor file's
// <script> (jobflex-crm-blueprint_1.html). Every duration, easing, stagger,
// page size, formula and markup string is the donor's exact value.
//
// Adaptations are mechanical only:
// - queries are scoped to the mounted `.content` root;
// - document/window listeners, timers and observers are tracked for unmount
//   cleanup;
// - the donor blocks that belong to the persistent chrome are NOT ported here:
//   the mobile nav drawer, FLUID SCALE (+ the `eff-*` breakpoint classes), the
//   sidebar entry cascade, the sliding sidebar indicator and the graph-paper
//   parallax all live in components/v3/blueprint-shell/shell-behavior.ts;
// - `pressify` keeps the donor's selector minus the shell-owned controls
//   (.icon-btn, .sb-foot-ic, .sb-foot-acc), which the shell already presses.
//
// Like the donor, list markup is built with innerHTML from the local demo data
// in crm-data.ts. Rule names typed into the workflow form are interpolated the
// same way the donor interpolates them (no escaping) — kept for parity; the
// data never leaves the browser.

import {
  CRM_LEADS,
  CONVERSATIONS_COUNT,
  ACTIVITY_FEED,
  CUSTOMERS_DATA,
  STATUS_ORDER,
  STATUS_CLS,
  TRIGGERS,
  TEMPLATES,
  RULE_SEQ_START,
  RULES_SEED,
  QUEUE_SEED,
  Q_PAGE,
  type FollowUpRule,
  type QueueItem,
} from "./crm-data";

export function initCrmContent(content: HTMLElement): () => void {
  // Scoped to `.content`, which the shared shell owns and re-fills on every
  // navigation. `.main` lives in the shell, above this element.
  const root = content;
  const main = content.closest<HTMLElement>(".main");

  const disposers: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const on = (
    target: EventTarget,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // Module isolation: a failure in one block must not disable the rest.
  function safe(name: string, fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error("[JobFlex] module failed: " + name, err);
    }
  }

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

  // ================= CRM: STATE =================
  // Runtime mutations (rule add/edit/delete, queue done/send) — clone the seeds
  // per mount so a remount starts from the donor's state.
  const rulesData: FollowUpRule[] = RULES_SEED.map((r) => ({ ...r }));
  let queueData: QueueItem[] = QUEUE_SEED.map((q) => ({ ...q }));
  let ruleSeq = RULE_SEQ_START;

  const crm = {
    tab: "overview",
    cbFilter: [] as string[],
    qTab: "ALL",
    qPage: 1,
    editing: null as string | null,
    creating: false,
  };

  function money(n: number) {
    return "$" + n.toLocaleString("en-US");
  }
  function titleCase(s: string) {
    return s.charAt(0) + s.slice(1).toLowerCase();
  }
  function humanDelay(min: number) {
    if (min < 60) return min + "m";
    if (min < 60 * 24) return Math.round(min / 60) + "h";
    return Math.round(min / 60 / 24) + "d";
  }
  function dueNow() {
    return queueData.filter(function (q) {
      return q.overdue;
    });
  }
  function scheduled() {
    return queueData.filter(function (q) {
      return !q.overdue;
    });
  }

  // ================= OVERVIEW =================
  function renderStats() {
    const won = CRM_LEADS.filter(function (l) {
      return l.status === "WON";
    }).length;
    const lost = CRM_LEADS.filter(function (l) {
      return l.status === "LOST";
    }).length;
    const active = CRM_LEADS.filter(function (l) {
      return ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED"].indexOf(l.status) !== -1;
    }).length;
    const rate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
    const due = dueNow().length;
    const cards: Array<{
      lbl: string;
      val: string;
      delta?: { txt: string; dir: string } | null;
    }> = [
      {
        lbl: "Conversion rate",
        val: rate.toFixed(1) + "%",
        delta:
          won + lost > 0
            ? { txt: won + " won · " + lost + " lost", dir: rate >= 50 ? "up" : "down" }
            : null,
      },
      { lbl: "Active leads", val: String(active) },
      { lbl: "Follow-ups due", val: String(due) },
      { lbl: "Shared inbox", val: String(CONVERSATIONS_COUNT) },
    ];
    const grid = $("#statGrid");
    if (!grid) return;
    grid.innerHTML = cards
      .map(function (c) {
        return (
          '<div class="stat"><div class="kpi-lbl">' +
          c.lbl +
          "</div>" +
          '<div class="stat-val">' +
          c.val +
          "</div>" +
          (c.delta
            ? '<div class="stat-delta ' +
              c.delta.dir +
              '">' +
              (c.delta.dir === "up" ? "▲" : "▼") +
              " " +
              c.delta.txt +
              "</div>"
            : "") +
          "</div>"
        );
      })
      .join("");
  }

  function renderFresh() {
    const rows = CRM_LEADS.filter(function (l) {
      return ["NEW", "ROUTED", "CLAIMED"].indexOf(l.status) !== -1;
    }).slice(0, 5);
    const list = $("#freshList");
    if (!list) return;
    list.innerHTML =
      rows
        .map(function (l) {
          return (
            '<li><div style="min-width:0"><div class="fresh-name">' +
            l.name +
            "</div>" +
            '<div class="fresh-sub">' +
            l.project +
            (l.assignee ? " · " + l.assignee : "") +
            "</div></div>" +
            '<div class="fresh-right"><span class="pstatus pstatus--sent">' +
            l.status.toLowerCase() +
            "</span>" +
            '<span class="fresh-age">' +
            l.age +
            "</span></div></li>"
          );
        })
        .join("") || '<li><span class="fresh-sub">No new leads.</span></li>';
  }

  function renderActions() {
    const due = dueNow().length;
    const active = CRM_LEADS.filter(function (l) {
      return ["NEW", "ROUTED", "CLAIMED", "CONTACTED", "QUOTED"].indexOf(l.status) !== -1;
    }).length;
    const rows: Array<{
      show: boolean;
      tone: string;
      ic: string;
      t: string;
      h: string;
      go: string | null;
    }> = [
      {
        show: due > 0,
        tone: "danger",
        ic: "i-cal",
        t: due + " follow-up" + (due === 1 ? "" : "s") + " overdue",
        h: "Run or mark done in the queue",
        go: "queue",
      },
      {
        show: active > 0,
        tone: "accent",
        ic: "i-target",
        t: active + " lead" + (active === 1 ? "" : "s") + " still in motion",
        h: "Push them forward in the kanban",
        go: null,
      },
      {
        show: CONVERSATIONS_COUNT > 0,
        tone: "",
        ic: "i-msg",
        t: CONVERSATIONS_COUNT + " conversation" + (CONVERSATIONS_COUNT === 1 ? "" : "s"),
        h: "Open the shared inbox",
        go: null,
      },
      {
        show: true,
        tone: "",
        ic: "i-chart",
        t: "Quote → close optimization",
        h: "Tighten your follow-up workflow rules",
        go: "workflows",
      },
    ];
    const list = $("#actionList");
    if (!list) return;
    list.innerHTML = rows
      .filter(function (r) {
        return r.show;
      })
      .map(function (r) {
        return (
          '<li><button class="arow' +
          (r.tone ? " arow--" + r.tone : "") +
          '" type="button"' +
          (r.go ? ' data-goto="' + r.go + '"' : ' data-flash="Opened"') +
          ">" +
          '<span class="arow-ic"><svg class="ic"><use href="#' +
          r.ic +
          '"/></svg></span>' +
          '<span class="arow-txt"><span class="arow-t" style="display:block">' +
          r.t +
          "</span>" +
          '<span class="arow-h" style="display:block">' +
          r.h +
          "</span></span>" +
          '<svg class="ic arow-go"><use href="#i-arrow"/></svg></button></li>'
        );
      })
      .join("");
  }

  function renderRecent() {
    const list = $("#recentList");
    if (!list) return;
    list.innerHTML = ACTIVITY_FEED.slice(0, 5)
      .map(function (a) {
        return (
          "<li><span>" + a.summary + '</span><span class="recent-age">' + a.age + "</span></li>"
        );
      })
      .join("");
  }

  // ================= CUSTOMER BOOK =================
  function renderCbTiles() {
    const totalLtv = CUSTOMERS_DATA.reduce(function (a, c) {
      return a + c.ltv;
    }, 0);
    const totalQuotes = CUSTOMERS_DATA.reduce(function (a, c) {
      return a + c.quotes;
    }, 0);
    const tiles = $("#cbTiles");
    if (!tiles) return;
    tiles.innerHTML =
      '<div class="cb-tile"><div class="kpi-lbl">Customers</div><div class="cb-val">' +
      CUSTOMERS_DATA.length +
      '</div><div class="cb-hint">with ≥1 proposal</div></div>' +
      '<div class="cb-tile"><div class="kpi-lbl">Lifetime value</div><div class="cb-val">' +
      money(totalLtv) +
      '</div><div class="cb-hint">paid to date</div></div>' +
      '<div class="cb-tile"><div class="kpi-lbl">Total proposals</div><div class="cb-val">' +
      totalQuotes +
      '</div><div class="cb-hint">all statuses</div></div>';
  }

  function cbFiltered() {
    return crm.cbFilter.length === 0
      ? CUSTOMERS_DATA
      : CUSTOMERS_DATA.filter(function (c) {
          return crm.cbFilter.indexOf(c.top) !== -1;
        });
  }

  function renderCbChips() {
    const counts: Record<string, number> = {};
    CUSTOMERS_DATA.forEach(function (c) {
      counts[c.top] = (counts[c.top] || 0) + 1;
    });
    const present = STATUS_ORDER.filter(function (s) {
      return counts[s] > 0;
    });
    let html =
      '<button class="cb-chip' +
      (crm.cbFilter.length === 0 ? " on" : "") +
      '" type="button" data-cb="ALL">All <span class="cb-n">' +
      CUSTOMERS_DATA.length +
      "</span></button>";
    present.forEach(function (s) {
      // No status dot: the chip itself carries the status color once active
      // (`cb-chip--<status>` + `.on` in the CSS module).
      html +=
        '<button class="cb-chip cb-chip--' +
        s.toLowerCase() +
        (crm.cbFilter.indexOf(s) !== -1 ? " on" : "") +
        '" type="button" data-cb="' +
        s +
        '">' +
        titleCase(s) +
        ' <span class="cb-n">' +
        counts[s] +
        "</span></button>";
    });
    const chips = $("#cbChips");
    if (chips) chips.innerHTML = html;
    const shown = cbFiltered().length;
    const caption = $("#cbCaption");
    if (caption) {
      caption.textContent =
        crm.cbFilter.length === 0
          ? CUSTOMERS_DATA.length + " customer" + (CUSTOMERS_DATA.length === 1 ? "" : "s")
          : shown + " of " + CUSTOMERS_DATA.length + " shown";
    }
  }

  function renderCbTable() {
    const rows = cbFiltered();
    const body = $("#cbBody");
    if (!body) return;
    body.innerHTML = rows.length
      ? rows
          .map(function (c) {
            return (
              '<tr class="prow">' +
              '<td><div class="cb-name">' +
              c.name +
              '</div><div class="cb-mail">' +
              (c.email || "—") +
              "</div></td>" +
              '<td><span class="pstatus ' +
              STATUS_CLS[c.top] +
              '">' +
              titleCase(c.top) +
              "</span></td>" +
              '<td class="num"><span class="pt-mono">' +
              c.quotes +
              "</span></td>" +
              '<td class="num"><span class="pt-money">' +
              money(c.quoted) +
              "</span></td>" +
              '<td class="num">' +
              (c.ltv > 0
                ? '<span class="pt-money cb-ltv">' + money(c.ltv) + "</span>"
                : '<span class="cb-none">—</span>') +
              "</td>" +
              '<td><span class="pt-mono">' +
              c.last +
              "</span></td>" +
              "</tr>"
            );
          })
          .join("")
      : '<tr><td colspan="6" style="text-align:center;padding:38px 16px;color:var(--muted)">No customers match this filter.</td></tr>';
  }

  // ================= WORKFLOWS =================
  function renderRules() {
    const empty = $("#rulesEmpty");
    if (empty) empty.classList.toggle("is-hidden", rulesData.length !== 0 || crm.creating);
    const list = $("#rulesList");
    if (list) {
      list.innerHTML = rulesData
        .map(function (r) {
          if (crm.editing === r.id) return "<li>" + ruleFormHtml(r) + "</li>";
          const trig =
            (
              TRIGGERS.find(function (t) {
                return t.value === r.triggerStatus;
              }) || ({} as { label?: string })
            ).label || r.triggerStatus;
          return (
            '<li data-rule="' +
            r.id +
            '">' +
            '<div style="min-width:0;flex:1">' +
            '<div class="rule-name">' +
            r.name +
            '<span class="pstatus ' +
            (r.enabled ? "rst--on" : "rst--off") +
            '">' +
            (r.enabled ? "active" : "off") +
            "</span></div>" +
            '<div class="rule-meta">Trigger: <b>' +
            trig +
            "</b> · Delay: <b>" +
            humanDelay(r.delayMinutes) +
            "</b></div>" +
            (r.template ? '<div class="rule-tpl">Template: <code>' + r.template + "</code></div>" : "") +
            "</div>" +
            '<div class="rule-act">' +
            '<button class="tgl' +
            (r.enabled ? " on" : "") +
            '" type="button" data-act="toggle" aria-pressed="' +
            (r.enabled ? "true" : "false") +
            '" aria-label="Toggle rule"></button>' +
            '<button class="btn btn-ghost btn--sm" type="button" data-act="edit">Edit</button>' +
            '<button class="rule-del" type="button" data-act="del-rule" aria-label="Delete rule"><svg class="ic"><use href="#i-trash"/></svg></button>' +
            "</div></li>"
          );
        })
        .join("");
    }
    const form = $("#ruleForm");
    if (!form) return;
    form.classList.toggle("is-hidden", !crm.creating);
    if (crm.creating) form.innerHTML = ruleFormHtml(null);
  }

  function ruleFormHtml(r: FollowUpRule | null) {
    const days = r ? Math.max(1, Math.round(r.delayMinutes / 60 / 24)) : 2;
    return (
      '<div class="rf-body" data-form="' +
      (r ? r.id : "new") +
      '">' +
      '<div class="rf-grid">' +
      '<label><span class="rf-lbl">Rule name</span><input class="rf-in" data-f="name" value="' +
      (r ? r.name : "") +
      '" placeholder="Nudge after send"></label>' +
      '<label><span class="rf-lbl">Trigger</span><select class="rf-sel" data-f="trigger">' +
      TRIGGERS.map(function (t) {
        return (
          '<option value="' +
          t.value +
          '"' +
          (r && r.triggerStatus === t.value ? " selected" : "") +
          ">" +
          t.label +
          "</option>"
        );
      }).join("") +
      "</select></label>" +
      '<label><span class="rf-lbl">Delay (days)</span><input class="rf-in" type="number" min="1" data-f="days" value="' +
      days +
      '"></label>' +
      '<label><span class="rf-lbl">Template</span><select class="rf-sel" data-f="template">' +
      '<option value="">None</option>' +
      TEMPLATES.map(function (t) {
        return '<option value="' + t + '"' + (r && r.template === t ? " selected" : "") + ">" + t + "</option>";
      }).join("") +
      "</select></label>" +
      "</div>" +
      '<div class="rf-act">' +
      '<button class="btn btn-primary btn--sm" type="button" data-act="save-rule"><svg class="ic"><use href="#i-check"/></svg>Save rule</button>' +
      '<button class="btn btn-ghost btn--sm" type="button" data-act="cancel-rule">Cancel</button>' +
      "</div></div>"
    );
  }

  // ================= QUEUE =================
  function severity(q: QueueItem) {
    if (!q.overdue) return { cls: "sev--sched", label: q.rel };
    if (q.days <= 0) return { cls: "sev--soon", label: "due today" };
    if (q.days >= 7) return { cls: "sev--vlate", label: q.days + "d late" };
    if (q.days >= 3) return { cls: "sev--late", label: q.days + "d late" };
    return { cls: "sev--soon", label: q.days + "d late" };
  }

  function renderQueue() {
    const nAll = $('[data-qn="ALL"]');
    if (nAll) nAll.textContent = String(queueData.length);
    const nDue = $('[data-qn="DUE"]');
    if (nDue) nDue.textContent = String(dueNow().length);
    const nSched = $('[data-qn="SCHEDULED"]');
    if (nSched) nSched.textContent = String(scheduled().length);
    const tabN = $("#queueTabN");
    if (tabN) tabN.textContent = String(dueNow().length);

    const rows =
      crm.qTab === "DUE" ? dueNow() : crm.qTab === "SCHEDULED" ? scheduled() : queueData;
    const pages = Math.max(1, Math.ceil(rows.length / Q_PAGE));
    if (crm.qPage > pages) crm.qPage = pages;
    const slice = rows.slice((crm.qPage - 1) * Q_PAGE, crm.qPage * Q_PAGE);
    const body = $("#queueBody");
    if (body) {
      body.innerHTML = slice
        .map(function (q) {
          const sev = severity(q);
          return (
            '<tr class="prow q-row" data-q="' +
            q.id +
            '">' +
            '<td><div class="q-who">' +
            q.client +
            '</div><div class="q-title">' +
            (q.title || "Follow-up") +
            "</div></td>" +
            '<td><span class="sev ' +
            sev.cls +
            '">' +
            sev.label +
            "</span></td>" +
            '<td><div class="q-date">' +
            q.date +
            '</div><div class="q-rel">' +
            q.rel +
            "</div></td>" +
            '<td><div class="q-act">' +
            '<button class="btn btn-ghost btn--sm" type="button" data-act="q-done"><svg class="ic"><use href="#i-check"/></svg>Done</button>' +
            '<button class="btn btn-primary btn--sm" type="button" data-act="q-send"><svg class="ic"><use href="#i-send"/></svg>Send</button>' +
            "</div></td></tr>"
          );
        })
        .join("");
    }
    const card = $("#queueCard");
    if (card) card.classList.toggle("is-hidden", queueData.length === 0);
    const qEmpty = $("#queueEmpty");
    if (qEmpty) qEmpty.classList.toggle("is-hidden", queueData.length !== 0);
    const el = $("#queuePager");
    if (!el) return;
    if (pages <= 1) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<span class="pager-info">Page ' +
      crm.qPage +
      " / " +
      pages +
      "</span>" +
      '<button class="pager-btn" type="button" data-pg="prev"' +
      (crm.qPage <= 1 ? " disabled" : "") +
      ' aria-label="Previous"><svg class="ic rot-l"><use href="#i-chev"/></svg></button>' +
      '<button class="pager-btn" type="button" data-pg="next"' +
      (crm.qPage >= pages ? " disabled" : "") +
      ' aria-label="Next"><svg class="ic rot-r"><use href="#i-chev"/></svg></button>';
  }

  function renderCrm() {
    renderStats();
    renderFresh();
    renderActions();
    renderRecent();
    renderCbTiles();
    renderCbChips();
    renderCbTable();
    renderRules();
    renderQueue();
  }

  // ================= EVENTS =================
  function switchTab(name: string) {
    crm.tab = name;
    $$("#crmTabs .crm-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    $$(".ppanel").forEach(function (p) {
      p.classList.toggle("is-hidden", p.dataset.panel !== name);
    });
  }

  const crmTabs = $("#crmTabs");
  if (crmTabs) {
    on(crmTabs, "click", function (e) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLElement>(".crm-tab");
      if (btn && !btn.classList.contains("active") && btn.dataset.tab) switchTab(btn.dataset.tab);
    });
  }

  const cbChips = $("#cbChips");
  if (cbChips) {
    on(cbChips, "click", function (e) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const chip = target.closest<HTMLElement>(".cb-chip");
      if (!chip) return;
      const v = chip.dataset.cb;
      if (!v) return;
      if (v === "ALL") crm.cbFilter = [];
      else {
        const i = crm.cbFilter.indexOf(v);
        if (i === -1) crm.cbFilter.push(v);
        else crm.cbFilter.splice(i, 1);
      }
      renderCbChips();
      renderCbTable();
    });
  }

  const qTabs = $("#qTabs");
  if (qTabs) {
    on(qTabs, "click", function (e) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLElement>(".ptab");
      if (!btn || btn.classList.contains("active")) return;
      crm.qTab = btn.dataset.q || "ALL";
      crm.qPage = 1;
      $$("#qTabs .ptab").forEach(function (t) {
        t.classList.toggle("active", t === btn);
      });
      renderQueue();
    });
  }

  const newRuleBtn = $("#newRuleBtn");
  if (newRuleBtn) {
    on(newRuleBtn, "click", function () {
      crm.creating = true;
      crm.editing = null;
      renderRules();
    });
  }

  function flashBtn(btn: HTMLElement, label: string) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    const old = btn.innerHTML;
    btn.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>' + label;
    later(function () {
      btn.innerHTML = old;
      delete btn.dataset.busy;
    }, 1600);
  }

  on(document, "click", function (e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const goto = target.closest<HTMLElement>("[data-goto]");
    if (goto && root.contains(goto)) {
      if (goto.dataset.goto) switchTab(goto.dataset.goto);
      return;
    }
    const pg = target.closest<HTMLButtonElement>(".pager-btn");
    if (pg && root.contains(pg) && !pg.disabled) {
      crm.qPage += pg.dataset.pg === "next" ? 1 : -1;
      renderQueue();
      return;
    }
    const fl = target.closest<HTMLElement>("[data-flash]");
    if (fl && root.contains(fl)) {
      flashBtn(fl, fl.dataset.flash || "");
      return;
    }

    const act = target.closest<HTMLElement>("[data-act]");
    if (!act || !root.contains(act)) return;
    const kind = act.dataset.act;
    const ruleLi = act.closest<HTMLElement>("[data-rule]");

    if (kind === "toggle" && ruleLi) {
      const r = rulesData.find(function (x) {
        return x.id === ruleLi.dataset.rule;
      });
      if (r) {
        r.enabled = !r.enabled;
        // Patch the row in place instead of re-rendering the list: a full
        // innerHTML rebuild replaces the switch node, so the knob's slide and
        // the badge's color crossfade never get a chance to run.
        //
        // The class flip is now the ONLY thing that moves the knob. The old
        // code also removed/re-added a `tgl--kick` keyframe class around a
        // forced reflow, which restarted the knob from its previous position
        // mid-transition — one click, two visible movements. The press gesture
        // lives on the track's `:active` rule instead, where it cannot compete
        // for the same `transform`.
        act.classList.toggle("on", r.enabled);
        act.setAttribute("aria-pressed", r.enabled ? "true" : "false");
        const badge = ruleLi.querySelector<HTMLElement>(".rule-name .pstatus");
        if (badge) {
          badge.classList.toggle("rst--on", r.enabled);
          badge.classList.toggle("rst--off", !r.enabled);
          badge.textContent = r.enabled ? "active" : "off";
        }
      }
      return;
    }
    if (kind === "edit" && ruleLi) {
      crm.editing = ruleLi.dataset.rule || null;
      crm.creating = false;
      renderRules();
      return;
    }
    if (kind === "del-rule" && ruleLi) {
      const i = rulesData.findIndex(function (x) {
        return x.id === ruleLi.dataset.rule;
      });
      if (i > -1) rulesData.splice(i, 1);
      renderRules();
      return;
    }
    if (kind === "cancel-rule") {
      crm.editing = null;
      crm.creating = false;
      renderRules();
      return;
    }
    if (kind === "save-rule") {
      const body = act.closest<HTMLElement>("[data-form]");
      if (!body) return;
      const field = (f: string) => body.querySelector<HTMLInputElement | HTMLSelectElement>('[data-f="' + f + '"]');
      const get = function (f: string) {
        const el = field(f);
        return el ? el.value : "";
      };
      const name = get("name").trim();
      if (!name) {
        field("name")?.focus();
        return;
      }
      const payload = {
        name: name,
        triggerStatus: get("trigger"),
        delayMinutes: Math.max(1, parseInt(get("days"), 10) || 1) * 60 * 24,
        template: get("template") || null,
      };
      const id = body.dataset.form;
      if (id === "new") {
        ruleSeq += 1;
        rulesData.push(Object.assign({ id: "r" + ruleSeq, enabled: true }, payload));
        crm.creating = false;
      } else {
        const r = rulesData.find(function (x) {
          return x.id === id;
        });
        if (r) Object.assign(r, payload);
        crm.editing = null;
      }
      renderRules();
      return;
    }
    if (kind === "q-done" || kind === "q-send") {
      const row = act.closest<HTMLElement>("[data-q]");
      if (!row) return;
      const id = row.dataset.q;
      row.classList.add("gone");
      later(function () {
        queueData = queueData.filter(function (q) {
          return q.id !== id;
        });
        renderQueue();
        renderStats();
        renderActions();
      }, 240);
    }
  });

  // ================= INITIALIZATION =================
  safe("init", function () {
    renderCrm();
  });

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

    // Reveal: load + scroll. Reveal adapts to scroll speed: a slow scroll gets
    // the full 420ms animation; a fast one gets a shorter pass.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost) {
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
    }
    const blocks = $$(".content > *");
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its strip of
    // small units is the section tab row (`.stat` and `.cb-tile` already
    // stagger through animateRows below, so they stay out of this). Skip
    // anything the block cascade claimed — never `rv` and `rv-cell` together.
    const cells = $$(".crm-tab").filter((el) => !el.classList.contains("rv"));
    cells.forEach((el, i) => {
      el.classList.add("rv-cell");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? 160 + (i % 8) * 45 + "ms" : "200ms";
    });
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          const target = en.target as HTMLElement;
          if (target.dataset.rvScroll) {
            // below the fold: duration follows the current scroll speed
            const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
            target.style.transitionDuration = dur + "ms";
          }
          target.classList.add("rv-in");
          io.unobserve(target);
          target.addEventListener("transitionend", function te() {
            target.style.transitionDelay = "";
            target.style.transitionDuration = "";
            target.removeEventListener("transitionend", te);
          });
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.concat(cells).forEach((el) => io.observe(el));
    disposers.push(() => io.disconnect());

    // (Sidebar cascade lives in the shell — it plays once, on first load.)

    // Row stagger on list (re)render
    function animateRows(list: HTMLElement) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>(".prow, .stat, .cb-tile"));
      rows.forEach((r, i) => {
        r.style.opacity = "0";
        r.style.transform = "translateY(8px)";
        r.style.transition =
          "opacity 300ms " + EASE + " " + i * 45 + "ms, transform 300ms " + EASE + " " + i * 45 + "ms";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            r.style.opacity = "1";
            r.style.transform = "none";
          }),
        );
        // Drop the inline styles once the stagger lands. Left in place, the
        // inline `transform: none` outranks every stylesheet `:hover` rule,
        // so hover lift on rows and tiles silently stops working.
        r.addEventListener("transitionend", function te(e) {
          if (e.propertyName !== "transform") return;
          r.style.opacity = "";
          r.style.transform = "";
          r.style.transition = "";
          r.removeEventListener("transitionend", te);
        });
      });
    }
    ["statGrid", "freshList", "cbBody", "queueBody"].forEach((id) => {
      const list = $("#" + id);
      if (!list) return;
      animateRows(list);
      const mo = new MutationObserver(() => animateRows(list));
      mo.observe(list, { childList: true });
      disposers.push(() => mo.disconnect());
    });

    // Numeral count-up — Overview's `.kpi-val`; here the stat grid, the
    // callback tiles and the tab counts. The donor rebuilt the text from
    // digits alone, safe only for its own plain "$12,400"/"18": it drops any
    // trailing unit and would wipe an inline icon. So keep whatever frames the
    // number, skip decimals (digits-only mangles them), and skip nodes that
    // hold elements rather than bare text.
    $$(".stat-val, .cb-val, .ptab-count").forEach((el) => {
      if (el.children.length) return;
      const m = (el.textContent || "").trim().match(/^([^\d]*)(\d[\d,]*)([^\d]*)$/);
      if (!m) return;
      const [, prefix, digits, suffix] = m;
      const target = parseInt(digits.replace(/,/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = prefix + Math.round(target * e).toLocaleString("en-US") + suffix;
        if (pr < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // Press effects. Shell controls (.icon-btn, .sb-foot-*) press from the shell.
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
    pressify(
      ".btn, .card-foot-btn, .ptab, .pchip, .pager-btn, .pmenu-item, .photo-box, .pt-open",
      "pressed",
    );
    pressify(".week-strip .day", "day-pressed");

    // (Graph-paper parallax lives in the shell — it owns .main.)
  })();

  // The sliding sidebar indicator lives in the shell — it survives navigation
  // and re-points at whichever item React marks `active`.

  return () => {
    disposers.forEach((d) => d());
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  };
}
