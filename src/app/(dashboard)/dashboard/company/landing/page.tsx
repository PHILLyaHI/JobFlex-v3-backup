import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { LandingBuilder } from "@/components/company/LandingBuilder";
import { ComingSoon } from "@/components/ui/ComingSoon";

// Flip to true to re-enable the (already-built) landing builder. Typed as `boolean`
// so the builder code path below stays type-checked while the flag is off.
const LANDING_BUILDER_ENABLED: boolean = false;

export default async function CompanyLandingPage() {
  if (!LANDING_BUILDER_ENABLED) {
    return (
      <ComingSoon
        eyebrow="Landing builder"
        title="Coming soon"
        description="Your public landing page — a branded page that turns visitors into leads — is in production right now."
        body="We're putting the finishing touches on it. Here's what's shipping:"
        items={["Hero editor", "Services & trades", "Live preview", "One-click publish"]}
      />
    );
  }

  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) notFound();

  return (
    <LandingBuilder
      org={{
        id: org.id,
        name: org.name,
        primaryColor: org.primaryColor,
        publicProfileEnabled: org.publicProfileEnabled,
        landingHeroTitle: org.landingHeroTitle,
        landingHeroSubtitle: org.landingHeroSubtitle,
        heroImageUrl: org.heroImageUrl,
        servicesJson: org.servicesJson,
      }}
    />
  );
}
