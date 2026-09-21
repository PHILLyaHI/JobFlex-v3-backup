"use client";
import { useEffect } from "react";
import { setTrafficContext } from "@/lib/traffic-client";

/** Tells the error reporter who is signed in — role, plan, organization id,
 *  nothing personal. Mounted by the signed-in layouts, which already hold all
 *  three; the root error boundary unmounts those layouts, so the values are
 *  kept in lib/traffic-client's module state. Renders null. */
export function TrafficContext({ role, plan, organizationId }: { role: string | null; plan: string | null; organizationId: string | null }) {
  useEffect(() => {
    setTrafficContext({ role, plan, organizationId });
  }, [role, plan, organizationId]);
  return null;
}
