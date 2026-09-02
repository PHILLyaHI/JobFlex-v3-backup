"use client";

// ADMIN pages — the donor's MOTION SYSTEM "Balanced", the slice these pages use.
//
// Shared by /admin, /admin/traffic and /admin/subscribers so the three pages
// enter identically. Ported from the dashboard donor with its exact numbers:
//   · block reveal — content blocks cascade in (opacity 0→1, translateY 14→0,
//     stagger 60ms); below the fold the duration adapts to scroll speed;
//   · KPI cells — left to right (dy 5px, stagger 45ms, 160ms after the block);
//   · press feedback on `.btn` and anything carrying `data-press`.
//
// Dropped on purpose: the sidebar cascade, the graph-paper parallax and FLUID
// SCALE (all owned by the persistent shell), the MutationObserver row stagger
// (decisions.md, Session 3 — it replays on every filter keystroke) and the
// 750ms count-up (formatted numerals like "$1,234" do not count cleanly).

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

export function useAdminMotion() {
  const init = useCallback((content: HTMLElement) => {
    const disposers: Array<() => void> = [];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

    const vpH = window.innerHeight;
    const scrollHost = content.closest<HTMLElement>(".main");
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0;
    if (scrollHost) {
      const onScroll = () => {
        const now = performance.now();
        scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
        velLastY = scrollHost.scrollTop;
        velLastT = now;
      };
      scrollHost.addEventListener("scroll", onScroll, { passive: true });
      disposers.push(() => scrollHost.removeEventListener("scroll", onScroll));
    }

    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          const target = en.target as HTMLElement;
          if (target.dataset.rvScroll) {
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
    blocks.forEach((el) => io.observe(el));
    disposers.push(() => io.disconnect());

    // KPI cells: left to right, 160ms after their block lands.
    const cells = Array.from(content.querySelectorAll<HTMLElement>(".kpi"));
    cells.forEach((c) => c.classList.add("rv-cell"));
    const cellTimers = cells.map((c, i) => {
      const block = c.closest<HTMLElement>(".rv");
      const blockIdx = block ? blocks.indexOf(block) : 0;
      const delay = Math.max(0, blockIdx) * 60 + 160 + i * 45;
      return window.setTimeout(() => c.classList.add("rv-in"), delay);
    });
    disposers.push(() => cellTimers.forEach((t) => window.clearTimeout(t)));

    // Press feedback, delegated: the tables and filters re-render, so a
    // per-element bind would only ever cover what existed at mount.
    const onDown = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".btn, [data-press]");
      if (!el) return;
      el.classList.remove("pressed");
      void el.offsetWidth;
      el.classList.add("pressed");
    };
    const onEnd = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.classList?.contains("pressed")) el.classList.remove("pressed");
    };
    content.addEventListener("click", onDown);
    content.addEventListener("animationend", onEnd);
    disposers.push(() => {
      content.removeEventListener("click", onDown);
      content.removeEventListener("animationend", onEnd);
    });

    return () => disposers.forEach((d) => d());
  }, []);

  useBlueprintContent(init);
}
