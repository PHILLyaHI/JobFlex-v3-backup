"use client";

// Which "Build an estimate" card renders.
//
// DEFAULT: variant D, the owner's pick of the 2026-09-26 high-contrast round
// (build-estimate-card-d.tsx) — it replaced variant C, the 2026-09-12 pick. It
// is imported statically so the card paints with the report panel instead of
// popping in after a client-only chunk.
//
// Comparison previews, loaded on demand and client-only so a half-written one
// never breaks the page:
//   ?builder=c        the previous default (2026-09-12 pick)
//   ?builder=current  the incumbent card (build-estimate-card.tsx)
//   ?builder=a | b    the two 2026-09-12 variants that were not picked
//   ?builder=codex-a  the Codex Impeccable card (another session's preview)
//   ?builder=e | f    the 2026-09-26 variants that were not picked
// Any other value, or none, renders variant D.

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { BuildEstimateCard, type BuildEstimateCardProps } from "./build-estimate-card";
import BuildEstimateCardD from "./build-estimate-card-d";

const PREVIEWS = {
  current: BuildEstimateCard,
  a: dynamic(() => import("./build-estimate-card-a"), { ssr: false }),
  b: dynamic(() => import("./build-estimate-card-b"), { ssr: false }),
  c: dynamic(() => import("./build-estimate-card-c"), { ssr: false }),
  "codex-a": dynamic(() => import("../roof-estimator-codex/impeccable-preview"), { ssr: false }),
  e: dynamic(() => import("./build-estimate-card-e"), { ssr: false }),
  f: dynamic(() => import("./build-estimate-card-f"), { ssr: false }),
} as const;

export function BuildEstimateCardSwitch(props: BuildEstimateCardProps) {
  const params = useSearchParams();
  const key = params?.get("builder") ?? "";
  const Preview = Object.prototype.hasOwnProperty.call(PREVIEWS, key) ? PREVIEWS[key as keyof typeof PREVIEWS] : null;
  return Preview ? <Preview {...props} /> : <BuildEstimateCardD {...props} />;
}
