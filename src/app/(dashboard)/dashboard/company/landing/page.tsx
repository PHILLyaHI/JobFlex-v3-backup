import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { LandingBuilder } from "@/components/company/LandingBuilder";

export default async function CompanyLandingPage() {
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
