export interface TrafficExperiment {
  key: string;
  path: string;
  variants: readonly string[];
}

// Opt-in only. Add an approved page and its PostHog multivariate flag here.
// Use a new key for each test; never reuse a completed experiment's key.
export const TRAFFIC_EXPERIMENTS: readonly TrafficExperiment[] = [];
