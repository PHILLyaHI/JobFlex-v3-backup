import { redirect } from "next/navigation";

// The spec's canonical URL — the partner Overview lives at /influencer.
export default function InfluencerDashboardAlias() {
  redirect("/influencer");
}
