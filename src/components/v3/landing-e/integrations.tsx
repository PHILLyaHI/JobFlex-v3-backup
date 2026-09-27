"use client";

import { useEffect, useRef } from "react";
import { loadGsap } from "./gsap-lazy";
import { BRAND_TILE, BrandMark, BrandSprite, IntegrationsMobile, type Brand } from "./integrations-mobile";
import { Reveal } from "./reveal";
import { REGISTER } from "./routes";

const TILE = "float-tile absolute flex items-center justify-center lp-int-tile shadow-lp-tile ring-1 ring-lp-blue/25";

/* The five real integrations (owner, 2026-09-26), three on one side of the
   headline and two on the other, sized and spaced so both sides weigh alike. */
const SPOTS: Record<"left" | "right", { name: Brand; size: number; mark: number; pos: React.CSSProperties }[]> = {
  left: [
    { name: "stripe", size: 88, mark: 44, pos: { left: "6%", top: "12%" } },
    { name: "meta", size: 76, mark: 40, pos: { left: "44%", top: "36%" } },
    { name: "stax", size: 80, mark: 44, pos: { left: "14%", top: "66%" } },
  ],
  right: [
    { name: "square", size: 84, mark: 42, pos: { right: "10%", top: "18%" } },
    { name: "gmail", size: 88, mark: 46, pos: { right: "34%", top: "58%" } },
  ],
};

function Tiles({ side }: { side: "left" | "right" }) {
  return (
    <div className="pointer-events-auto absolute inset-y-0 hidden w-[30%] lg:block" style={side === "left" ? { left: 0 } : { right: 0 }}>
      {SPOTS[side].map((s) => (
        <span key={s.name} className={`${TILE} ${BRAND_TILE[s.name]}`} style={{ ...s.pos, width: s.size, height: s.size }}>
          <span className="block" style={{ width: s.mark, height: s.mark }}>
            <BrandMark name={s.name} className="block h-full w-full" />
          </span>
        </span>
      ))}
    </div>
  );
}

export function Integrations({ registerHref = REGISTER }: { registerHref?: string }) {
  const fieldRef = useRef<HTMLDivElement>(null);

  // Cursor repulsion: tiles drift away from an approaching pointer, then settle back
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const tiles = Array.from(field.querySelectorAll<HTMLElement>(".float-tile"));
    // gsap arrives on the first move (gsap-lazy.ts); until then the tiles sit still.
    let setters: { x: (v: number) => void; y: (v: number) => void }[] = [];
    let alive = true;
    void loadGsap().then(({ gsap }) => {
      if (!alive) return;
      setters = tiles.map((t) => ({
        x: gsap.quickTo(t, "x", { duration: 0.5, ease: "power2.out" }),
        y: gsap.quickTo(t, "y", { duration: 0.5, ease: "power2.out" }),
      }));
    });

    const RADIUS = 220;
    const PUSH = 22;

    const onMove = (e: PointerEvent) => {
      if (!setters.length) return;
      tiles.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - e.clientX;
        const dy = cy - e.clientY;
        const dist = Math.hypot(dx, dy);
        if (dist < RADIUS && dist > 0.01) {
          const force = (1 - dist / RADIUS) * PUSH;
          setters[i].x((dx / dist) * force);
          setters[i].y((dy / dist) * force);
        } else {
          setters[i].x(0);
          setters[i].y(0);
        }
      });
    };
    const onLeave = () => setters.forEach((s) => (s.x(0), s.y(0)));

    field.addEventListener("pointermove", onMove);
    field.addEventListener("pointerleave", onLeave);
    return () => {
      alive = false;
      field.removeEventListener("pointermove", onMove);
      field.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section id="integrations" className="relative flex flex-col items-center bg-white px-5 pb-[10vmin] pt-[6vmin] max-sm:pb-[18vmin] max-sm:pt-[12vmin] sm:px-6 lg:pt-[4vmin]">
      <div ref={fieldRef} className="relative mx-auto w-full max-w-[92rem]">
        <BrandSprite />
        <Tiles side="left" />
        <Tiles side="right" />
        <Reveal>
          <IntegrationsMobile registerHref={registerHref} />
          <div className="mx-auto hidden max-w-[36rem] flex-col items-center justify-center text-center lg:flex lg:min-h-[420px]">
            <h2 className="lp-eyebrow text-[#666666]">Integrations</h2>
            <p className="mt-4 text-[clamp(30px,3vw,42px)] font-bold leading-[1.15] tracking-[-0.015em] text-ink">
              Integrate your apps&rsquo; data into JobFlex.
            </p>
            <p className="mt-5 text-[19px] leading-[1.55] text-[#555555]">
              Payments through Stripe, Square or Stax. Leads from Meta. Email from your own Gmail.
            </p>
            <a href={registerHref} className="lp-btn-lime mt-8" data-cta="integrations">
              Connect your app to JobFlex
              <span aria-hidden>→</span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
