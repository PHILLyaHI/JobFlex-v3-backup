import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { BrandingForm } from "@/components/company/BrandingForm";

export default async function CompanyBrandingPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) notFound();

  return (
    <BrandingForm
      org={{
        id: org.id,
        name: org.name,
        phone: org.phone,
        billingEmail: org.billingEmail,
        address: org.address,
        website: org.website,
        primaryColor: org.primaryColor,
        logoUrl: org.logoUrl,
      }}
    />
  );
}
