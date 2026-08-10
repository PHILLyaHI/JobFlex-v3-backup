// Client detail — house blueprint skin (route: /dashboard/client-detail).
//
// The old record page at /dashboard/clients/[id] is deliberately NOT replaced.
// The two stand side by side so the composition can be judged before anything
// is migrated: this one is a stack of five differently-shaped bands, that one
// is a three-column grid of four same-weight cards.
//
// Top-level route under /dashboard on purpose: blueprint-shell's pageKey()
// reads the first path segment, so a child route would inherit its parent's
// page key and stylesheet. "client-detail" is deliberately absent from the
// shell's PAGE_STYLES map — this page carries its own self-scoped module
// instead (see the scoping note at the top of client-detail.module.css).
//
// Content is a fixture by design: the data layer stays out of scope until the
// layout is signed off. Every action writes nothing, and the masthead says so
// rather than faking success.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ClientDetailContent } from "@/components/v3/client-detail-blueprint/client-detail-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Client",
  description: "One client record — particulars, figures, proposals, payments and activity.",
};

export default async function ClientDetailPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fclient-detail");
  }

  return <ClientDetailContent />;
}
