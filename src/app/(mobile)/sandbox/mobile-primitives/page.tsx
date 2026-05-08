import { notFound } from "next/navigation";
import { SandboxClient } from "./SandboxClient";

// Dev-only route: do not pre-render at build time.
export const dynamic = "force-dynamic";

export default function MobilePrimitivesSandboxPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <SandboxClient />;
}
