"use client";
import { useEffect } from "react";
import { setTrafficContext, setTrafficMember } from "@/lib/traffic-client";

/** Tells the error reporter who is signed in — role, plan, organization id,
 *  nothing personal. Mounted by the signed-in layouts, which already hold all
 *  three; the root error boundary unmounts those layouts, so the values are
 *  kept in lib/traffic-client's module state. It also tags the member's
 *  visits with the organization and user ids (ids, never names) so the admin's
 *  live view can say which company is in the app. Renders null. */
export function TrafficContext({ role, plan, organizationId, userId = null }: { role: string | null; plan: string | null; organizationId: string | null; userId?: string | null }) {
  useEffect(() => {
    setTrafficContext({ role, plan, organizationId });
  }, [role, plan, organizationId]);
  useEffect(() => {
    setTrafficMember(organizationId, userId);
  }, [organizationId, userId]);
  return null;
}
