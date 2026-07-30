import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { BrandingForm } from "@/components/company/BrandingForm";
import { LeadProfileForm } from "@/components/company/LeadProfileForm";
import { parseTradeTypes } from "@/lib/tradeTypes";

export default async function CompanyBrandingPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) notFound();

  return (
    <div className="space-y-5">
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
      <LeadProfileForm
        profile={{
          address: org.address,
          phone: org.phone,
          tradeTypes: parseTradeTypes(org.tradeTypesJson),
          leadOffersEnabled: org.leadOffersEnabled,
          geocoded: org.lat != null && org.lng != null,
        }}
      />
    </div>
  );
}
