// Gmail settings — SUPERSEDED by the Blueprint settings hub (2026-09-03).
//
// The classic page this route used to render duplicated a pane the hub at
// /dashboard/settings already carries with working saves; the duplicate shipped
// the classic shell's hydration mismatch and, on /account, an editable form
// with no save path at all (button audit, 2026-09-03). Per the re-port
// convention the old page is archived at
// old-design-pages/dashboard/settings/gmail/page.tsx and this URL now lands on
// its pane of the hub.
import { redirect } from "next/navigation";

export default function GmailSettingsRedirect() {
  redirect("/dashboard/settings?pane=integrations");
}
