// THE TRIAL WATERMARK (2026-09-24). A faint, tiled line — the plan, the
// company, the email, the date — over every screen of an account that has
// not paid. It stops no screenshot; it makes every screenshot name its
// source. Fixed, full-screen, no pointer events, so nothing underneath
// changes; kept when the page is printed.

import { watermarkDataUri } from "@/lib/trialWatch";
import s from "./trial-watermark.module.css";

export function TrialWatermark({ text }: { text: string }) {
  return <div className={s.w} data-trial-watermark aria-hidden="true" style={{ backgroundImage: `url("${watermarkDataUri(text)}")` }} />;
}
