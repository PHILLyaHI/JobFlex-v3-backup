"use client";

// Which "Build an estimate" card renders.
//
// DEFAULT: variant C, the owner's pick of the 2026-09-12 three-way comparison
// (build-estimate-card-c.tsx). It is imported statically so the card paints
// with the report panel instead of popping in after a client-only chunk.
//
// Comparison previews, loaded on demand and client-only so a half-written one
// never breaks the page:
//   ?builder=current  the incumbent card (build-estimate-card.tsx)
//   ?builder=a | b    the two variants that were not picked
//   ?builder=codex-a  the Codex Impeccable card (another session's preview)
// Any other value, or none, renders variant C.

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { BuildEstimateCard, type BuildEstimateCardProps } from "./build-estimate-card";
import BuildEstimateCardC from "./build-estimate-card-c";

const PREVIEWS = {
  current: BuildEstimateCard,
  a: dynamic(() => import("./build-estimate-card-a"), { ssr: false }),
  b: dynamic(() => import("./build-estimate-card-b"), { ssr: false }),
  "codex-a": dynamic(() => import("../roof-estimator-codex/impeccable-preview"), { ssr: false }),
} as const;

export function BuildEstimateCardSwitch(props: BuildEstimateCardProps) {
  const params = useSearchParams();
  const key = params?.get("builder") ?? "";
  const Preview = Object.prototype.hasOwnProperty.call(PREVIEWS, key) ? PREVIEWS[key as keyof typeof PREVIEWS] : null;
  return Preview ? <Preview {...props} /> : <BuildEstimateCardC {...props} />;
}
