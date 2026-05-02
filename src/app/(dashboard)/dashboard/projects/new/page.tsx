import { PageHeader } from "@/components/ui/PageHeader";
import { NewProjectForm } from "./new-form";

export default function NewProjectPage() {
  return (
    <>
      <PageHeader eyebrow="Projects" title="New project" description="A few details to get started — you can attach jobs and refine on the next screen." />
      <div className="max-w-[640px]">
        <NewProjectForm />
      </div>
    </>
  );
}
