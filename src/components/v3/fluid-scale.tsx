"use client";

// FLUID SCALE — the Blueprint responsiveness module from the reference shell
// (jobflex-page-styler donor). The reference composition is a MacBook 16"
// (1728 CSS px viewport); on any other screen the whole interface scales
// proportionally: typography, components, spacing keep the same ratios.
// At ≤860px the zoom resets to 1 and the page's mobile media rules take over.
// Bare 100vh/100dvh drifts under root zoom, so the real viewport height is
// published as --app-h — pages must write viewport heights via
// var(--app-h, 100vh). Renders nothing; mount it once per blueprint page.

import { useEffect } from "react";

export function FluidScale() {
  useEffect(() => {
    const BASE = 1728,
      MIN = 0.78,
      MAX = 1.35;
    const applyScale = () => {
      const z = window.innerWidth <= 860 ? 1 : Math.min(MAX, Math.max(MIN, window.innerWidth / BASE));
      document.documentElement.style.setProperty("zoom", String(z));
      document.documentElement.style.setProperty("--app-h", window.innerHeight / z + "px");
    };
    applyScale();
    window.addEventListener("resize", applyScale);
    return () => {
      window.removeEventListener("resize", applyScale);
      document.documentElement.style.removeProperty("zoom");
      document.documentElement.style.removeProperty("--app-h");
    };
  }, []);

  return null;
}
