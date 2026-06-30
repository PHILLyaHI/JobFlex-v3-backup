import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getTradeInbox,
  getMyTradeJobs,
  getTradeNetworkProfile,
} from "@/actions/tradeServices";
import { UnauthorizedError } from "@/lib/orgContext";
import { TradeServicesWorkspace } from "./trade-services-workspace";

export const metadata: Metadata = {
  title: "Trade & Services · JobFlex",
  description:
    "Hand off the jobs you can't take and pick up the ones you can. A contractor-to-contractor job board inside Messages.",
};

// Per-user data behind auth: never statically rendered.
export const dynamic = "force-dynamic";

export default async function TradeServicesMobilePage() {
  let inbox: Awaited<ReturnType<typeof getTradeInbox>>;
  let myPosts: Awaited<ReturnType<typeof getMyTradeJobs>>;
  let profile: Awaited<ReturnType<typeof getTradeNetworkProfile>>;
  try {
    [inbox, myPosts, profile] = await Promise.all([
      getTradeInbox(),
      getMyTradeJobs(),
      getTradeNetworkProfile(),
    ]);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/auth/login");
    throw e;
  }

  return (
    <TradeServicesWorkspace
      initialInbox={inbox}
      initialMyPosts={myPosts}
      initialProfile={profile}
      isDev={process.env.NODE_ENV !== "production"}
    />
  );
}
