"use client";

import { useEffect } from "react";

/* The below-the-fold atmosphere plates (intro truck, field frame, closing
   roofline) are CSS backgrounds, and a CSS background is fetched the moment
   its rule applies — all three used to download with the hero, 6.5 MB of
   pictures nobody had scrolled to. Their rules in landing-d.css now set the
   image only on `.lp-bg.is-near`; this marks a plate "near" once it is within
   one screen of the viewport. Renders nothing. Without JavaScript the plates
   simply stay off, which is what a page that never scrolls sees anyway. */
export function LazyBg() {
  useEffect(() => {
    const plates = Array.from(document.querySelectorAll<HTMLElement>(".lp-bg[data-lazy]"));
    if (!plates.length) return;
    if (!("IntersectionObserver" in window)) {
      plates.forEach((el) => el.classList.add("is-near"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-near");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "100% 0px" },
    );
    plates.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
