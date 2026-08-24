"use client";

import { useEffect, useState } from "react";

export function MobileCta() {
  const [scrolled, setScrolled] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 640);
      // Hide once the final CTA section has scrolled into (or past) view
      const target = document.getElementById("final-cta");
      if (target) {
        setCtaVisible(target.getBoundingClientRect().top < window.innerHeight);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const show = scrolled && !ctaVisible;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur transition-transform duration-300 md:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-4 px-5 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-bold leading-tight text-lp-ink">Free for 14 days</div>
          <div className="text-[12px] leading-tight text-slate-400">No card required</div>
        </div>
        <a href="#" className="lp-btn-dark h-12 flex-1 text-[16px] font-semibold">
          Start FREE Trial
        </a>
      </div>
    </div>
  );
}
