// Reviews blueprint — demo fixture data, verbatim from the donor file
// jobflex-reviews-blueprint_3.html (script section). Values must not be edited
// independently of the donor: the page is a pixel-identical port, content
// included. Fields mirror the original page's ReviewRequest shape:
// status (PENDING | SENT | COMPLETED), rating, comment, sentAt, completedAt,
// client, job — with the donor's pre-formatted `when` standing in for the two
// timestamps.

export type ReviewStatus = "PENDING" | "SENT" | "COMPLETED";

export type ReviewRequest = {
  id: string;
  status: ReviewStatus;
  rating: number | null;
  client: string;
  job: string;
  when: string;
  comment: string | null;
};

export const REVIEWS_SEED: ReviewRequest[] = [
  { id: 'r1', status: 'COMPLETED', rating: 5, client: 'M. Henderson', job: 'Asphalt reroof — 4812 Maple Ave', when: '2d ago',
    comment: 'Crew showed up when they said they would, tarped the garden beds without being asked, and the site was cleaner than when they arrived.' },
  { id: 'r2', status: 'COMPLETED', rating: 5, client: 'D. Reyes', job: 'Cedar fence — 902 Alder Ct', when: '5d ago',
    comment: 'Straight lines, tight gaps, gate swings perfectly. Worth every dollar.' },
  { id: 'r3', status: 'COMPLETED', rating: 4, client: 'K. Sorensen', job: 'Cedar privacy fence — Kirkland', when: '1w ago',
    comment: 'Great work overall. Took one extra day because of the rain, which was fine, but I would have liked a heads-up sooner.' },
  { id: 'r4', status: 'COMPLETED', rating: 5, client: 'Cascade PM', job: 'Q3 turnovers — unit 12', when: '1w ago',
    comment: 'Third property they have handled for us this year. Invoicing is clean and the crews never need babysitting.' },
  { id: 'r5', status: 'COMPLETED', rating: 3, client: 'D. Pham', job: 'Gutter guards — Redmond', when: '2w ago',
    comment: 'Guards work well but there was a mix-up on the scheduled day and nobody called.' },
  { id: 'r6', status: 'COMPLETED', rating: 5, client: 'C. Ferreira', job: 'Punch list — Cypress Ln', when: '3w ago',
    comment: 'Fast, fair price, no surprises on the invoice.' },
  { id: 'r7', status: 'COMPLETED', rating: 4, client: 'R. Tran', job: 'Deck power wash — 55 Cedar Loop', when: '3w ago', comment: null },
  { id: 'r8', status: 'COMPLETED', rating: 2, client: 'L. Wong', job: 'Pergola repair — Sammamish', when: '1mo ago',
    comment: 'Post caps were the wrong color and it took two visits to sort out.' },
  { id: 'r9', status: 'SENT', rating: null, client: 'A. Kim', job: 'Composite deck rebuild', when: '3d ago', comment: null },
  { id: 'r10', status: 'SENT', rating: null, client: 'S. Patel', job: 'Siding patch — Mill Creek', when: '6d ago', comment: null },
  { id: 'r11', status: 'PENDING', rating: null, client: 'T. Bishop', job: 'Skylight install — 210 Fir St', when: '1d ago', comment: null }
];
