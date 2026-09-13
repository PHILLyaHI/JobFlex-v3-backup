"use client";

import type { BuildEstimateCardProps } from "../roof-estimator-blueprint/build-estimate-card";
import ImpeccableCard from "./impeccable-card";

export default function ImpeccablePreview(props: BuildEstimateCardProps) {
  return (
    <div className="codex-roof-preview">
      <ImpeccableCard {...props} />
    </div>
  );
}
