import { PageHeader } from "@/components/ui/PageHeader";
import { NewApplicantForm } from "./new-applicant-form";

export default function NewApplicantPage() {
  return (
    <>
      <PageHeader
        eyebrow="Hire"
        title="Add applicant"
        description="Bring a candidate into the funnel manually."
      />
      <div className="max-w-[640px]">
        <NewApplicantForm />
      </div>
    </>
  );
}
