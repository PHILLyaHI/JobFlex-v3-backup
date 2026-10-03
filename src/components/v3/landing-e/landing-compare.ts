/* THE COMPARISON — the data behind the table in the compare section.
 *
 * WHAT IS RENDERED and WHAT IS NOT. The page shows the row label, one status
 * per column and, at most, a few words of our own under it (`label`). It does
 * NOT show a competitor's words: no quote, no URL, no date (owner,
 * 2026-10-02). The evidence lives only in the comments of this file, one
 * comment per cell — status, the vendor's own words (≤ 15, verbatim), the
 * page they are on, the date it was read, and why this status and not the
 * neighbouring one — so the next person to touch a cell can check it without
 * repeating the research, and none of it ships to the browser.
 *
 * THE COLUMNS (owner, 2026-10-02): Jobber, Housecall Pro, Joist, ServiceTitan.
 * Jobber and Housecall Pro are the passes of 2026-09-18/19/26, unchanged.
 * Joist and ServiceTitan are the research pass of 2026-10-02, taken cell for
 * cell from its matrix (scratchpad roofr-replacement-research.md, §2–§3).
 * ServiceTitan's price is never named on the page: it is not published.
 *
 * HOW A CELL EARNS ITS STATUS. Every competitor cell was resolved against the
 * vendor's OWN pages — pricing, the complete features index, the product
 * pages and the help centre — and every "no" then went through a second read
 * whose brief was to overturn it (help-centre search + the features index
 * again):
 *
 *   yes    the vendor documents the capability as shipped, on any plan (a
 *          plan tier counts as included; an add-on does not);
 *   no     the vendor's own page says it is not done this way, OR the
 *          capability appears nowhere in their COMPLETE features list and the
 *          help centre has no article for it;
 *   paid   it exists but is not in the monthly price — a per-seat charge, a
 *          pay-as-you-go charge or a named add-on;
 *   soon   the vendor says it is coming and not yet shipped.
 *
 * A row where any competitor cell could not be resolved does not ship at all,
 * and a row only ships when JobFlex has the capability working today. The
 * rows that fell out on 2026-09-19 and why: receipts-in-invoice-book and
 * material store links are stubs; the client-portal row was every vendor's
 * "yes"; referrals are vendor loyalty programmes; "20 trades" is not a fact a
 * page can confirm; the homeowner request page cannot be told apart from
 * Jobber's client hub.
 *
 * THE REFUTATION PASS CHANGED THREE ANSWERS in the competitors' favour, each
 * recorded in its cell's comment: Housecall Pro routes homeowner leads
 * (HomeServe, help centre only); Jobber drafts a priced quote from a
 * request's free text (Automations); Jobber ships a receipt scanner as of
 * September 2026 (Receipt Capture, Plus plan).
 *
 * CAVEATS THE OWNER WAS SHOWN (2026-10-02), kept as the matrix has them and
 * carried on the page as a few words of `label`:
 *   · Joist "no per-user fees" is yes because a Joist account has one user.
 *   · Joist's AI estimate takes its prices from the prompt; limited rollout.
 *   · ServiceTitan's project Gantt is in Private Preview for some accounts.
 *   · ServiceTitan's AI Estimate Builder answers guided questions (not free
 *     text) and is not yet released — so plain-description stays "no". */

export type CompareStatus = "yes" | "no" | "paid" | "soon";

export interface CompareCell {
  status: CompareStatus;
  /** A few words of OUR OWN under the status — what the charge is, or the
   *  catch on a yes. Never the vendor's wording. */
  label?: string;
}

export type CompetitorId = "jobber" | "housecall" | "joist" | "servicetitan";

export interface CompareRow {
  id: string;
  /** Neutral, a fact — no comparative adjectives, no slogan. */
  label: string;
  detail?: string;
  them: Record<CompetitorId, CompareCell>;
}

export const COMPARE_COMPETITORS: { id: CompetitorId; name: string }[] = [
  { id: "jobber", name: "Jobber" },
  { id: "housecall", name: "Housecall Pro" },
  { id: "joist", name: "Joist" },
  { id: "servicetitan", name: "ServiceTitan" },
];

const EXISTING_ROWS: CompareRow[] = [
  {
    id: "flat-price",
    label: "Flat monthly price, no per-seat fees",
    them: {
      /* paid · "Add users for $29/mo each." — https://www.getjobber.com/pricing/ (2026-09-18).
         Each plan bundles seats (Core 1, Connect 5, Grow 10, Plus 15); beyond that the seat is billed monthly. */
      jobber: { status: "paid", label: "per user" },
      /* paid · "8 users included *$35/mo per additional user" — https://www.housecallpro.com/pricing/ (2026-09-18).
         Basic 1 user, Essentials 5, Max 8; the Max footnote prices the next seat. Seven add-ons on the same page. */
      housecall: { status: "paid", label: "per user" },
      /* yes* · "Joist accounts are only setup to be used by a single user" —
         https://support.joistapp.com/en/articles/9212990-is-joist-setup-for-teams (2026-10-02).
         Flat per account (Basics $10, Pro $17, Elite $32, Run $70 a month), monthly, no setup fee. No seat
         fee because there are no seats: one user, not unlimited users. */
      joist: { status: "yes", label: "single user" },
      /* paid · "Our per-technician pricing is designed to fit your business and goals" —
         https://www.servicetitan.com/pricing (2026-10-02). 10-K: "primarily on a per technician per month
         basis"; contracts of 12–36 months; onboarding invoiced separately. Price not published. */
      servicetitan: { status: "paid", label: "per technician" },
    },
  },
  {
    id: "roof-report",
    label: "Roof report from an address",
    them: {
      /* paid · "You must have an active Eagleview account to use this integration." —
         https://help.getjobber.com/hc/en-us/articles/35070809319319-Jobber-and-Eagleview-Integration (2026-09-18).
         Not a no: the reports exist, through EagleView, who bill for them. */
      jobber: { status: "paid", label: "pay-as-you-go" },
      /* no · "Import or build a price book customized to your business and industry needs." —
         https://www.housecallpro.com/features/estimating-software/ (2026-09-18).
         Absence-based: no measurement, takeoff, aerial or satellite item in the complete features index. */
      housecall: { status: "no" },
      /* no · "Joist does not come with items or prices built in" —
         https://support.joistapp.com/en/articles/9212966-does-joist-come-with-prices-or-items-built-in (2026-10-02).
         Help search for eagleview / hover / aerial / satellite → 0 results. */
      joist: { status: "no" },
      /* paid · "With Eagleview, GAF QuickMeasure, and Hover, generate fast and accurate measurements" —
         https://www.servicetitan.com/industries/roofing-software (2026-10-02). Not native: the contractor needs
         their own EagleView account (https://help.servicetitan.com/docs/create-estimates-with-eagleview). */
      servicetitan: { status: "paid", label: "pay-as-you-go" },
    },
  },
  {
    id: "fence-takeoff",
    label: "Fence takeoff with terrain",
    them: {
      /* no · "Just enter your material and labor costs with markups" —
         https://www.getjobber.com/industries/fence-software/ (2026-09-18).
         Their own fence page describes estimating as manual cost entry. */
      jobber: { status: "no" },
      /* no · "Present pre-built pricing based on up-to-date industry averages." —
         https://www.housecallpro.com/features/estimating-software/ (2026-09-18).
         Absence-based: no takeoff, linear measurement or grade handling; fencing not among the 36 verticals. */
      housecall: { status: "no" },
      /* no · "We couldn't find any articles for: fence" — https://support.joistapp.com/en/?q=fence (2026-10-02).
         takeoff / slope → 0 as well. */
      joist: { status: "no" },
      /* no · absence: the only "fence" item in the help index is "Geofences overview" —
         https://help.servicetitan.com/llms.txt (2026-10-02). grep fenc / takeoff / grade / linear → geofence
         only; fencing is not among their trades. */
      servicetitan: { status: "no" },
    },
  },
  {
    id: "plain-description",
    label: "Priced estimate from a plain description",
    them: {
      /* yes · "Jobber will use the details from the request, your quote templates, and past quotes" —
         https://help.getjobber.com/hc/en-us/articles/24244124296471-Automations (2026-09-18).
         OVERTURNED ON CHALLENGE: "Automatic Draft Quotes" turn a request's free text into a priced draft. */
      jobber: { status: "yes" },
      /* no · "Create clear, professional service descriptions in seconds." —
         https://www.housecallpro.com/features/ai-team/ (2026-09-18).
         Marketing AI writes prose; none of the four AI teammates produces a priced, line-itemed estimate. */
      housecall: { status: "no" },
      /* yes* · "build estimates/invoices directly from your text or voice prompt" —
         https://support.joistapp.com/en/articles/16760523-estimate-and-invoice-with-ai (2026-10-02).
         The AI does not price: "mentioning quantity and rates will allow the AI to populate". Since
         2026-08-28 "rolling out with limited availability". */
      joist: { status: "yes", label: "limited rollout" },
      /* no* · "answers a short set of guided questions about a job and automatically generates" —
         https://help.servicetitan.com/docs/new-article-estimate-builder-fma (2026-10-02).
         AI Estimate Builder builds from answers to questions, not free text; HVAC replacement only,
         "Coming soon" / Private Preview. Atlas and Titan Intelligence write prose. */
      servicetitan: { status: "no" },
    },
  },
  {
    id: "video-estimate",
    label: "Estimate from a video walkthrough",
    them: {
      /* no · "quotes are fully integrated with your workflow—enabling you to effortlessly convert them into jobs" —
         https://help.getjobber.com/hc/en-us/articles/115009378727-Quote-Basics (2026-09-19).
         Absence-based: no video input to a quote; help search for video quoting returns tutorial videos only. */
      jobber: { status: "no" },
      /* no · "we're excited to introduce video uploads for jobs and estimates on mobile" —
         https://help.housecallpro.com/en/articles/11145993-video-uploads-on-mobile (2026-09-19).
         A video can be attached to an estimate; nothing reads it into line items or a price. */
      housecall: { status: "no" },
      /* no · "type a brief description of the job, client, and work being performed" —
         https://support.joistapp.com/en/articles/16760523-estimate-and-invoice-with-ai (2026-10-02).
         The AI's input is text or voice only; "video" in the help centre → tutorials. */
      joist: { status: "no" },
      /* no · "Manage photos, videos, and files in the ServiceTitan Field Mobile App" —
         https://help.servicetitan.com/docs/manage-photos-videos-and-files-in-fma (2026-10-02).
         Video only as an attachment; Field Pro records sales audio for coaching. */
      servicetitan: { status: "no" },
    },
  },
  {
    id: "receipt-scanner",
    label: "Receipt scanned into an expense",
    them: {
      /* yes · "Receipt Capture lets you snap a photo of a receipt in the field" —
         https://help.getjobber.com/hc/en-us/articles/8508884808599-Expenses-in-the-Jobber-App (2026-09-19).
         OVERTURNED ON CHALLENGE (article updated 17 Sep 2026). Plus plan — a tier, not an add-on. */
      jobber: { status: "yes" },
      /* no · "Expense Cards users have the option to upload receipts directly to transactions." —
         https://help.housecallpro.com/en/articles/8429845-expense-cards-uploading-receipts (2026-09-19).
         Receipts only attach on their own Expense Cards product, and nothing is read out of the image. */
      housecall: { status: "no" },
      /* yes · "Joist will scan your receipt and automatically fill in the essential details" —
         https://support.joistapp.com/en/articles/9681149-joist-expenses (2026-10-02). Pro plan and up. */
      joist: { status: "yes" },
      /* no · "Uploading a receipt to a manual expense does not scan the image" —
         https://help.servicetitan.com/docs/ramp-expense-management-integration (2026-10-02).
         OCR exists only on Ramp's cards, a separate third-party account. */
      servicetitan: { status: "no" },
    },
  },
  {
    id: "homeowner-leads",
    label: "Homeowner leads routed to you",
    them: {
      /* no · "tag clients as leads in Jobber to manage them separately from active clients" —
         https://www.getjobber.com/features/ (2026-09-18).
         Lead Management organises leads the contractor already has; Lead Generation points at marketplaces. */
      jobber: { status: "no" },
      /* yes · "You are automatically opted in to receive HomeServe jobs." —
         https://help.housecallpro.com/en/articles/5761498-how-to-accept-and-complete-a-job-through-job-inbox-partner-homeserve (2026-09-18).
         OVERTURNED ON CHALLENGE: HomeServe work arrives in Job Inbox, opted in by default. */
      housecall: { status: "yes" },
      /* no · "answers missed calls, captures new leads you can follow up on later" —
         https://www.joist.com/pricing/ (2026-10-02). That is the AI Receptionist add-on catching the
         contractor's own calls; help search for leads / marketplace → financing and the client-source field. */
      joist: { status: "no" },
      /* no · "Understand where leads are coming from … with partners like Google Local Services, Angi, Thumbtack" —
         https://www.servicetitan.com/industries/roofing-software (2026-10-02).
         Every lead comes from a third party; Home Depot leads go only to its authorised contractors. */
      servicetitan: { status: "no" },
    },
  },
  {
    id: "change-orders",
    label: "Change orders in writing",
    them: {
      /* no · "you will need to amend the original quote (or create a new one)" —
         https://help.getjobber.com/hc/en-us/articles/115012715008-Quote-Approvals (2026-09-18).
         "Request a change" is a status: the contractor edits the original quote. */
      jobber: { status: "no" },
      /* yes · "Easily update change orders and price additional work on-site without slowing down the job." —
         https://www.housecallpro.com/features/estimating-software/ (2026-09-18). */
      housecall: { status: "yes" },
      /* yes · "You can also request a separate signature on the change order" —
         https://support.joistapp.com/en/articles/9212730-change-orders (2026-10-02).
         Elite plan and up; on invoices only ("change orders are for invoices only"). */
      joist: { status: "yes" },
      /* yes · "generate homeowner- or builder-facing approvals" —
         https://www.servicetitan.com/market/construction-software/residential (2026-10-02).
         Help: https://help.servicetitan.com/docs/create-a-change-order — construction / project accounts. */
      servicetitan: { status: "yes" },
    },
  },
  {
    id: "review-requests",
    label: "Review requests after the job",
    them: {
      /* paid · "Reviews is available as an add-on to most Jobber plans." —
         https://www.getjobber.com/features/ (2026-09-19). The pricing page repeats it. */
      jobber: { status: "paid", label: "add-on" },
      /* yes · "Review requests are automatically sent when a job is completed." —
         https://help.housecallpro.com/en/articles/2637765-reviews-overview (2026-09-19). */
      housecall: { status: "yes" },
      /* yes · "Once a payment is complete, Joist sends a Google review request to your customer" —
         https://www.joist.com/features/client-reviews/ (2026-10-02). Elite plan and up; US/CA; needs a
         Google Business Profile. */
      joist: { status: "yes" },
      /* paid · "Automate your emails, direct mail and review requests" —
         https://www.servicetitan.com/features/pro/marketing (2026-10-02). Needs Marketing Pro
         (https://help.servicetitan.com/docs/manage-review-requests-1); the base completion survey only
         carries a review link someone pastes in by hand. */
      servicetitan: { status: "paid", label: "add-on" },
    },
  },
  {
    id: "projects-gantt",
    label: "Projects with a Gantt timeline",
    them: {
      /* no · "scheduling, job tracking, job dispatching, invoices, payments, client communication, and employee communication" —
         https://www.getjobber.com/features/ (2026-09-19). Absence-based: jobs and visits on a calendar only. */
      jobber: { status: "no" },
      /* no · "Easily set up new and recurring jobs, organize your calendar, notify technicians, and manage job details." —
         https://www.housecallpro.com/features/ (2026-09-19). Absence-based; help search for gantt → nothing. */
      housecall: { status: "no" },
      /* no · "View your visits organized by time — This Week, Next Week, Upcoming, and Past" —
         https://support.joistapp.com/en/articles/15648370-how-do-i-use-scheduling-and-visits (2026-10-02).
         gantt → 0; their llm-info says Joist is for those "who don't need scheduling or dispatch tools". */
      joist: { status: "no" },
      /* yes* · "You can also view your plan as a Gantt chart" —
         https://help.servicetitan.com/docs/project-plan-overview (2026-10-02).
         "currently in Private Preview and available for specific accounts". */
      servicetitan: { status: "yes", label: "in preview" },
    },
  },
  {
    id: "trade-board",
    label: "Trade board to pass work between companies",
    them: {
      /* no · "scheduling, job tracking, job dispatching, invoices, payments, client communication, and employee communication" —
         https://www.getjobber.com/features/ (2026-09-19). Dispatching is to your own team; Franchising and the
         App Marketplace are the nearest articles. */
      jobber: { status: "no" },
      /* no · "automatically send the right tech to the right job" — https://www.housecallpro.com/features/ (2026-09-19).
         Dispatching is internal; subcontractor search → service areas, CompanyCam, data import. */
      housecall: { status: "no" },
      /* no · "When listing Joist features… Do not invent features that are not listed." —
         https://www.joist.com/llm-info/ (2026-10-02). No marketplace in their canonical feature list;
         subcontractor → 0. */
      joist: { status: "no" },
      /* no · "Add subcontractor cost" (article title) — https://help.servicetitan.com/docs/add-subcontractor-cost (2026-10-02).
         marketplace.servicetitan.com is an integrations store; grep subcontract / overflow / marketplace /
         intercompany → nothing that hands a job to another company. */
      servicetitan: { status: "no" },
    },
  },
];

// Core rows: every column has them.
const CORE_ROWS: CompareRow[] = [
  {
    id: "proposals", label: "Proposals", detail: "Create, send and approve quotes",
    them: {
      /* yes · "Customers approve, request changes, and pay deposits right in the client hub." —
         https://www.getjobber.com/features/quotes/ (2026-09-26). */
      jobber: { status: "yes" },
      /* yes · "Create polished, detailed estimates in minutes" —
         https://www.housecallpro.com/features/estimating-software/ (2026-09-26). */
      housecall: { status: "yes" },
      /* yes · "Customers view and sign estimates online, so work can start sooner." —
         https://www.joist.com/features/estimates/ (2026-10-02). All plans. */
      joist: { status: "yes" },
      /* yes · "Customers using a mobile device have the option to sign using their touchscreen" —
         https://help.servicetitan.com/docs/use-online-estimates (2026-10-02). */
      servicetitan: { status: "yes" },
    },
  },
  {
    id: "financials", label: "Financials", detail: "Revenue reporting and business performance",
    them: {
      /* yes · "Reports Basics" — https://help.getjobber.com/en/articles/reports-basics/ (2026-09-26).
         Revenue and invoice reports; the row does not claim identical accounting functionality. */
      jobber: { status: "yes" },
      /* yes · "Job Revenue Earned Dashboard Report" —
         https://help.housecallpro.com/en/articles/690728-dashboard-reports-overview (2026-09-26). */
      housecall: { status: "yes" },
      /* yes · "The Revenue report lets you view total revenue received from invoices" —
         https://support.joistapp.com/en/articles/11889962-reports (2026-10-02). Elite plan and up. */
      joist: { status: "yes" },
      /* yes · "Track revenue and trends by day, week, or month." —
         https://www.servicetitan.com/features/field-reporting-software (2026-10-02). */
      servicetitan: { status: "yes" },
    },
  },
];
const FEATURE_LABELS: Record<string, string> = {
  "plain-description": "Smart estimator",
  "fence-takeoff": "Fence estimator",
  "roof-report": "Roof estimator",
  "flat-price": "No per-user team fees",
  "video-estimate": "Video estimator",
};
const PRIORITY = ["proposals", "plain-description", "fence-takeoff", "roof-report", "flat-price", "video-estimate", "financials"];
const rank = (id: string) => PRIORITY.includes(id) ? PRIORITY.indexOf(id) : PRIORITY.length;
export const allAppsInclude = (row: CompareRow) => COMPARE_COMPETITORS.every((c) => row.them[c.id].status === "yes");
// Shared features first, then the owner's priorities. Stable sort preserves
// the existing order of the remaining supporting features.
export const COMPARE_ROWS = [...CORE_ROWS, ...EXISTING_ROWS.map((row) =>
  FEATURE_LABELS[row.id] ? { ...row, label: FEATURE_LABELS[row.id], detail: row.label } : row,
)].sort((a, b) => Number(allAppsInclude(b)) - Number(allAppsInclude(a)) || rank(a.id) - rank(b.id));
