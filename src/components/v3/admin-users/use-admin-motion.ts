"use client";

// ADMIN pages — the donor's MOTION SYSTEM — BALANCED, block reveal + press.
//
// The same port as job-detail-motion.ts: the `.content > *` reveal cascade with
// its scroll-velocity-adaptive duration, and delegated press feedback on the
// kit's `.btn`. Sidebar cascade, parallax and FLUID SCALE belong to the
// persistent chrome (blueprint-shell/shell-behavior.ts).
//
// ONE DEPARTURE: a `.mdl` sheet is a direct child of `.content` too, and it is
// `display: none` until opened. An IntersectionObserver never sees it, so it
// would keep `.rv` (opacity 0) forever and open invisible. Sheets are skipped.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

export function useAdminMotion(btnClass: string) {
  const init = useCallback(
    (content: HTMLElement) => {
      const disposers: Array<() => void> = [];
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

      const vpH = window.innerHeight;
      const scrollHost = content.closest<HTMLElement>(".main");
      let velLastY = scrollHost ? scrollHost.scrollTop : 0;
      let velLastT = performance.now();
      let scrollVel = 0; // px/ms
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

      const blocks = (Array.from(content.children) as HTMLElement[]).filter(
        (el) => !el.classList.contains("mdl"),
      );
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

      // Press feedback, delegated — rows and sheets re-render, a per-element
      // bind at init would miss every button rendered later.
      const onDown = (e: Event) => {
        const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("." + btnClass);
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
    },
    [btnClass],
  );

  useBlueprintContent(init);
}
