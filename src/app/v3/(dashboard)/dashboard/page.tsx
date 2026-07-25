// /v3/dashboard was the staging route for the blueprint dashboard donor port.
// The port is now the live /dashboard page (src/app/dashboard/), rendered
// inside the shared blueprint shell, so this URL forwards there rather than
// mounting a second copy of the shell.

import { redirect } from "next/navigation";

export default function DashboardBlueprintStagingPage() {
  redirect("/dashboard");
}
