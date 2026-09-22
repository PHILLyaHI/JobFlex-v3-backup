// PARTNER SIGN IN. Route: /influencer/login.
//
// Standalone chrome: the (influencer) layout renders this bare — it resolves no
// partner here, so it has no one to dress — and the wrapper <div> in
// ./login-form.tsx wears the literal global class `jf-partner-door` that every
// rule in ../partner-door.module.css hangs off.
//
// A server component so it can carry the document title and send a partner who
// is already signed in straight to their Overview; the form is the client piece
// beside it.

import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireInfluencer } from "@/lib/orgContext";
import { PartnerLogin } from "./login-form";

export const metadata: Metadata = {
  title: "JobFlex · Partner sign in",
};

export default async function PartnerLoginPage() {
  const partner = await requireInfluencer().catch(() => null);
  if (partner) redirect("/influencer" as Route);
  return <PartnerLogin />;
}
