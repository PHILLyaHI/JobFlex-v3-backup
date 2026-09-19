// Admin · Smart Proposal prompts — /admin/prompts.
//
// Owner, 2026-09-18: "add to admin smart proposal prompt, side bar page
// prompts and i can modify and see current." The page shows the text the
// estimate prompt is built from — the master prompt, the system message,
// the line-item rules, and every specialty's preamble and procedure — with
// the current (effective) text in each box, a chip saying whether it is the
// default or a saved change, Save / Reset per box, and a preview that
// composes the exact prompt a brief would send. Overrides live in the
// PromptOverride table (lib/estimate/promptOverrides); the pipeline reads
// them on every generate.
//
// The (admin) layout guards the route group; this page guards itself too.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { loadPromptOverrides } from "@/lib/estimate/promptOverrides";
import { composePreview, masterState, remodelStates, rulesState, specialtyDetail, specialtyRows, systemState } from "@/lib/estimate/promptAdmin";
import { AdminPromptsContent } from "@/components/v3/admin-prompts/prompts-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex Admin · Prompts",
  description: "The Smart Proposal prompts — the current text, your changes, and the exact prompt a brief sends.",
};

/** The owner's reference case opens the page: the sewer estimate that came back thin. */
const SAMPLE_BRIEF = "Sewer line installation, 300 ft from the house to the city main, 6 ft deep, across the lawn and the driveway";
const SAMPLE_LOCATION = "Lynnwood, WA";
const SAMPLE_SPECIALTY = "sanitary-sewer";

export default async function AdminPromptsPage() {
  await requirePlatformAdmin();
  const overrides = await loadPromptOverrides();
  const { groups, rows } = specialtyRows(overrides);
  const detail = specialtyDetail(SAMPLE_SPECIALTY, overrides) ?? specialtyDetail(rows[0].id, overrides)!;
  const preview = composePreview({ description: SAMPLE_BRIEF, location: SAMPLE_LOCATION, companyName: "Your Company" }, overrides);
  return (
    <AdminPromptsContent
      master={masterState(overrides)}
      system={systemState(overrides)}
      rules={rulesState(overrides)}
      remodel={remodelStates(overrides)}
      groups={groups}
      specialties={rows}
      initialDetail={detail}
      initialPreview={preview}
      sample={{ description: SAMPLE_BRIEF, location: SAMPLE_LOCATION }}
      overrideCount={Object.keys(overrides.savedAt).length}
    />
  );
}
