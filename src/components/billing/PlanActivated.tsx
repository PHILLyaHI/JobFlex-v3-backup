"use client";

/* THE MOMENT THE PLAN TURNS ON.
 *
 * One shot, 1.5 s, on the two screens where a plan actually becomes active:
 * the signup Done panel after Stripe, and the upgrade return leg (desktop and
 * handheld). A stamp lands with a slight overshoot — the landing's stamp, in
 * the house's own `--ease-soft` curve rather than gsap's CustomEase, so the
 * dashboard bundle gains no landing-e edge and nothing is waiting on a
 * dynamic import inside a screen that redirects after five seconds — and a
 * short rain of drawing-grid glyphs falls behind it on a canvas.
 *
 * It never blocks anything: the whole overlay is pointer-events: none and it
 * unmounts itself when it is done. Under prefers-reduced-motion the rain is
 * not drawn at all and the stamp simply appears, as the owner asked.
 */

import { useEffect, useRef, useState } from "react";
import styles from "./plan-activated.module.css";

/** How long the whole thing lives, ms. The signup screen redirects at 5 s. */
const LIFE_MS = 1500;
/** The glyphs of the drawing grid the rain is made of. */
const GLYPHS = ["│", "─", "┼", "╵", "·", "+", "×", "0", "1", "/", "\\", "="];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function rain(canvas: HTMLCanvasElement, until: number): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.scale(dpr, dpr);
  // The ink is the page's own blueprint token, read once — no new colour.
  const ink = getComputedStyle(canvas).getPropertyValue("--blueprint").trim() || "#1854a0";
  const columns = Math.max(6, Math.min(48, Math.round(w / 34)));
  const drops = Array.from({ length: columns }, (_, i) => ({
    x: (i + 0.5) * (w / columns),
    y: -Math.random() * h,
    speed: 90 + Math.random() * 160,
    glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    swap: 0,
  }));
  let raf = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const left = Math.max(0, until - now);
    // The whole sheet fades out over the last 400 ms.
    const fade = Math.min(1, left / 400);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "600 13px var(--font-mono, ui-monospace), ui-monospace, monospace";
    ctx.textAlign = "center";
    for (const d of drops) {
      d.y += d.speed * dt;
      d.swap += dt;
      if (d.swap > 0.12) {
        d.swap = 0;
        d.glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      if (d.y > h + 20) d.y = -20;
      ctx.globalAlpha = 0.28 * fade;
      ctx.fillStyle = ink;
      ctx.fillText(d.glyph, d.x, d.y);
      ctx.globalAlpha = 0.14 * fade;
      ctx.fillText(d.glyph, d.x, d.y - 18);
    }
    ctx.globalAlpha = 1;
    if (left > 0) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function PlanActivated({ plan, active }: { plan?: string | null; active: boolean }) {
  // Latched: the moment it has played once it never plays again, however the
  // parent re-renders (the portal's accept flourish, same rule).
  const played = useRef(false);
  const [showing, setShowing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active || played.current) return;
    played.current = true;
    setShowing(true);
    const t = window.setTimeout(() => setShowing(false), LIFE_MS);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    if (!showing || reducedMotion()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    return rain(canvas, performance.now() + LIFE_MS);
  }, [showing]);

  if (!showing) return null;
  const label = (plan ?? "").trim();
  return (
    <div className={styles.wrap} aria-hidden={false}>
      {!reducedMotion() && <canvas ref={canvasRef} className={styles.rain} aria-hidden="true" />}
      <span className={styles.stamp} role="status">
        Plan activated{label ? <b> · {label}</b> : null}
      </span>
    </div>
  );
}
