import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RoofCardComparison } from "@/components/v3/roof-estimator-codex/comparison";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Roof card comparison · Codex · JobFlex" };

export default async function RoofCardComparisonPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fmobile-roof-estimator-v2%2Fcodex-compare");
  }
  return <Suspense fallback={<p>Loading designs…</p>}><RoofCardComparison /></Suspense>;
}
