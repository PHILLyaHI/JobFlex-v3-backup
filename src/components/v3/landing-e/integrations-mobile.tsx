"use client";

import { useEffect, useRef } from "react";
import { loadGsap, whenNear } from "./gsap-lazy";

/* THE FIVE REAL INTEGRATIONS (owner, 2026-09-26). Stripe, Square and Stax take
   the client's payments, Meta brings the leads in, and email goes out through
   the contractor's own Gmail — nothing else is drawn, so the tiles never claim
   an app the product does not connect to. The marks are the brands' own
   (sources and colours: public/integrations/README.md). They are drawn once,
   as symbols in <BrandSprite />, and every tile — the desktop field and both
   phone marquees — points at them with <use>, so the marquee's repeats cost a
   line of markup each rather than a copy of the path. Brand colours are brand
   data, kept here and nowhere else. */

export type Brand = "stripe" | "square" | "stax" | "meta" | "gmail";

/** Tile ground: Stripe and Stax wear their app icons (mark on a brand fill);
 *  the other three sit on the white tile in their own colours. */
export const BRAND_TILE: Record<Brand, string> = {
  stripe: "bg-[#635BFF]",
  stax: "bg-[#062333]",
  square: "bg-white",
  meta: "bg-white",
  gmail: "bg-white",
};

/** The brand's mark, sized by the caller. Needs <BrandSprite /> on the page. */
export function BrandMark({ name, className = "" }: { name: Brand; className?: string }) {
  return (
    <svg className={className} aria-hidden focusable="false">
      <use href={`#lp-int-${name}`} />
    </svg>
  );
}

/** The five symbols, rendered once by the Integrations section. */
export function BrandSprite() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <symbol id="lp-int-stripe" viewBox="0 0 24 24">
          <path
            fill="#fff"
            d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"
          />
        </symbol>
        <symbol id="lp-int-square" viewBox="0 0 24 24">
          <path
            fill="#3E4348"
            d="M4.01 0A4.01 4.01 0 000 4.01v15.98c0 2.21 1.8 4 4.01 4.01h15.98C22.2 24 24 22.2 24 19.99V4A4.01 4.01 0 0019.99 0H4zm1.62 4.36h12.74c.7 0 1.26.57 1.26 1.27v12.74c0 .7-.56 1.27-1.26 1.27H5.63c-.7 0-1.26-.57-1.26-1.27V5.63a1.27 1.27 0 011.26-1.27zm3.83 4.35a.73.73 0 00-.73.73v5.09c0 .4.32.72.72.72h5.1a.73.73 0 00.73-.72V9.44a.73.73 0 00-.73-.73h-5.1Z"
          />
        </symbol>
        {/* Stax's striped X, the `stax-logo-x` path of the staxpayments.com
            header logo, framed square on its own centre. */}
        <symbol id="lp-int-stax" viewBox="103.107 -0.473 15.4 15.4">
          <path
            fill="#B93BE4"
            d="M103.627 5.5172V6.75118L107.083 8.47579L103.627 10.2004V11.4344L109.571 8.47579L103.627 5.5172ZM103.627 12.6535V13.8875L110.807 10.3193L117.988 13.8875V12.6535L110.807 9.08534L103.627 12.6535ZM110.807 4.13455L103.627 0.566406V1.80039L110.807 5.36853L117.988 1.80039V0.566406L110.807 4.13455ZM117.988 8.95154V7.71756L114.532 5.99295L117.988 4.26835V3.03437L112.044 5.99295L117.988 8.95154ZM103.627 4.26835L117.988 11.4195V10.1855L103.627 3.03437V4.26835Z"
          />
        </symbol>
        <symbol id="lp-int-meta" viewBox="0 0 24 24">
          <path
            fill="#0467DF"
            d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
          />
        </symbol>
        {/* Google's own four-colour Gmail mark (2020), cropped to the M. */}
        <symbol id="lp-int-gmail" viewBox="6 6 180 180">
          <path d="M8,46v16l18.35,17.76L48,92l4-26.93L48,40l-11.2-8.4C24.93,22.7,8,31.17,8,46" fill="#C5221F" />
          <path d="M144,40l-4,25.4l4,26.6l19.65-9.73L184,62V46c0-14.83-16.93-23.3-28.8-14.4L144,40z" fill="#FBBC04" />
          <path d="M20,160h28V92L8,62v86C8,154.63,13.37,160,20,160" fill="#4285F4" />
          <path d="M144,160h28c6.63,0,12-5.37,12-12V62l-40,30V160z" fill="#34A853" />
          <polygon fill="#EA4335" points="96,76 48,40 48,92 96,128 144,92 144,40" />
        </symbol>
      </defs>
    </svg>
  );
}

/* Phone: two counter-scrolling rows of the five marks + the headline */

const TILE =
  "flex h-16 w-16 shrink-0 items-center justify-center lp-int-tile ring-1 ring-lp-blue/25 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_10px_24px_-12px_rgb(15_23_42/0.16)]";

const ROW_A: Brand[] = ["stripe", "meta", "square", "gmail", "stax"];
const ROW_B: Brand[] = ["gmail", "stax", "stripe", "square", "meta"];
/* Five tiles are 380 px — narrower than a phone. Each half of a track repeats
   the row three times (1,140 px), so the loop never shows its end on any
   screen that gets this layout (under 1024 px). */
const REPEAT = 3;

function Marquee({ names, reverse }: { names: Brand[]; reverse?: boolean }) {
  const run = Array.from({ length: REPEAT }, () => names).flat();
  return (
    /* The vertical padding is load-bearing (owner, 2026-08-25): overflow-hidden
       clips on every axis, so with the row exactly one tile tall the ring and
       the drop shadow were being cut off the top and bottom edges while the
       sides kept theirs. The negative margin gives the padding back to the
       layout so the two rows keep their spacing. */
    <div className="-my-4 overflow-hidden py-4">
      <div
        className={`flex w-max items-center will-change-transform ${
          reverse ? "int-track-b" : "int-track-a"
        }`}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-3 pr-3">
            {run.map((n, i) => (
              <span key={`${n}-${i}`} className={`${TILE} ${BRAND_TILE[n]}`}>
                <BrandMark name={n} className="h-8 w-8" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function IntegrationsMobile({ registerHref }: { registerHref: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = root.querySelector<HTMLElement>(".int-track-a");
    const b = root.querySelector<HTMLElement>(".int-track-b");
    if (!a || !b) return;

    // The marquees are built when the section comes near, with gsap from the
    // first move (gsap-lazy.ts) — not all at once on the first scroll. The
    // durations keep the old drift (~15 px/s) over the longer tracks.
    let alive = true;
    const created: { kill(): void }[] = [];
    void whenNear(root).then(loadGsap).then(({ gsap, ScrollTrigger }) => {
      if (!alive) return;
      const loopA = gsap.to(a, { xPercent: -50, ease: "none", duration: 75, repeat: -1 });
      gsap.set(b, { xPercent: -50 });
      const loopB = gsap.to(b, { xPercent: 0, ease: "none", duration: 85, repeat: -1 });
      const loops = [loopA, loopB];
      created.push(...loops);

      // Scroll velocity accelerates both marquees, then they ease back
      created.push(ScrollTrigger.create({
        trigger: root,
        start: "top bottom",
        end: "bottom top",
        onUpdate(self) {
          const boost = Math.min(Math.abs(self.getVelocity()) / 300, 3);
          loops.forEach((loop) =>
            gsap
              .timeline({ overwrite: true })
              .to(loop, { timeScale: 1 + boost, duration: 0.2 })
              .to(loop, { timeScale: 1, duration: 1, ease: "power2.out" })
          );
        },
      }));
    });

    return () => {
      alive = false;
      created.forEach((c) => c.kill());
    };
  }, []);

  return (
    <div ref={rootRef} className="w-full lg:hidden">
      {/* Counter-scrolling tile rows — decoration; the paragraph names the apps */}
      <div className="-mx-5 space-y-4 pb-1 pt-2" aria-hidden>
        <Marquee names={ROW_A} />
        <Marquee names={ROW_B} reverse />
      </div>

      <div className="mt-9 text-center">
        <h2 className="text-[24px] font-bold leading-[1.2] tracking-[-0.015em] text-ink">
          Integrate your apps&rsquo; data into JobFlex.
        </h2>
        <p className="mx-auto mt-3 max-w-[22rem] text-[15px] leading-[1.5] text-[#555555]">
          Payments through Stripe, Square or Stax. Leads from Meta. Email from your own Gmail.
        </p>
        <a href={registerHref} className="lp-btn-lime mt-6 w-full sm:w-auto" data-cta="integrations">
          Connect your app to JobFlex
          <span aria-hidden>→</span>
        </a>
      </div>
    </div>
  );
}
