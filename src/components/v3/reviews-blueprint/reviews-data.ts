// Reviews blueprint — data shapes + the donor's demo fixture.
//
// The page is no longer a fixture page: src/app/dashboard/reviews/page.tsx
// reads the org's real `ReviewRequest` rows and passes them in, and the request
// dialog calls `createReviewRequest` from src/actions/reviewRequests.ts. The
// seed below survives only as the fallback for a render with no options (the
// standalone mock routes have no session to read from) — same arrangement as
// workers-data.ts.
//
// Fields mirror the Prisma model: status (PENDING | SENT | COMPLETED), rating,
// comment, sentAt/completedAt — with the pre-formatted `when` standing in for
// the two timestamps, and `token` carrying `ReviewRequest.publicToken` so the
// pending list can hand over the client's review link.

export type ReviewStatus = "PENDING" | "SENT" | "COMPLETED";

export type ReviewEntry = {
  id: string;
  /** `ReviewRequest.jobId` — the row's job link target. Null on the fixture. */
  jobId: string | null;
  status: ReviewStatus;
  rating: number | null;
  client: string;
  job: string;
  when: string;
  comment: string | null;
  /** `ReviewRequest.publicToken` — /review/<token> is what the client opens. */
  token: string | null;
};

/** A job with no review request yet — the request dialog's option list. */
export type EligibleJob = {
  id: string;
  title: string;
  client: string;
  /** Job.status, shown beside the title so a not-yet-completed job is obvious. */
  status: string;
};

/** Back-compat alias: the port's original row type. */
export type ReviewRequest = ReviewEntry;

export const REVIEWS_SEED: ReviewEntry[] = [
  { id: 'r1', jobId: null, token: null, status: 'COMPLETED', rating: 5, client: 'M. Henderson', job: 'Asphalt reroof — 4812 Maple Ave', when: '2d ago',
    comment: 'Crew showed up when they said they would, tarped the garden beds without being asked, and the site was cleaner than when they arrived.' },
  { id: 'r2', jobId: null, token: null, status: 'COMPLETED', rating: 5, client: 'D. Reyes', job: 'Cedar fence — 902 Alder Ct', when: '5d ago',
    comment: 'Straight lines, tight gaps, gate swings perfectly. Worth every dollar.' },
  { id: 'r3', jobId: null, token: null, status: 'COMPLETED', rating: 4, client: 'K. Sorensen', job: 'Cedar privacy fence — Kirkland', when: '1w ago',
    comment: 'Great work overall. Took one extra day because of the rain, which was fine, but I would have liked a heads-up sooner.' },
  { id: 'r4', jobId: null, token: null, status: 'COMPLETED', rating: 5, client: 'Cascade PM', job: 'Q3 turnovers — unit 12', when: '1w ago',
    comment: 'Third property they have handled for us this year. Invoicing is clean and the crews never need babysitting.' },
  { id: 'r5', jobId: null, token: null, status: 'COMPLETED', rating: 3, client: 'D. Pham', job: 'Gutter guards — Redmond', when: '2w ago',
    comment: 'Guards work well but there was a mix-up on the scheduled day and nobody called.' },
  { id: 'r6', jobId: null, token: null, status: 'COMPLETED', rating: 5, client: 'C. Ferreira', job: 'Punch list — Cypress Ln', when: '3w ago',
    comment: 'Fast, fair price, no surprises on the invoice.' },
  { id: 'r7', jobId: null, token: null, status: 'COMPLETED', rating: 4, client: 'R. Tran', job: 'Deck power wash — 55 Cedar Loop', when: '3w ago', comment: null },
  { id: 'r8', jobId: null, token: null, status: 'COMPLETED', rating: 2, client: 'L. Wong', job: 'Pergola repair — Sammamish', when: '1mo ago',
    comment: 'Post caps were the wrong color and it took two visits to sort out.' },
  { id: 'r9', jobId: null, token: null, status: 'SENT', rating: null, client: 'A. Kim', job: 'Composite deck rebuild', when: '3d ago', comment: null },
  { id: 'r10', jobId: null, token: null, status: 'SENT', rating: null, client: 'S. Patel', job: 'Siding patch — Mill Creek', when: '6d ago', comment: null },
  { id: 'r11', jobId: null, token: null, status: 'PENDING', rating: null, client: 'T. Bishop', job: 'Skylight install — 210 Fir St', when: '1d ago', comment: null }
];
