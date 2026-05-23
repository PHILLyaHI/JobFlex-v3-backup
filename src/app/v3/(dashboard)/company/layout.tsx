import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompanyTabsV3 } from "@/components/v3/company/CompanyTabsV3";

// v3 company shell. Mirrors the live `/dashboard/company/*` route family but
// lives at `/v3/company/*` so the original keeps serving traffic untouched.
// Auth is enforced here because the project's middleware only gates `/dashboard`
// and `/admin` — adding `/v3` to the matcher would also pull in marketing.
export default async function CompanyV3Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/v3/company")}`);
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 lg:px-10 py-10">
      <PageHeader
        eyebrow="Account · v3"
        title="Company"
        description="Branding, public landing, team, and subscription — your business face inside JobFlex."
      />
      <CompanyTabsV3 />
      {children}
    </div>
  );
}
