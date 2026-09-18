/* THE COMPARISON — the data behind the table in the one-app section.
 *
 * WHAT IS RENDERED and WHAT IS NOT. The page shows the row label and one
 * status per column. It does NOT show the quote, the URL, the date or the
 * note: a landing that argues with footnotes is a landing nobody finishes
 * reading, and the owner asked for the evidence to live here instead. So
 * every cell below carries its proof in the source, where the next person to
 * touch this file can check it without repeating the research.
 *
 * HOW A CELL EARNS ITS STATUS (second pass, 2026-09-18). Every competitor
 * cell was resolved against the vendor's OWN pages — pricing, the complete
 * features index, the product pages and the help centre — and then
 * challenged by a second reader whose brief was to overturn it:
 *
 *   yes    the vendor documents the capability as shipped;
 *   no     the vendor's own page says it is not done this way, OR the
 *          capability appears nowhere in their COMPLETE features list;
 *   paid   it exists but is not in the monthly price — a per-seat add-on or
 *          a pay-as-you-go charge. `label` is what they call it;
 *   soon   the vendor says it is coming and not yet shipped.
 *
 * A row where any competitor cell could not be resolved does not ship at all.
 * "Receipt scanner" was dropped on exactly that rule: Jobber OCRs supplier
 * invoices (PDF, desktop) but no Jobber page states whether a photographed
 * paper receipt is or is not supported, so the cell stayed unverified and the
 * whole row went with it.
 *
 * TWO CHALLENGES CHANGED AN ANSWER, and are recorded in the notes rather than
 * quietly resolved: Housecall Pro's homeowner leads (their HomeServe routing
 * is in the help centre, not on the marketing pages) and Jobber's draft quote
 * from a request (absent from /features/, documented in Automations). Both
 * went in the competitor's favour.
 *
 * Every row is one where JobFlex ships the capability today — the column is
 * not a wish list. */

export type CompareStatus = "yes" | "no" | "paid" | "soon";

export interface CompareCell {
  status: CompareStatus;
  /** The vendor's own word for the charge, shown when `status` is "paid". */
  label?: string;
  /** No more than 15 words, verbatim from the source. Not rendered. */
  quote: string;
  /** The page the quote is on. Not rendered. */
  sourceUrl: string;
  /** ISO date the page was read. Not rendered. */
  verifiedAt: string;
  /** Why this status and not the neighbouring one. Not rendered. */
  note?: string;
}

export type CompetitorId = "jobber" | "housecall" | "roofr";

export interface CompareRow {
  id: string;
  /** Neutral, a fact — no comparative adjectives, no slogan. */
  label: string;
  them: Record<CompetitorId, CompareCell>;
}

export const COMPARE_COMPETITORS: { id: CompetitorId; name: string }[] = [
  { id: "jobber", name: "Jobber" },
  { id: "housecall", name: "Housecall Pro" },
  { id: "roofr", name: "Roofr" },
];

const AT = "2026-09-18";

export const COMPARE_ROWS: CompareRow[] = [
  {
    id: "flat-price",
    label: "Flat monthly price, no per-seat fees",
    them: {
      jobber: {
        status: "paid",
        label: "per user",
        quote: "Add users for $29/mo each.",
        sourceUrl: "https://www.getjobber.com/pricing/",
        verifiedAt: AT,
        note: "Each plan bundles seats (Core 1, Connect 5, Grow 10, Plus 15); beyond that the seat is billed monthly.",
      },
      housecall: {
        status: "paid",
        label: "per user",
        quote: "8 users included *$35/mo per additional user",
        sourceUrl: "https://www.housecallpro.com/pricing/",
        verifiedAt: AT,
        note: "Basic 1 user, Essentials 5, Max 8; the Max footnote prices the next seat. The same page also sells seven add-ons.",
      },
      roofr: {
        status: "yes",
        quote: "Roofr does not charge per seat.",
        sourceUrl: "https://roofr.com/pricing",
        verifiedAt: AT,
        note: "Stated in the plan-comparison FAQ; each tier is a fixed monthly figure with no additional-user line.",
      },
    },
  },
  {
    id: "roof-report",
    label: "Roof report from an address",
    them: {
      jobber: {
        status: "paid",
        label: "pay-as-you-go",
        quote: "You must have an active Eagleview account to use this integration.",
        sourceUrl:
          "https://help.getjobber.com/hc/en-us/articles/35070809319319-Jobber-and-Eagleview-Integration",
        verifiedAt: AT,
        note: "Not a no: the reports exist, through EagleView, who bill for them. The order screen shows the cost of the report before you confirm.",
      },
      housecall: {
        status: "no",
        quote: "Import or build a price book customized to your business and industry needs.",
        sourceUrl: "https://www.housecallpro.com/features/estimating-software/",
        verifiedAt: AT,
        note: "Absence-based: no measurement, takeoff, aerial or satellite item appears anywhere in the complete features index. Estimating derives prices from a price book only.",
      },
      roofr: {
        status: "paid",
        label: "pay-as-you-go",
        quote: "Measurement Reports are always pay-as-you-go, no matter which plan you're on.",
        sourceUrl: "https://roofr.com/pricing",
        verifiedAt: AT,
        note: 'Address-driven and fast (help: "Enter your required address in the pop up window"), but never included in the subscription.',
      },
    },
  },
  {
    id: "fence-takeoff",
    label: "Fence takeoff with terrain",
    them: {
      jobber: {
        status: "no",
        quote: "Just enter your material and labor costs with markups",
        sourceUrl: "https://www.getjobber.com/industries/fence-software/",
        verifiedAt: AT,
        note: "Their own fence page describes estimating as manual cost entry. No measurement or takeoff of any kind is in the complete features index.",
      },
      housecall: {
        status: "no",
        quote: "Present pre-built pricing based on up-to-date industry averages.",
        sourceUrl: "https://www.housecallpro.com/features/estimating-software/",
        verifiedAt: AT,
        note: "Absence-based: no takeoff, linear measurement or grade handling in the features index; fencing is not among the 36 listed verticals.",
      },
      roofr: {
        status: "no",
        quote: "Accurate roof reports in as little as 2 hours",
        sourceUrl: "https://roofr.com/products",
        verifiedAt: AT,
        note: "The full product suite is eight roofing products. Measurement is roof-only; nothing linear, nothing for fencing.",
      },
    },
  },
  {
    id: "plain-description",
    label: "Priced estimate from a plain description",
    them: {
      jobber: {
        status: "yes",
        quote: "Jobber will use the details from the request, your quote templates, and past quotes",
        sourceUrl: "https://help.getjobber.com/hc/en-us/articles/24244124296471-Automations",
        verifiedAt: AT,
        note: 'OVERTURNED ON CHALLENGE. Not on /features/, which is what the first pass read. Jobber ships "Automatic Draft Quotes" — a request\'s free text becomes a priced draft — plus a "Draft for me" button when converting a request.',
      },
      housecall: {
        status: "no",
        quote: "Create clear, professional service descriptions in seconds.",
        sourceUrl: "https://www.housecallpro.com/features/ai-team/",
        verifiedAt: AT,
        note: "Their AI page enumerates every AI teammate. Marketing AI writes prose; none of the four produces a priced, line-itemed estimate.",
      },
      roofr: {
        status: "no",
        quote: "Roofr compiles your proposal by combining the roof measurements from your report",
        sourceUrl: "https://help.roofr.com/en/articles/15525824-how-to-create-a-roofr-proposal",
        verifiedAt: AT,
        note: "Price always comes from a measurement plus a catalog and template, or from address plus multiple-choice in the Instant Estimator. Never from typed prose.",
      },
    },
  },
  {
    id: "homeowner-leads",
    label: "Homeowner leads routed to you",
    them: {
      jobber: {
        status: "no",
        quote: "tag clients as leads in Jobber to manage them separately from active clients",
        sourceUrl: "https://www.getjobber.com/features/",
        verifiedAt: AT,
        note: "Jobber's Lead Management organises leads the contractor already has. Their Lead Generation article points at third-party marketplaces the contractor buys from.",
      },
      housecall: {
        status: "yes",
        quote: "You are automatically opted in to receive HomeServe jobs.",
        sourceUrl:
          "https://help.housecallpro.com/en/articles/5761498-how-to-accept-and-complete-a-job-through-job-inbox-partner-homeserve",
        verifiedAt: AT,
        note: "OVERTURNED ON CHALLENGE. The marketing pages only describe the contractor's own demand, but the help centre documents HomeServe work arriving in Job Inbox, opted in by default.",
      },
      roofr: {
        status: "no",
        quote: "Links can be shared on social media, added to direct mail, posted on trucks",
        sourceUrl: "https://roofr.com/estimator",
        verifiedAt: AT,
        note: 'The Instant Estimator converts traffic the contractor brings. Roofr does not source or route homeowners; their FAQ answers "Does the CRM generate leads?" with the estimator.',
      },
    },
  },
  {
    id: "change-orders",
    label: "Change orders in writing",
    them: {
      jobber: {
        status: "no",
        quote: "you will need to amend the original quote (or create a new one)",
        sourceUrl: "https://help.getjobber.com/hc/en-us/articles/115012715008-Quote-Approvals",
        verifiedAt: AT,
        note: 'No change-order feature in the features index, Quote sub-items included. "Request a change" is a status: the quote leaves client hub and the contractor edits the original.',
      },
      housecall: {
        status: "yes",
        quote: "Easily update change orders and price additional work on-site without slowing down the job.",
        sourceUrl: "https://www.housecallpro.com/features/estimating-software/",
        verifiedAt: AT,
        note: "On the estimating page and the roofing vertical page; the help centre documents the flow as an estimate raised on a running job and sent for approval.",
      },
      roofr: {
        status: "yes",
        quote: "Recipients will need to approve or sign to confirm changes.",
        sourceUrl:
          "https://help.roofr.com/en/articles/15589435-featured-how-to-manage-change-orders",
        verifiedAt: AT,
        note: 'Judged in Roofr\'s favour on a split source. Their pricing page still tags Change Orders "coming soon", but the help centre carries a featured how-to with the working UI, so it is treated as shipped.',
      },
    },
  },
];
