import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { loadBookingDashboard } from "@/lib/bookingBook";
import { BookingContent } from "@/components/v3/booking-blueprint/booking-content";

// ONLINE BOOKING (2026-09-23) — the office side of /book/<slug>.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · Online booking", description: "Your booking link, the visits booked, the hours and the services offered." };

export default async function BookingPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    if (isLimitedRole(ctx.role)) redirect("/dashboard?error=forbidden");
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fbooking");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const data = await loadBookingDashboard(organizationId);
  return <BookingContent data={data} />;
}
