"use server";
import { assignSignupBrowser } from "@/lib/signupExperiment";
export async function initializeSignupExperiment() {
  const assignment = await assignSignupBrowser();
  return { variant: assignment.variant };
}
