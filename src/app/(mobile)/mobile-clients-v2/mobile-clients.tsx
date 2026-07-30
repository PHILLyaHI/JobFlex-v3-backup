"use client";

// MOBILE CLIENTS (mobile-clients-v2) — Blueprint system, handheld build.
//
// Ported from the scratchpad donor jobflex-clients-mobile-blueprint.html.
// Tokens, palette, type scale and Motion System "Balanced" are the reference
// dashboard's; the shell (topbar / hamburger drawer / bottom sheets) is the
// same one as mobile-v2 and mobile-proposals-v2, so the three handheld
// surfaces are one product.
//
// Every component of the desktop clients sheet is covered:
//  · CRM head + the New-client action
//  · computed masthead (one numeral + mono kicker + EXACTLY two annotations)
//  · the tag chip rail, as one dropdown (plus VIP and Untagged)
//  · the 7-column table, re-cut as row cards with initials avatars
//  · VIP state, multi-tag rows, and the untagged case
//  · pager, and BOTH empty states (no clients / no matches)
//  · the "⋮" menu as a bottom sheet: 5 tonal boxes, one disabled, one danger
//  · the create-client modal as a bottom sheet, with required-field validation
//    and the drawn VIP toggle
//
// What changes versus the desktop sheet, and why:
//  · A search box is added. It is the one thing the desktop leaves to the
//    global topbar, and on a phone paging through eighteen records to reach a
//    named client is the whole job. It filters the same fixture client-side —
//    no new endpoint.
//  · "Updated" is dropped from the row. It was noise on the proposals ledger
//    for the same reason and lives in the sheet instead.
//  · Page size 12 → 8: a handheld row is three lines tall.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-clients.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import {
  ALL,
  CLIENTS_SEED,
  PAGE_SIZE,
  UNTAGGED,
  VIP,
  allTags,
  initials,
  matchesQuery,
  matchesTag,
  tagCount,
  type Client,
} from "./clients-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** 750ms easeOutCubic. tabular-nums keep the digit columns from jumping. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = money(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = money(value * (1 - Math.pow(1 - pr, 3)));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {money(value)}
    </div>
  );
}

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

export function MobileClients() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<Client[]>(() =>
    CLIENTS_SEED.map((c) => ({ ...c, tags: [...c.tags] })),
  );
  const [tag, setTag] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  /* ---- new-client form ---- */
  const [form, setForm] = useState({ name: "", email: "", address: "", tags: "" });
  const [vipDraft, setVipDraft] = useState(false);
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const filterRef = useRef<HTMLDivElement>(null);

  /* ---------- viewport height ------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll, so the real value is republished rather
     than trusting a bare 100vh/100dvh. This is the React form of the donor's
     FLUID SCALE module — no root zoom, since the composition here is already
     the handheld one. */
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  /* ---------- Motion: reveal on load + adaptive reveal on scroll -------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;

    let velLastY = host.scrollTop;
    let velLastT = performance.now();
    let vel = 0;
    const onScroll = () => {
      const now = performance.now();
      vel = Math.abs(host.scrollTop - velLastY) / Math.max(1, now - velLastT);
      velLastY = host.scrollTop;
      velLastT = now;
    };
    host.addEventListener("scroll", onScroll, { passive: true });

    const vpH = window.innerHeight;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add(styles.rv);
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${i * 60}ms` : "200ms";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          // Below the fold: duration follows scroll speed — slow ≈ 900ms,
          // fast never shorter than 550ms.
          if (t.dataset.rvScroll) {
            t.style.transitionDuration = `${Math.round(Math.max(550, 900 - vel * 160))}ms`;
          }
          t.classList.add(styles.rvIn);
          io.unobserve(t);
          const done = () => {
            t.style.transitionDelay = "";
            t.style.transitionDuration = "";
            t.removeEventListener("transitionend", done);
          };
          t.addEventListener("transitionend", done);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      host.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* ---------- Motion: graph-paper parallax ----------------------------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    if (!host) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        host.style.setProperty("--gy", `${(-(host.scrollTop * 0.06)).toFixed(1)}px`);
        ticking = false;
      });
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => host.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- Motion: press stamp (delegated, covers late rows) --------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const sel = [
      styles.btn, styles.ddBtn, styles.ddItem, styles.pagerBtn, styles.cmenuItem,
      styles.sheetCancel, styles.crowOpen, styles.fchk,
      styles.cemptyA, styles.srchX,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);


  /* ---------- Esc closes whatever is topmost --------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (newOpen) setNewOpen(false);
      else if (sheetId) setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, newOpen, sheetId]);

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the book ----------------
     In an effect, not the click handler: the ref must not be read during
     render, and the scroll belongs to the page CHANGE. First run skipped so
     mounting doesn't scroll. */
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [page]);

  /* ---------- The one blue flash on a record you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- derived ------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((c) => matchesTag(c, tag) && matchesQuery(c, query)),
    [data, tag, query],
  );
  const pipeline = useMemo(() => data.reduce((a, c) => a + c.pipelineValue, 0), [data]);
  const proposals = useMemo(() => data.reduce((a, c) => a + c.proposalCount, 0), [data]);

  /* The desktop rail's real labels, plus VIP and Untagged: both are states the
     book actually holds, and both are things you look for on a phone. */
  const options = useMemo(
    () => [
      { k: ALL, l: "All clients" },
      { k: VIP, l: "VIP" },
      ...allTags(data).map((t) => ({ k: t, l: t })),
      { k: UNTAGGED, l: "Untagged" },
    ],
    [data],
  );
  const activeOption = options.find((o) => o.k === tag) ?? options[0];

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sheetClient = sheetId === null ? null : (data.find((c) => c.id === sheetId) ?? null);

  const resetFilters = () => {
    setTag(ALL);
    setQuery("");
    setPage(1);
  };

  /* ---------- row sheet ------------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const c = sheetClient;
    if (!c) return [];
    return [
      { act: "open", icon: "i-users", tone: styles.cmiBp, title: "Open client", sub: "Full record and history" },
      { act: "prop", icon: "i-file", tone: styles.cmiSky, title: "New proposal", sub: `Start one for ${c.name}` },
      { act: "mail", icon: "i-mail", tone: styles.cmiOk, title: "Send email",
        sub: c.email ?? "No email on file", disabled: !c.email },
      { act: "dir", icon: "i-pin", tone: styles.cmiWarn, title: "Get directions", sub: `${c.address} — open in maps` },
      { act: "vip", icon: "i-badge", title: c.vip ? "Remove VIP" : "Mark as VIP",
        sub: c.vip ? "Drops priority scheduling" : "Priority scheduling" },
      { act: "del", icon: "i-trash", tone: styles.cmiDanger, title: "Delete client",
        sub: "Removes the record permanently", danger: true },
    ];
  }, [sheetClient]);

  const runMenu = (act: string) => {
    const c = sheetClient;
    setSheetId(null);
    if (!c) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== c.id));
    } else if (act === "vip") {
      setData((prev) => prev.map((x) => (x.id === c.id ? { ...x, vip: !x.vip } : x)));
      setLandedId(c.id);
    }
  };

  /* ---------- new-client form ------------------------------------------ */
  const openNew = () => {
    setForm({ name: "", email: "", address: "", tags: "" });
    setVipDraft(false);
    setNameErr(false);
    setNewOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    window.setTimeout(() => nameRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    const rec: Client = {
      id: `c-new-${data.length}-${name.length}`,
      name,
      email: form.email.trim() || null,
      address: form.address.trim() || "—",
      proposalCount: 0,
      pipelineValue: 0,
      vip: vipDraft,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      updated: "now",
    };
    setData((prev) => [rec, ...prev]);
    resetFilters();
    setNewOpen(false);
    setLandedId(rec.id);
  };

  const anyOverlay = Boolean(sheetClient) || newOpen;

  return (
    <div className={styles.app} onClick={onRootClick}>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>CRM</div>
            <h1 className={styles.pageTitle}>Clients</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openNew}>
                <Icon id="i-plus" />New client
              </button>
            </div>
          </div>

          {/* MASTHEAD */}
          <div className={styles.cmast}>
            <div className={styles.cmastTop}>
              <div className={styles.cmastLbl}>
                Book value · open pipeline
                <span className={styles.cmastRule} />
              </div>
              <CountUp value={pipeline} className={styles.cmastVal} />
            </div>
            <div className={styles.cmastCnt}>
              <div className={styles.cmastSub}>
                <div className={styles.cmastSubL}>Clients</div>
                <div className={styles.cmastSubV}>{data.length}</div>
              </div>
              <div className={styles.cmastSub}>
                <div className={styles.cmastSubL}>Proposals</div>
                <div className={styles.cmastSubV}>{proposals}</div>
              </div>
            </div>
          </div>

          {/* FIND BAR — search + tag filter */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search name, city or tag…"
                autoComplete="off"
                aria-label="Search clients"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              {query ? (
                <button className={styles.srchX} type="button" aria-label="Clear search"
                  onClick={() => { setQuery(""); setPage(1); }}>
                  <Icon id="i-x" />
                </button>
              ) : null}
            </label>

            <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
              <button className={styles.ddBtn} type="button" aria-haspopup="listbox"
                aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
                <Icon id="i-filter" />
                Filter
                <span className={`${styles.ddValue} ${tag === ALL ? styles.isAll : ""}`}>
                  {activeOption.l} · {tagCount(data, tag)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {options.map((o) => (
                  <button key={o.k} className={`${styles.ddItem} ${tag === o.k ? styles.active : ""}`}
                    type="button" role="option" aria-selected={tag === o.k}
                    onClick={() => { setTag(o.k); setPage(1); setFilterOpen(false); }}>
                    {o.l}
                    <span className={styles.ddCount}>{tagCount(data, o.k)}</span>
                    {tag === o.k ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CLIENT BOOK */}
          {visible.length === 0 ? (
            <div className={styles.cempty}>
              {data.length === 0 ? (
                <>
                  <div className={styles.cemptyT}>No clients yet</div>
                  <div className={styles.cemptyS}>
                    Send your first proposal and a client is created automatically.
                  </div>
                  <button className={styles.cemptyA} type="button" onClick={openNew}>
                    <Icon id="i-plus" />New client
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.cemptyT}>No matches</div>
                  <div className={styles.cemptyS}>No client matches that search and filter.</div>
                  <button className={styles.cemptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.book}>
              {slice.map((c, i) => (
                <div
                  key={c.id}
                  className={`${styles.crow} ${styles.rowIn} ${landedId === c.id ? styles.landed : ""}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className={`${styles.cav} ${c.vip ? styles.isVip : ""}`}>{initials(c.name)}</span>
                  <div className={styles.cname}>{c.name}</div>
                  <button className={styles.crowOpen} type="button"
                    aria-label={`Actions for ${c.name}`} onClick={() => setSheetId(c.id)}>
                    <Icon id="i-dots" />
                  </button>
                  <div className={styles.cwhere}>{c.address}</div>
                  <div className={styles.crowFoot}>
                    <span className={styles.crowTags}>
                      {c.vip ? <span className={`${styles.tag} ${styles.isVip}`}>VIP</span> : null}
                      {c.tags.length ? (
                        c.tags.map((t) => (
                          <span className={styles.tag} key={t}>{t}</span>
                        ))
                      ) : (
                        <span className={`${styles.tag} ${styles.isNone}`}>No tags</span>
                      )}
                    </span>
                    <span className={styles.crowFigs}>
                      <span className={styles.cprop}>{c.proposalCount} prop</span>
                      <span className={`${styles.cpipe} ${c.pipelineValue ? "" : styles.isZero}`}>
                        {c.pipelineValue ? money(c.pipelineValue) : "—"}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PAGER */}
          {visible.length > PAGE_SIZE ? (
            <div className={styles.pager}>
              <button className={styles.pagerBtn} type="button" disabled={safePage <= 1}
                onClick={() => setPage(Math.max(1, safePage - 1))}>
                <Icon id="i-chevl" />Prev
              </button>
              <button className={styles.pagerBtn} type="button" disabled={safePage >= pages}
                onClick={() => setPage(Math.min(pages, safePage + 1))}>
                Next<Icon id="i-chevr" />
              </button>
              <span className={styles.pagerInfo}>{safePage} / {pages}</span>
            </div>
          ) : null}
        </div>
      </main>


      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setNewOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetClient ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Client actions" aria-hidden={!sheetClient}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>
            {sheetClient
              ? `${sheetClient.proposalCount} proposals · ${sheetClient.pipelineValue ? money(sheetClient.pipelineValue) : "nothing open"} · upd ${sheetClient.updated}`
              : "Client · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetClient?.name ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.cmenuItem} ${r.danger ? styles.cmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.cmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.cmenuItemT}>{r.title}</span>
                <span className={styles.cmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ NEW CLIENT SHEET ============ */}
      <div className={`${styles.sheet} ${newOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mcNewTitle" aria-hidden={!newOpen}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>CRM / new record</div>
          <div className={styles.sheetTitle} id="mcNewTitle">New client</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mcNewForm" noValidate onSubmit={submitNew}>
          <div className={`${styles.fld} ${nameErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mcName">
              Client name<span className={styles.req}>*</span>
            </label>
            <input ref={nameRef} className={styles.pinput} id="mcName" name="name" type="text"
              placeholder="D. Reyes" autoComplete="off" value={form.name}
              aria-invalid={nameErr} aria-describedby={nameErr ? "mcNameErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                if (e.target.value.trim()) setNameErr(false);
              }} />
            {nameErr ? <span className={styles.fldErr} id="mcNameErr">Enter a client name</span> : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcEmail">Email</label>
            <input className={styles.pinput} id="mcEmail" name="email" type="email"
              placeholder="d.reyes@mail.com" autoComplete="off" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcAddress">Location</label>
            <input className={styles.pinput} id="mcAddress" name="address" type="text"
              placeholder="Kirkland, WA" autoComplete="off" value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcTags">Tags</label>
            <input className={styles.pinput} id="mcTags" name="tags" type="text"
              placeholder="Fencing, Repeat" autoComplete="off" value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
            <span className={styles.fldHint}>
              Comma-separated — they become this page&apos;s filter options.
            </span>
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Account</span>
            <button className={styles.fchk} type="button" aria-pressed={vipDraft}
              onClick={() => setVipDraft((v) => !v)}>
              <span className={styles.fchkBox}><Icon id="i-check" /></span>
              Mark as VIP
              <span className={styles.fchkSub}>priority</span>
            </button>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mcNewForm">
            <Icon id="i-check" />Create client
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SVG SPRITE — line icons 24×24, stroke 2, currentColor. Only
   original lucide paths; i-bulb is the reference's hand-drawn
   "switched-on" bulb (Smart Proposal).
   ============================================================ */