import { PreviewShell } from "./preview-shell";
import type { WorkerJobVM } from "./vm";

// Design preview: two directions for the field-worker job detail, side by side
// behind a V1/V2 toggle. Sample data only — no DB, safe to open from anywhere in
// the dashboard. Dates are computed server-side (relative to now) so the
// countdowns read naturally without hydration drift.
export default function WorkerJobPreviewPage() {
  const now = new Date();
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const sample: WorkerJobVM = {
    id: "clyq7k2p9a001",
    title: "Roof replacement · Patel residence",
    status: "SCHEDULED",
    assignmentStatus: "ACCEPTED",
    clientName: "Elena Diaz",
    address: "221 Oak St, Springfield, IL 62704",
    startsAt: at(6, 8),
    endsAt: at(6, 15),
    scope:
      "Full tear-off of the existing architectural shingles down to the deck, then a complete re-roof.\n\n" +
      "• Synthetic underlayment across the full deck\n" +
      "• Ice and water shield at valleys and eaves\n" +
      "• 30-year architectural shingles (owner-selected charcoal)\n" +
      "• New pipe boots, step and counter flashing\n" +
      "• Ridge vents for balanced attic ventilation\n\n" +
      "Keep the driveway clear for the dumpster and run a magnetic sweep of the yard before leaving each day.",
    events: [
      { id: "e1", title: "Material delivery", startsAt: at(5, 7), endsAt: at(5, 9) },
      { id: "e2", title: "Tear-off + dry-in", startsAt: at(6, 8), endsAt: at(6, 15) },
      { id: "e3", title: "Shingle + final walkthrough", startsAt: at(8, 8), endsAt: at(8, 14) },
    ],
    crew: [
      { id: "c1", name: "Marcus Bell", role: "Installer", isMe: true },
      { id: "c2", name: "Diego Ramos", role: "Crew lead", isMe: false },
      { id: "c3", name: "Tyrone Woods", role: "Laborer", isMe: false },
    ],
    photos: [
      { id: "p1", url: "https://picsum.photos/seed/jobflex-roof-a/400/400", kind: "BEFORE" },
      { id: "p2", url: "https://picsum.photos/seed/jobflex-roof-b/400/400", kind: "PROGRESS" },
      { id: "p3", url: "https://picsum.photos/seed/jobflex-roof-c/400/400", kind: "AFTER" },
      { id: "p4", url: "https://picsum.photos/seed/jobflex-roof-d/400/400", kind: null },
    ],
  };

  return <PreviewShell job={sample} />;
}
