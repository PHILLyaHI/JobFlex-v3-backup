import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { BrandingFormV3 } from "@/components/v3/company/BrandingFormV3";

export default async function CompanyV3BrandingPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) notFound();

  return (
    <BrandingFormV3
      org={{
        id: org.id,
        name: org.name,
        phone: org.phone,
        billingEmail: org.billingEmail,
        address: org.address,
        website: org.website,
        primaryColor: org.primaryColor,
        logoUrl: org.logoUrl,
        publicProfileEnabled: org.publicProfileEnabled,
      }}
    />
  );
}
