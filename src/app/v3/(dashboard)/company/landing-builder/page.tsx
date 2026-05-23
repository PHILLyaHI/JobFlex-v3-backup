import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { LandingBuilderV3 } from "@/components/v3/company/LandingBuilderV3";

export default async function CompanyV3LandingBuilderPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) notFound();

  return (
    <LandingBuilderV3
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
