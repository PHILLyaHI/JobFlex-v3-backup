/* THE COMPARISON — the data behind the schedule in the one-app section.
 *
 * WHAT IS RENDERED and WHAT IS NOT. The page shows the row label and one
 * status per column. It does NOT show the quote, the URL, the date or the
 * note: a landing that argues with footnotes is a landing nobody finishes
 * reading, and the owner asked for the evidence to live here instead. So
 * every cell below carries its proof in the source, where the next person to
 * touch this file can check it without repeating the research.
 *
 * HOW A CELL EARNS ITS STATUS (passes of 2026-09-18 and 2026-09-19). Every
 * competitor cell was resolved against the vendor's OWN pages — pricing, the
 * complete features index, the product pages and the help centre — and every
 * "no" then went through a second read whose brief was to overturn it (help
 * centre search + the features index again):
 *
 *   yes    the vendor documents the capability as shipped, on any plan;
 *   no     the vendor's own page says it is not done this way, OR the
 *          capability appears nowhere in their COMPLETE features list and the
 *          help centre has no article for it;
 *   paid   it exists but is not in the monthly price — a per-seat add-on, a
 *          pay-as-you-go charge or a named add-on. `label` is their word;
 *   soon   the vendor says it is coming and not yet shipped.
 *
 * A row where any competitor cell could not be resolved does not ship at all,
 * and a row only ships when JobFlex has the capability working today — checked
 * against the code and the features audit's list (a). The rows that fell out
 * and why are in the report of 2026-09-19 (receipts-in-invoice-book and
 * material store links are stubs; the client-portal row was every vendor's
 * "yes"; referrals are vendor loyalty programmes; "20 trades" is not a fact a
 * page can confirm; the homeowner request page cannot be told apart from
 * Jobber's client hub, which keeps submitted requests in view).
 *
 * THE REFUTATION PASS CHANGED THREE ANSWERS in the competitors' favour, and
 * each is recorded in its note rather than quietly resolved: Housecall Pro
 * routes homeowner leads (HomeServe, help centre only); Jobber drafts a priced
 * quote from a request's free text (Automations); and Jobber ships a receipt
 * scanner as of September 2026 (Receipt Capture, Plus plan) — the first pass
 * had that as unverified. */

export type CompareStatus = "yes" | "no" | "paid" | "soon";

export interface CompareCell {
  status: CompareStatus;
  /** The vendor's own word for the charge (when `status` is "paid") or for the
   *  state it is in (when "soon"). Rendered as a mono label. */
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

const D1 = "2026-09-18";
const D2 = "2026-09-19";

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
        verifiedAt: D1,
        note: "Each plan bundles seats (Core 1, Connect 5, Grow 10, Plus 15); beyond that the seat is billed monthly.",
      },
      housecall: {
        status: "paid",
        label: "per user",
        quote: "8 users included *$35/mo per additional user",
        sourceUrl: "https://www.housecallpro.com/pricing/",
        verifiedAt: D1,
        note: "Basic 1 user, Essentials 5, Max 8; the Max footnote prices the next seat. The same page also sells seven add-ons.",
      },
      roofr: {
        status: "yes",
        quote: "Roofr does not charge per seat.",
        sourceUrl: "https://roofr.com/pricing",
        verifiedAt: D1,
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
        verifiedAt: D1,
        note: "Not a no: the reports exist, through EagleView, who bill for them. The order screen shows the cost of the report before you confirm.",
      },
      housecall: {
        status: "no",
        quote: "Import or build a price book customized to your business and industry needs.",
        sourceUrl: "https://www.housecallpro.com/features/estimating-software/",
        verifiedAt: D1,
        note: "Absence-based: no measurement, takeoff, aerial or satellite item appears anywhere in the complete features index. Estimating derives prices from a price book only.",
      },
      roofr: {
        status: "paid",
        label: "pay-as-you-go",
        quote: "Measurement Reports are always pay-as-you-go, no matter which plan you're on.",
        sourceUrl: "https://roofr.com/pricing",
        verifiedAt: D1,
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
        verifiedAt: D1,
        note: "Their own fence page describes estimating as manual cost entry. No measurement or takeoff of any kind is in the complete features index.",
      },
      housecall: {
        status: "no",
        quote: "Present pre-built pricing based on up-to-date industry averages.",
        sourceUrl: "https://www.housecallpro.com/features/estimating-software/",
        verifiedAt: D1,
        note: "Absence-based: no takeoff, linear measurement or grade handling in the features index; fencing is not among the 36 listed verticals.",
      },
      roofr: {
        status: "no",
        quote: "Accurate roof reports in as little as 2 hours",
        sourceUrl: "https://roofr.com/products",
        verifiedAt: D1,
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
        verifiedAt: D1,
        note: 'OVERTURNED ON CHALLENGE. Not on /features/, which is what the first pass read. Jobber ships "Automatic Draft Quotes" — a request\'s free text becomes a priced draft — plus a "Draft for me" button when converting a request.',
      },
      housecall: {
        status: "no",
        quote: "Create clear, professional service descriptions in seconds.",
        sourceUrl: "https://www.housecallpro.com/features/ai-team/",
        verifiedAt: D1,
        note: "Their AI page enumerates every AI teammate. Marketing AI writes prose; none of the four produces a priced, line-itemed estimate.",
      },
      roofr: {
        status: "no",
        quote: "Roofr compiles your proposal by combining the roof measurements from your report",
        sourceUrl: "https://help.roofr.com/en/articles/15525824-how-to-create-a-roofr-proposal",
        verifiedAt: D1,
        note: "Price always comes from a measurement plus a catalog and template, or from address plus multiple-choice in the Instant Estimator. Never from typed prose.",
      },
    },
  },
  {
    id: "video-estimate",
    label: "Estimate from a video walkthrough",
    them: {
      jobber: {
        status: "no",
        quote: "quotes are fully integrated with your workflow—enabling you to effortlessly convert them into jobs",
        sourceUrl: "https://help.getjobber.com/hc/en-us/articles/115009378727-Quote-Basics",
        verifiedAt: D2,
        note: "Absence-based. The complete features index has no video input to a quote, and a help-centre search for video quoting returns only tutorial videos. The one AI route into a quote is the request's text (see the row above).",
      },
      housecall: {
        status: "no",
        quote: "we're excited to introduce video uploads for jobs and estimates on mobile",
        sourceUrl: "https://help.housecallpro.com/en/articles/11145993-video-uploads-on-mobile",
        verifiedAt: D2,
        note: "The nearest thing is an attachment: a video can be added to a job or estimate to document it. Nothing reads the video into line items or a price.",
      },
      roofr: {
        status: "no",
        quote: "Roofr compiles your proposal by combining the roof measurements from your report",
        sourceUrl: "https://help.roofr.com/en/articles/15525824-how-to-create-a-roofr-proposal",
        verifiedAt: D2,
        note: "Absence-based: the product suite prices from a measurement report or the Instant Estimator's address plus questions. A help-centre search for video finds supplier-integration guides only.",
      },
    },
  },
  {
    id: "receipt-scanner",
    label: "Receipt scanned into an expense",
    them: {
      jobber: {
        status: "yes",
        quote: "Receipt Capture lets you snap a photo of a receipt in the field",
        sourceUrl: "https://help.getjobber.com/hc/en-us/articles/8508884808599-Expenses-in-the-Jobber-App",
        verifiedAt: D2,
        note: 'OVERTURNED ON CHALLENGE. The first pass left this unverified (only PDF supplier invoices were OCRd). The article, updated 17 Sep 2026, now documents Receipt Capture: "Jobber AI fills in the expense details for you". It is on the Plus plan — "If you\'re on the Plus plan, this opens the camera" — which is a tier, not an add-on, so it counts as included.',
      },
      housecall: {
        status: "no",
        quote: "Expense Cards users have the option to upload receipts directly to transactions.",
        sourceUrl: "https://help.housecallpro.com/en/articles/8429845-expense-cards-uploading-receipts",
        verifiedAt: D2,
        note: "Receipts only attach to a transaction on their own Expense Cards product, and nothing is read out of the image. There is no general expense with a scanned receipt in the features index, and a help-centre search for receipt finds only Expense Cards and payment receipts.",
      },
      roofr: {
        status: "no",
        quote: "Track material, labor, and overhead costs in one place",
        sourceUrl: "https://roofr.com/products",
        verifiedAt: D2,
        note: "Absence-based: job costing is described as tracking costs, with no receipt or expense capture in the product suite; a help-centre search for receipt returns nothing on the subject.",
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
        verifiedAt: D1,
        note: "Jobber's Lead Management organises leads the contractor already has. Their Lead Generation article points at third-party marketplaces the contractor buys from.",
      },
      housecall: {
        status: "yes",
        quote: "You are automatically opted in to receive HomeServe jobs.",
        sourceUrl:
          "https://help.housecallpro.com/en/articles/5761498-how-to-accept-and-complete-a-job-through-job-inbox-partner-homeserve",
        verifiedAt: D1,
        note: "OVERTURNED ON CHALLENGE. The marketing pages only describe the contractor's own demand, but the help centre documents HomeServe work arriving in Job Inbox, opted in by default.",
      },
      roofr: {
        status: "no",
        quote: "Links can be shared on social media, added to direct mail, posted on trucks",
        sourceUrl: "https://roofr.com/estimator",
        verifiedAt: D1,
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
        verifiedAt: D1,
        note: 'No change-order feature in the features index, Quote sub-items included. "Request a change" is a status: the quote leaves client hub and the contractor edits the original.',
      },
      housecall: {
        status: "yes",
        quote: "Easily update change orders and price additional work on-site without slowing down the job.",
        sourceUrl: "https://www.housecallpro.com/features/estimating-software/",
        verifiedAt: D1,
        note: "On the estimating page and the roofing vertical page; the help centre documents the flow as an estimate raised on a running job and sent for approval.",
      },
      roofr: {
        status: "yes",
        quote: "Recipients will need to approve or sign to confirm changes.",
        sourceUrl:
          "https://help.roofr.com/en/articles/15589435-featured-how-to-manage-change-orders",
        verifiedAt: D1,
        note: 'Judged in Roofr\'s favour on a split source. Their pricing page still tags Change Orders "coming soon", but the help centre carries a featured how-to with the working UI, so it is treated as shipped.',
      },
    },
  },
  {
    id: "review-requests",
    label: "Review requests after the job",
    them: {
      jobber: {
        status: "paid",
        label: "add-on",
        quote: "Reviews is available as an add-on to most Jobber plans.",
        sourceUrl: "https://www.getjobber.com/features/",
        verifiedAt: D2,
        note: "The features index describes automated review requests and, in the same breath, sells them as an add-on; the pricing page repeats it (\"feature available when Reviews add-on is enabled/added to plan\").",
      },
      housecall: {
        status: "yes",
        quote: "Review requests are automatically sent when a job is completed.",
        sourceUrl: "https://help.housecallpro.com/en/articles/2637765-reviews-overview",
        verifiedAt: D2,
        note: "Review management is a listed feature and the help centre documents automatic and bulk requests. Plan-gated at most, not an add-on.",
      },
      roofr: {
        status: "no",
        quote: "display your best Google reviews on your Roofr Instant Estimator summary page",
        sourceUrl:
          "https://help.roofr.com/en/articles/15622469-how-to-add-google-reviews-to-your-instant-estimator",
        verifiedAt: D2,
        note: "Roofr shows reviews you already have; nothing asks a customer for one. No review feature in the product suite, and the help-centre search for review returns only this display article.",
      },
    },
  },
  {
    id: "projects-gantt",
    label: "Projects with a Gantt timeline",
    them: {
      jobber: {
        status: "no",
        quote: "scheduling, job tracking, job dispatching, invoices, payments, client communication, and employee communication",
        sourceUrl: "https://www.getjobber.com/features/",
        verifiedAt: D2,
        note: "Absence-based. Work is jobs and visits on a calendar (day, week, month, map, list views in the Schedule Overview article); there is no project grouping and no Gantt anywhere in the features index or the help centre.",
      },
      housecall: {
        status: "no",
        quote: "Easily set up new and recurring jobs, organize your calendar, notify technicians, and manage job details.",
        sourceUrl: "https://www.housecallpro.com/features/",
        verifiedAt: D2,
        note: "Absence-based: scheduling is a calendar of jobs; the complete features index has no project or Gantt item and a help-centre search for gantt returns nothing.",
      },
      roofr: {
        status: "no",
        quote: "Schedule and manage roofing jobs with ease.",
        sourceUrl: "https://roofr.com/products",
        verifiedAt: D2,
        note: "Absence-based: the suite has a calendar and a job board; no project timeline, and a help-centre search for gantt returns nothing.",
      },
    },
  },
  {
    id: "trade-board",
    label: "Trade board to pass work between companies",
    them: {
      jobber: {
        status: "no",
        quote: "scheduling, job tracking, job dispatching, invoices, payments, client communication, and employee communication",
        sourceUrl: "https://www.getjobber.com/features/",
        verifiedAt: D2,
        note: "Absence-based. Dispatching is to your own team; the help centre's nearest articles are Franchising (adding another account you own) and the App Marketplace (integrations). Nothing passes a job to another company.",
      },
      housecall: {
        status: "no",
        quote: "automatically send the right tech to the right job",
        sourceUrl: "https://www.housecallpro.com/features/",
        verifiedAt: D2,
        note: "Absence-based: dispatching is internal; the features index has no marketplace or hand-off between companies, and a help-centre search for subcontractor returns service areas, CompanyCam and data import.",
      },
      roofr: {
        status: "no",
        quote: "manage all your internal/external crews and subcontractors",
        sourceUrl: "https://help.roofr.com/en/articles/15554059-how-to-manage-roofr-crews",
        verifiedAt: D2,
        note: "Crews are the contractor's own subs, assigned inside their account. No board on which another Roofr company can pick the work up.",
      },
    },
  },
];
