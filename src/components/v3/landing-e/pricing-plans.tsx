"use client";

import { useEffect, useRef, useState } from "react";
import { expandPlanFeatures, formatPlanPrice, planCtaLabel, priceCadence, type PlanDTO } from "@/lib/planCatalog";
import "./pricing-faq.css";

/* THE REGISTER'S PLAN CARDS ON THE LANDING (owner, 2026-09-26). A port of
   step 3 of signup ("Pick a plan.", auth-register-blueprint/register-content
   + auth-register.module.css `.pw-*`) as `lp-pw-*` in pricing-faq.css: mono
   plan name, 44px price, ONE shared feature list — ink tick where the plan
   has it, grey dash where it does not — and the card's own full-width start
   button. Everything is read from the live catalogue (getPlanCatalog on the
   server): expandPlanFeatures gives the shared rows and what each plan
   includes, formatPlanPrice / planCtaLabel the price and the button words.
   The register reads no `plan` param, so every button is the register link.

   On a phone (≤768px) the row is the register's swipe carousel: cards
   min(84vw, 340px), snap centre, the MOST-PICKED card centred on arrival,
   lists cut to six whole rows with "Show all N", and square dots under it. */
const PHONE = "(max-width: 768px)";
const CUT = 6;

function Check() {
  return (
    <svg className="lp-pw-ic" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}
function Minus() {
  return (
    <svg className="lp-pw-ic" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 12h12" />
    </svg>
  );
}

export function PricingPlans({ plans, registerHref }: { plans: PlanDTO[]; registerHref: string }) {
  const { rows, included } = expandPlanFeatures(plans);
  const heroIndex = Math.max(0, plans.findIndex((p) => p.highlight));
  const railRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const [active, setActive] = useState(heroIndex);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (slug: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const cardLeft = (rail: HTMLElement, i: number) => {
    const card = rail.children[i] as HTMLElement | undefined;
    if (!card) return 0;
    return Math.max(0, card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2);
  };

  /* Arrive on the most-picked card, centred — the register does the same.
     The section sits under content-visibility:auto, so the first pass may
     run before it is laid out; the observer repeats it as the rail comes
     near the viewport, unless the visitor has already swiped. */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const settle = () => {
      if (touched.current || !window.matchMedia(PHONE).matches) return;
      rail.scrollLeft = cardLeft(rail, heroIndex);
    };
    const mark = () => {
      touched.current = true;
    };
    settle();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          settle();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px 400px 0px" },
    );
    io.observe(rail);
    rail.addEventListener("pointerdown", mark, { passive: true });
    rail.addEventListener("touchstart", mark, { passive: true });
    rail.addEventListener("wheel", mark, { passive: true });
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const mid = rail.scrollLeft + rail.clientWidth / 2;
        let best = 0;
        let bestD = Infinity;
        Array.from(rail.children).forEach((el, i) => {
          const c = el as HTMLElement;
          const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        setActive(best);
      });
    };
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      rail.removeEventListener("pointerdown", mark);
      rail.removeEventListener("touchstart", mark);
      rail.removeEventListener("wheel", mark);
      rail.removeEventListener("scroll", onScroll);
    };
  }, [heroIndex]);

  const goTo = (i: number) => {
    const rail = railRef.current;
    if (!rail) return;
    touched.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left: cardLeft(rail, i), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <>
      <div className="lp-pw-plans" ref={railRef}>
        {plans.map((p) => {
          const has = included.get(p.slug) ?? new Set<string>();
          const isOpen = open.has(p.slug);
          const listId = `lp-pw-feats-${p.slug}`;
          return (
            <article key={p.slug} className={"lp-pw-plan" + (p.highlight ? " lp-pw-plan--hero" : "")}>
              {p.highlight ? <span className="lp-pw-tag">Most picked</span> : null}
              <h3 className="lp-pw-plan-n">{p.name}</h3>
              <p className="lp-pw-price">
                {formatPlanPrice(p.priceCents)}
                <i>{priceCadence(true)}</i>
              </p>
              <ul id={listId} className={"lp-pw-feats" + (isOpen ? " is-open" : "")}>
                {rows.map((f) => {
                  const on = has.has(f.toLowerCase());
                  return (
                    <li key={f} className={on ? "lp-pw-f" : "lp-pw-f lp-pw-f--no"}>
                      {on ? <Check /> : <Minus />}
                      <span className="sr-only">{on ? "Included: " : "Not included: "}</span>
                      {f}
                    </li>
                  );
                })}
              </ul>
              {rows.length > CUT ? (
                <button
                  type="button"
                  className="lp-pw-more"
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  onClick={() => toggle(p.slug)}
                >
                  {isOpen ? "Show less" : `Show all ${rows.length}`}
                </button>
              ) : null}
              <a href={registerHref} className="lp-pw-go" data-cta="pricing">
                {planCtaLabel(p.trialDays)}
                <span className="sr-only"> on {p.name}</span>
              </a>
            </article>
          );
        })}
      </div>
      {plans.length > 1 ? (
        <div className="lp-pw-dots">
          {plans.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              className="lp-pw-dot"
              aria-label={`Show the ${p.name} plan`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => goTo(i)}
            >
              <span aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
