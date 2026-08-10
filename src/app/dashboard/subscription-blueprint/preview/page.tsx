// TEMPORARY — visual-verification route, deleted before hand-off.
// Same page, no auth() gate, so the port can be compared against the source
// HTML side by side. pageKey() reads the first segment after /dashboard, so
// this nested route still resolves to "subscription-blueprint" and gets the
// same token gate.
import { SubscriptionContent } from "@/components/v3/subscription-blueprint/subscription-content";

export const dynamic = "force-dynamic";

export default function SubscriptionBlueprintPreviewPage() {
  return <SubscriptionContent />;
}
