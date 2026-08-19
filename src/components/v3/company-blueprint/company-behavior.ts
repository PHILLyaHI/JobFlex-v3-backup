// Company blueprint — runtime behaviors, ported from the donor file's <script>
// (jobflex-company-blueprint_3.html). Every duration, easing, stagger, page
// size and string is the donor's exact value. Adaptations are mechanical only:
//
// - queries are scoped to the mounted `.content` root;
// - the donor's three document-level delegated listeners (input / change /
//   click) keep delegation but ignore events raised outside `.content`, which
//   is where every element they target lives in the donor anyway;
// - every document/window/`.main` listener, timer, rAF and observer is tracked
//   and torn down by the returned cleanup;
// - SKIPPED, because blueprint-shell/shell-behavior.ts already owns them: the
//   matchMedia polyfill, the mobile nav drawer, FLUID SCALE, the sidebar entry
//   cascade, the sliding active indicator and the graph-paper parallax.
//
// This page is no longer a fixture. The donor's autosave was a 700ms timer
// that wrote "All changes saved" and persisted nothing; every save line below
// now runs the matching server action (updateBranding / updateLeadProfile /
// updateLanding in actions/company.ts) behind the same 700ms debounce and
// reports what the server actually did. The activity feed reads real
// ActivityEvent rows and the trade chips offer the canonical taxonomy the
// action validates against.
//
// The donor creates no DOM outside `.content`; `#pMenu` (position: fixed) is
// the only fixed-position overlay and it ships inline in the markup, empty and
// display:none, exactly as the donor leaves it on this page.

import { updateBranding, updateLanding, updateLeadProfile } from "@/actions/company";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import {
  COLOR_PRESETS,
  TRADE_TYPES,
  ACT_CATS,
  type ActivityEntry,
  type CompanyOrgState,
  type TeamMember,
} from "./company-data";

export type CompanyContentOptions = {
  org: CompanyOrgState;
  activity: ActivityEntry[];
  members: TeamMember[];
  /** The three company actions are `requireManager`-guarded. When the viewer is
   *  a limited role the sheet still reads, but every control is inert and the
   *  save lines say so instead of letting the server reject each keystroke. */
  canEdit: boolean;
};

/** The company actions reject with an Error whose message is written for the
 *  user ("Manager access required"). Surface that text; fall back to a generic
 *  line for a transport failure, which carries no useful message. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Couldn’t save — check your connection and try again.";
  }
  // Zod's parse failures are JSON blobs, not sentences.
  if (msg.startsWith("[") || msg.startsWith("{")) return "Couldn’t save — check the highlighted fields.";
  return msg;
}

export function initCompanyContent(
  content: HTMLElement,
  options: CompanyContentOptions,
): () => void {
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

  // Tracked timers / animation frames — cleared on unmount.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const frames = new Set<number>();
  const raf = (fn: FrameRequestCallback) => {
    const id = requestAnimationFrame((t) => {
      frames.delete(id);
      fn(t);
    });
    frames.add(id);
    return id;
  };
  const raf2 = (fn: () => void) => raf(() => raf(() => fn()));

  // ================= SAFETY: module isolation =================
  // Each block is wrapped so a failure in one does not disable the rest.
  const safe = (name: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.error("[JobFlex] module failed: " + name, err);
    }
  };

  // Dismiss Lead Center banners (smooth height + gap collapse) — inert on this
  // page (no banner in the markup), kept for donor parity.
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
      raf2(() => {
        b.classList.add("closing");
        b.style.height = "0px";
      });
      b.addEventListener("transitionend", function te(e) {
        if (e.propertyName !== "height") return;
        b.classList.add("hidden");
        b.removeEventListener("transitionend", te);
      });
    });
  });

  // ================= COMPANY: STATE =================
  // Seeded from the database row the page component read; every mutation below
  // writes back through a company server action.
  const { org, activity, members, canEdit } = options;
  const activityData = activity;
  const co = {
    tab: "branding",
    color: org.primaryColor || COLOR_PRESETS[0],
    logoUrl: org.logoUrl,
    trades: org.tradeTypes.slice(),
    leadsOn: org.leadOffersEnabled,
    publicOn: org.publicProfileEnabled,
    actCat: "all",
    actQuery: "",
    /** Membership user id, or "" for Everyone. */
    actPerson: "",
    actVisible: 6,
    timers: {} as Record<string, ReturnType<typeof setTimeout> | undefined>,
    /** Per-save-line sequence number: a later save always wins the line. */
    seq: {} as Record<string, number>,
  };

  function monogram(n: string) {
    const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
    if (!p.length) return "—";
    return p.length === 1
      ? p[0].slice(0, 2).toUpperCase()
      : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  // ================= SAVING =================
  // The donor's autosave was a 700ms timer that typed "All changes saved" and
  // persisted nothing. Same line, same debounce — it now runs the action and
  // reports what the server actually did.
  function saveLine(which: string, text: string, tone: "" | "saved" | "err") {
    const el = $("#" + which);
    if (!el) return;
    el.classList.remove("saved", "err");
    if (tone) el.classList.add(tone);
    el.textContent = text;
  }

  async function commit(which: string, run: () => Promise<unknown>) {
    const token = (co.seq[which] = (co.seq[which] ?? 0) + 1);
    saveLine(which, "Saving…", "");
    try {
      await run();
      if (co.seq[which] !== token) return; // a newer save owns the line
      saveLine(which, "All changes saved", "saved");
    } catch (err) {
      if (co.seq[which] !== token) return;
      saveLine(which, actionError(err), "err");
    }
  }

  /** Debounced save — the donor's 700ms, now in front of a real write. */
  function autosave(which: string, run: () => Promise<unknown>, delay = 700) {
    if (!canEdit) return;
    saveLine(which, "Saving…", "");
    const prev = co.timers[which];
    if (prev !== undefined) {
      clearTimeout(prev);
      timers.delete(prev);
    }
    co.timers[which] = later(() => {
      void commit(which, run);
    }, delay);
  }

  const val = (sel: string) => $<HTMLInputElement>(sel)?.value.trim() ?? "";
  const orNull = (v: string) => (v ? v : null);
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // Branding and Lead matching edit the SAME two Organization columns (address,
  // phone). Keep the pair of inputs in step so the sheet never shows two
  // different values for one column — patch the sibling node, never re-render.
  function mirrorField(from: "b" | "l", field: "addr" | "phone") {
    const src = $<HTMLInputElement>('[data-' + from + '="' + field + '"]');
    const dst = $<HTMLInputElement>('[data-' + (from === "b" ? "l" : "b") + '="' + field + '"]');
    if (!src || !dst || dst === document.activeElement) return;
    dst.value = src.value;
  }

  function saveBranding() {
    const name = val('[data-b="name"]');
    if (!name) {
      saveLine("saveBranding", "Company name can’t be empty", "err");
      return;
    }
    const email = val('[data-b="email"]');
    if (email && !EMAIL_RE.test(email)) {
      saveLine("saveBranding", "Enter a valid billing email", "err");
      return;
    }
    autosave("saveBranding", () =>
      updateBranding({
        name,
        billingEmail: orNull(email),
        phone: orNull(val('[data-b="phone"]')),
        website: orNull(val('[data-b="site"]')),
        address: orNull(val('[data-b="addr"]')),
        primaryColor: co.color,
      }),
    );
  }

  function saveLead() {
    autosave("saveLead", () =>
      updateLeadProfile({
        address: orNull(val('[data-l="addr"]')),
        phone: orNull(val('[data-l="phone"]')),
        tradeTypes: co.trades,
        leadOffersEnabled: co.leadsOn,
      }),
    );
  }

  function saveLanding() {
    autosave("saveLanding", () =>
      updateLanding({
        publicProfileEnabled: co.publicOn,
        landingHeroTitle: orNull(val('[data-g="title"]')),
        landingHeroSubtitle: orNull(val('[data-g="sub"]')),
      }),
    );
  }

  // ================= RENDER =================
  /** Every interpolation below lands in innerHTML, so anything that came from
   *  the database (company name, website, trade names) is escaped first. */
  function esc(v: string) {
    return v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  const dis = canEdit ? "" : " disabled";
  /** The empty-state markup React rendered inside the drop target, kept so the
   *  control can go back to it if the logo is ever cleared. */
  const logoDropDefault = $("#logoDrop")?.innerHTML ?? "";

  function renderSwatches() {
    const host = $("#swatches");
    if (!host) return;
    host.innerHTML =
      COLOR_PRESETS.map(function (c) {
        return (
          '<button class="sw' +
          (co.color.toLowerCase() === c.toLowerCase() ? " on" : "") +
          '" type="button" data-color="' +
          c +
          '" style="background:' +
          c +
          '" aria-label="Pick color ' +
          c +
          '"' +
          dis +
          "></button>"
        );
      }).join("") +
      '<input class="sw-hex" id="hexInput" value="' +
      esc(co.color) +
      '" aria-label="Brand color hex"' +
      (canEdit ? "" : " readonly") +
      ">";
  }
  function renderPreview() {
    const field = function (f: string) {
      const el = $<HTMLInputElement>('[data-b="' + f + '"]');
      return el ? el.value.trim() : "";
    };
    const name = field("name") || "Your company";
    const sub = field("site") || field("phone") || field("email") || "—";
    const prev = $("#mailPrev");
    if (!prev) return;
    prev.style.borderLeftColor = co.color;
    // With a logo saved, the header sample shows the logo — that is what the
    // customer receives. Without one it falls back to the donor's initial mark.
    const mark = co.logoUrl
      ? '<span class="mail-mark mail-mark--img"><img src="' + esc(co.logoUrl) + '" alt=""></span>'
      : '<span class="mail-mark" style="background:' +
        esc(co.color) +
        '">' +
        esc(name.charAt(0).toUpperCase()) +
        "</span>";
    prev.innerHTML =
      mark +
      '<span style="min-width:0"><span class="mail-name" style="display:block">' + esc(name) + "</span>" +
      '<span class="mail-sub" style="display:block">' + esc(sub) + "</span></span>";
  }
  /** The drop target shows the saved logo once there is one. */
  function renderLogo() {
    const drop = $("#logoDrop");
    if (!drop) return;
    if (co.logoUrl) {
      drop.classList.add("has-img");
      drop.innerHTML = '<img class="logo-img" src="' + esc(co.logoUrl) + '" alt="Company logo">';
    } else if (drop.classList.contains("has-img")) {
      drop.classList.remove("has-img");
      drop.innerHTML = logoDropDefault;
    }
  }
  function renderTrades() {
    const host = $("#trades");
    if (host) {
      host.innerHTML = TRADE_TYPES.map(function (t) {
        return (
          '<button class="trade' +
          (co.trades.indexOf(t) !== -1 ? " on" : "") +
          '" type="button" data-trade="' +
          esc(t) +
          '"' +
          dis +
          ">" +
          esc(t) +
          "</button>"
        );
      }).join("");
    }
    renderLeadState();
  }
  /** The matching badge only — patched on its own when a chip or the toggle
   *  changes, so the chip row keeps its focus. */
  function renderLeadState() {
    const badge = $("#leadState");
    if (!badge) return;
    const ready = co.trades.length > 0 && co.leadsOn;
    badge.className = "pstatus " + (ready ? "lead-ok" : "lead-wait");
    badge.textContent = ready ? "Matching on" : co.trades.length === 0 ? "Pick a trade" : "Paused";
  }
  function renderActivity() {
    const cats = $("#actCats");
    if (cats) {
      cats.innerHTML = ACT_CATS.map(function (c) {
        return (
          '<button class="act-cat' +
          (co.actCat === c.key ? " on" : "") +
          '" type="button" data-cat="' +
          c.key +
          '">' +
          c.label +
          "</button>"
        );
      }).join("");
    }
    const sel = $<HTMLSelectElement>("#actPerson");
    if (sel && !sel.options.length) {
      // Real memberships, keyed by user id — two people can share a first name.
      sel.innerHTML =
        '<option value="">Everyone</option>' +
        members
          .map(function (m) {
            return '<option value="' + esc(m.id) + '">' + esc(m.name) + "</option>";
          })
          .join("");
    }
    const q = co.actQuery.trim().toLowerCase();
    const rows = activityData.filter(function (a) {
      if (co.actCat !== "all" && a.cat !== co.actCat) return false;
      if (co.actPerson && a.actorId !== co.actPerson) return false;
      if (!q) return true;
      return (
        (a.actor + " " + a.summary + " " + a.meta)
          .toLowerCase()
          .replace(/<[^>]+>/g, "")
          .indexOf(q) !== -1
      );
    });
    const shown = rows.slice(0, co.actVisible);
    let html = "";
    let lastDay: string | null = null;
    shown.forEach(function (a) {
      if (a.day !== lastDay) {
        html += '<div class="act-day">' + esc(a.day) + "</div>";
        lastDay = a.day;
      }
      html +=
        '<div class="act-row">' +
        '<span class="act-av">' +
        monogram(a.actor) +
        (a.tone
          ? '<span class="act-bead" style="background:' + a.tone + '"></span>'
          : '<span class="act-bead"></span>') +
        "</span>" +
        '<span class="act-txt"><span class="act-sum" style="display:block"><b>' +
        esc(a.actor) +
        "</b> " +
        a.summary +
        "</span>" +
        '<span class="act-meta" style="display:block">' +
        a.meta +
        "</span></span>" +
        '<span class="act-time">' +
        esc(a.time) +
        "</span>" +
        "</div>";
    });
    const feed = $("#actFeed");
    if (feed) feed.innerHTML = html;
    $("#actEmpty")?.classList.toggle("is-hidden", rows.length !== 0);
    $("#actMore")?.classList.toggle("is-hidden", rows.length <= co.actVisible);
  }
  function renderCompany() {
    renderSwatches();
    renderLogo();
    renderPreview();
    renderTrades();
    renderActivity();
  }
  /**
   * Installed by the motion module below; null under reduced motion.
   *
   * `fromIndex` skips the rows that were already on screen, which is what "Show
   * more" needs: `renderActivity` rebuilds the feed's markup wholesale, so the
   * six rows the reader is mid-sentence in are new nodes too — cascading them
   * again would blink the text out from under them.
   */
  let playStagger: ((fromIndex?: number) => void) | null = null;

  // ================= EVENTS =================
  const coTabs = $("#coTabs");
  if (coTabs) {
    on(coTabs, "click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".co-tab");
      if (!b || b.classList.contains("active")) return;
      co.tab = b.dataset.tab ?? "";
      $$("#coTabs .co-tab").forEach(function (t) {
        t.classList.toggle("active", t === b);
      });
      $$(".ppanel").forEach(function (p) {
        p.classList.toggle("is-hidden", p.dataset.panel !== co.tab);
      });
    });
  }

  // Branding: field edits -> preview + autosave
  on(document, "input", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || !root.contains(t)) return;
    if (t.matches("[data-b]")) {
      // address / phone are one column shared with Lead matching.
      if (t.matches('[data-b="addr"]')) mirrorField("b", "addr");
      if (t.matches('[data-b="phone"]')) mirrorField("b", "phone");
      renderPreview();
      saveBranding();
    }
    if (t.matches("[data-l]")) {
      if (t.matches('[data-l="addr"]')) mirrorField("l", "addr");
      if (t.matches('[data-l="phone"]')) mirrorField("l", "phone");
      if (t.matches('[data-l="phone"]')) renderPreview();
      saveLead();
    }
    if (t.matches("[data-g]")) {
      saveLanding();
    }
    if (t.id === "hexInput") {
      const v = (t as HTMLInputElement).value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        co.color = v;
        $$(".sw").forEach(function (b) {
          b.classList.toggle("on", (b.dataset.color ?? "").toLowerCase() === v.toLowerCase());
        });
        renderPreview();
        saveBranding();
      }
    }
    if (t.id === "actSearch") {
      co.actQuery = (t as HTMLInputElement).value;
      co.actVisible = 6;
      renderActivity();
    }
  });
  on(document, "change", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || !root.contains(t)) return;
    if (t.id === "actPerson") {
      co.actPerson = (t as HTMLSelectElement).value;
      co.actVisible = 6;
      renderActivity();
    }
  });

  on(document, "click", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || !root.contains(t)) return;

    const sw = t.closest<HTMLElement>("[data-color]");
    if (sw) {
      if (!canEdit) return;
      co.color = sw.dataset.color ?? co.color;
      renderSwatches();
      renderPreview();
      // A swatch is a decision, not typing — save it without the type-ahead wait.
      autosave("saveBranding", () => updateBranding({ primaryColor: co.color }), 0);
      return;
    }
    const tr = t.closest<HTMLElement>("[data-trade]");
    if (tr) {
      if (!canEdit) return;
      const trade = tr.dataset.trade ?? "";
      const i = co.trades.indexOf(trade);
      if (i === -1) co.trades.push(trade);
      else co.trades.splice(i, 1);
      // Patch the one chip the user pressed — re-rendering the row would steal
      // the focus ring off the control they just used.
      tr.classList.toggle("on", i === -1);
      renderLeadState();
      autosave("saveLead", () => updateLeadProfile({ tradeTypes: co.trades }), 0);
      return;
    }
    if (t.closest("#leadToggle")) {
      if (!canEdit) return;
      co.leadsOn = !co.leadsOn;
      $("#leadToggle")?.classList.toggle("on", co.leadsOn);
      renderLeadState();
      autosave("saveLead", () => updateLeadProfile({ leadOffersEnabled: co.leadsOn }), 0);
      return;
    }
    if (t.closest("#publicToggle")) {
      if (!canEdit) return;
      co.publicOn = !co.publicOn;
      $("#publicToggle")?.classList.toggle("on", co.publicOn);
      autosave("saveLanding", () => updateLanding({ publicProfileEnabled: co.publicOn }), 0);
      return;
    }
    const cat = t.closest<HTMLElement>("[data-cat]");
    if (cat) {
      co.actCat = cat.dataset.cat ?? "all";
      co.actVisible = 6;
      renderActivity();
      return;
    }
    if (t.closest("#actMoreBtn")) {
      // Count the rows on screen BEFORE the render, so only the six the click
      // adds cascade in. This is the one activity action that genuinely brings
      // new rows — the category chips, the search box and the person select all
      // just narrow the same feed.
      const shown = $$("#actFeed .act-row").length;
      co.actVisible += 6;
      renderActivity();
      playStagger?.(shown);
      return;
    }
    if (t.closest("#logoDrop")) {
      if (!canEdit) return;
      // Open the real picker. The donor flashed the border and saved nothing.
      $<HTMLInputElement>("#logoFile")?.click();
      return;
    }
  });

  // ================= LOGO =================
  // Same rules as the classic LogoDropzone: images only, 2 MB ceiling, read to
  // a data URL. (Until Vercel Blob is configured that data URL IS the stored
  // value — `Organization.logoUrl` holds whatever the classic form stores.)
  const MAX_LOGO = 2 * 1024 * 1024;

  function readDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("Couldn’t read that file."));
      r.readAsDataURL(file);
    });
  }

  async function acceptLogo(file: File) {
    if (!canEdit) return;
    if (!file.type.startsWith("image/")) {
      saveLine("saveLogo", "Image files only", "err");
      return;
    }
    if (file.size > MAX_LOGO) {
      saveLine("saveLogo", "Too large — keep it under 2 MB", "err");
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await readDataUrl(file);
    } catch (err) {
      saveLine("saveLogo", actionError(err), "err");
      return;
    }
    const previous = co.logoUrl;
    // Optimistic: the picture appears while the write is in flight, and rolls
    // back if the server refuses.
    co.logoUrl = dataUrl;
    renderLogo();
    renderPreview();
    await commit("saveLogo", async () => {
      try {
        await updateBranding({ logoUrl: dataUrl });
      } catch (err) {
        co.logoUrl = previous;
        renderLogo();
        renderPreview();
        throw err;
      }
    });
  }

  const logoFile = $<HTMLInputElement>("#logoFile");
  if (logoFile) {
    on(logoFile, "change", () => {
      const f = logoFile.files?.[0];
      logoFile.value = "";
      if (f) void acceptLogo(f);
    });
  }

  const logoDrop = $("#logoDrop");
  if (logoDrop) {
    ["dragenter", "dragover"].forEach(function (ev) {
      on(logoDrop, ev, function (e) {
        e.preventDefault();
        if (canEdit) logoDrop.classList.add("over");
      });
    });
    on(logoDrop, "dragleave", function (e) {
      e.preventDefault();
      logoDrop.classList.remove("over");
    });
    on(logoDrop, "drop", function (e) {
      e.preventDefault();
      logoDrop.classList.remove("over");
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (f) void acceptLogo(f);
    });
  }

  // ================= INITIALIZATION =================
  safe("init", function () {
    renderCompany();
    if (!canEdit) {
      // Limited roles (worker / sales / estimator) can read the sheet; the
      // actions would reject every write, so say that once instead of turning
      // each keystroke into a server error.
      $$(".cf-in").forEach((el) => {
        (el as HTMLInputElement).readOnly = true;
      });
      $$(".tgl").forEach((el) => {
        (el as HTMLButtonElement).disabled = true;
      });
      ["saveBranding", "saveLogo", "saveLead", "saveLanding"].forEach((w) => {
        saveLine(w, "View only — ask an owner or manager", "");
      });
    }
  });

  // The mobile nav drawer and FLUID SCALE belong to the persistent chrome and
  // live in components/v3/blueprint-shell/shell-behavior.ts.

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The row cascade's curve now lives in blueprint-shell/list-motion, which
    // owns both halves of list motion for every blueprint page.

    // Reveal: load + scroll.
    // Reveal adapts to scroll speed: slow scroll gets the full 420ms
    // animation; fast scroll a short one — it keeps up but stays visible.
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
    const blocks = $$(".content > *");
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    // Second layer of the arrival — Overview cascades its `.kpi` strip here.
    // This page has no `.kpi`, so the layer was silently absent; its equivalent
    // small units are the settings cards. Skip anything the block cascade
    // already claimed: no element should carry `rv` and `rv-cell` at once.
    const cells = $$(".co-card").filter((el) => !el.classList.contains("rv"));
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
            // element below the fold: duration follows the current scroll speed
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

    // Entrance cascade — on ARRIVAL only: first paint, and the rows "Show more"
    // adds.
    //
    // This used to hang off a MutationObserver on #actFeed, so the whole feed
    // replayed its entrance on every category chip, every person select and
    // every KEYSTROKE in the activity search — the rows the user was reading
    // dropped to opacity 0 and crawled back once per letter typed. The second
    // observer, on #trades, was inert from the start: `animateRows` only ever
    // matched `.act-row`, and #trades holds `.trade` buttons, so it re-scanned
    // an empty set on every trade toggle. See blueprint-shell/list-motion.
    playStagger = (fromIndex = 0) => {
      const feed = $("#actFeed");
      if (!feed) return;
      staggerIn(Array.from(feed.querySelectorAll<HTMLElement>(".act-row")).slice(fromIndex));
    };
    playStagger();

    // KPI count-up
    $$(".kpi-val").forEach((el) => {
      const raw = (el.textContent || "").trim();
      const money = raw.charAt(0) === "$";
      const target = parseInt(raw.replace(/[^0-9]/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      function frame(t: number) {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        el.textContent = (money ? "$" : "") + Math.round(target * e).toLocaleString("en-US");
        if (pr < 1) raf(frame);
      }
      raf(frame);
    });

    // Press effects — delegated to `root` so nodes injected after init
    // (menu items, JS-rendered buttons, innerHTML re-renders) still press.
    function pressify(sel: string, cls: string) {
      on(root, "click", (e) => {
        const el = (e.target as Element).closest<HTMLElement>(sel);
        if (!el || !root.contains(el)) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      });
      on(root, "animationend", (e) => {
        const el = e.target as HTMLElement;
        if (el.matches && el.matches(sel)) el.classList.remove(cls);
      });
    }
    // Shell controls (.icon-btn, .sb-foot-*) press from the shell module.
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
    frames.forEach((id) => cancelAnimationFrame(id));
    frames.clear();
  };
}
