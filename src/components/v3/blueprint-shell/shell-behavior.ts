// Blueprint shell — the donor behaviors that belong to the PERSISTENT chrome:
// FLUID SCALE, the mobile nav drawer, the sidebar entry cascade, the sliding
// active-item indicator, the graph-paper parallax, and press feedback on
// shell controls. Every duration, easing and stagger is the donor's exact
// value.
//
// These run ONCE, from the shared layout. Because the shell no longer
// unmounts on navigation, the sidebar cascade plays on first load only —
// which is the whole point: moving between blueprint pages now animates the
// content, not the furniture.
//
// Page-level motion (reveal, count-up, row stagger) lives in page-motion.ts
// and re-runs per page.

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export type ShellHandle = {
  /** Tear down every listener/observer this module registered. */
  destroy: () => void;
  /** Re-point the sliding plate at whichever item React marked `active`. */
  syncIndicator: () => void;
};

export function initBlueprintShell(root: HTMLElement): ShellHandle {
  const disposers: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, fn: EventListener, o?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn, o);
    disposers.push(() => t.removeEventListener(ev, fn, o));
  };
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // ================= MOBILE NAV DRAWER =================
  (function () {
    const burger = $("#navBurger");
    const sb = $(".sb");
    const overlay = $("#sbOverlay");
    if (!burger || !sb || !overlay) return;
    const setNav = (open: boolean) => {
      sb.classList.toggle("open", open);
      overlay.classList.toggle("on", open);
    };
    burger.addEventListener("click", () => setNav(!sb.classList.contains("open")));
    overlay.addEventListener("click", () => setNav(false));
    sb.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".sb-link")) setNav(false);
    });
  })();

  // ================= FLUID SCALE =================
  // Reference composition — MacBook 16" (1728 CSS px viewport). On any other
  // screen the whole interface scales proportionally: typography, components,
  // spacing and the sidebar keep the same ratios. Zoom is applied to the shell
  // root (not documentElement) so it cannot leak into the rest of the app.
  (function () {
    const BASE = 1728,
      MIN = 0.78,
      MAX = 1.35;
    const applyScale = () => {
      const raw = window.innerWidth <= 860 ? 1 : Math.min(MAX, Math.max(MIN, window.innerWidth / BASE));
      // Sharpness (owner, 2026-08-18): a zoom like 1.0098 (1745px window) puts
      // EVERY font on a fractional pixel size and softens all type, while the
      // ≤2% size difference from true 1:1 is imperceptible. Snap the band to 1
      // so near-reference windows rasterize text on exact pixels.
      const z = Math.abs(raw - 1) < 0.02 ? 1 : raw;
      root.style.setProperty("zoom", String(z));
      // 100vh diverges from the real window under zoom != 1 — set it explicitly
      root.style.setProperty("--app-h", window.innerHeight / z + "px");
    };
    applyScale();
    on(window, "resize", applyScale);
    disposers.push(() => {
      root.style.removeProperty("zoom");
      root.style.removeProperty("--app-h");
    });
  })();

  // ================= SIDEBAR CASCADE + PARALLAX + PRESS =================
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // Sidebar cascade — first mount only, by construction.
    $$(".sb-sec-label, .sb-link").forEach((el, i) => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-8px)";
      el.style.transition =
        "opacity 320ms " + EASE + " " + i * 22 + "ms, transform 320ms " + EASE + " " + i * 22 + "ms";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.opacity = "";
          el.style.transform = "";
        }),
      );
      el.addEventListener("transitionend", () => { el.style.transition = ""; }, { once: true });
    });

    // Press feedback on shell controls
    $$(".topbar .btn, .icon-btn, .sb-foot-ic, .sb-foot-acc").forEach((el) => {
      el.addEventListener("click", () => {
        el.classList.remove("pressed");
        void el.offsetWidth;
        el.classList.add("pressed");
      });
      el.addEventListener("animationend", () => el.classList.remove("pressed"));
    });

    // Graph-paper parallax
    const mainEl = $(".main");
    if (mainEl) {
      let ticking = false;
      mainEl.addEventListener(
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            mainEl.style.setProperty("--gy", (-(mainEl.scrollTop * 0.06)).toFixed(1) + "px");
            ticking = false;
          });
        },
        { passive: true },
      );
    }
  }

  // ================= SLIDING ACTIVE INDICATOR =================
  const sbIndicator = $("#sbIndicator");
  const moveIndicator = (link: HTMLElement | null) => {
    if (!link || !sbIndicator) return;
    sbIndicator.style.top = link.offsetTop + "px";
    sbIndicator.style.height = link.offsetHeight + "px";
  };
  // Real routes navigate; only the donor's dead "#" links swallow the click.
  // The plate slides either way, so the animation plays on every item — on a
  // real navigation it gives instant feedback while the next page streams in,
  // and React then re-renders `active` onto the matching item.
  $$(".sb-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (link.getAttribute("href") === "#") e.preventDefault();
      $$(".sb-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      moveIndicator(link);
    });
  });
  moveIndicator($(".sb-link.active"));
  requestAnimationFrame(() => sbIndicator && sbIndicator.classList.add("ready"));
  on(window, "load", () => moveIndicator($(".sb-link.active")));
  document.fonts?.ready.then(() => moveIndicator($(".sb-link.active")));

  return {
    destroy: () => disposers.forEach((d) => d()),
    // After a route change React swaps which item carries `active`; the plate
    // follows it, and because .ready carries the transition it reads as a slide.
    syncIndicator: () => moveIndicator($(".sb-link.active")),
  };
}
