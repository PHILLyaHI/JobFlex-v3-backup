// Fresh copy for the /v3 landing page. Voice = JobFlex "well-kept shop"
// (calm, contractor-direct, editorial). Never lift verbatim from
// src/app/page.tsx or src/app/(marketing)/about/page.tsx.
//
// TODO(asset-swap): customer names, quotes, and case studies below are
// placeholders. Replace with real contractor names and quotes once the
// user provides them.

export type AccentLine = {
  lead?: string;
  accent: string;
  tail?: string;
};

export const nav = {
  links: [
    { label: "Why", href: "#why" },
    { label: "How it works", href: "#how" },
    { label: "Customers", href: "#customers" },
    { label: "Pricing", href: "/pricing" as const },
  ],
  signIn: { label: "Sign in", href: "/auth/login" as const },
  cta: { label: "Start free", href: "/auth/register" as const },
};

export const hero = {
  eyebrow: "An operating system for contractors",
  headline: {
    lead: "Run your contracting business",
    accent: "like a well-kept shop.",
  } satisfies AccentLine,
  subhead:
    "The quiet operating system that turns scattered leads, paper estimates, and Tuesday-night invoicing into one clear pipeline — designed for how crews actually work.",
  ctas: {
    primary: { label: "Start free trial", href: "/auth/register" as const },
    secondary: { label: "Book a walkthrough", href: "/homeowners" as const },
  },
  mock: {
    appName: "JobFlex",
    workspaceLabel: "Acme Contracting",
    sidebarSections: [
      { kind: "favorite", label: "This week" },
      { kind: "favorite", label: "Patel · roof replacement" },
    ] as const,
    sidebarModules: [
      "Leads",
      "Proposals",
      "Jobs",
      "Invoices",
      "Crew",
      "Reviews",
      "Payments",
      "Reports",
    ] as const,
    activeModule: "Leads",
    tableTitle: "All leads",
    tableCount: 9,
    columns: ["Lead", "Trade", "Source", "Owner", "Value", "Stage"] as const,
    rows: [
      { lead: "Patel — roof replacement", trade: "Roofing", source: "Meta Ads", owner: "Maria", value: "$18,444", stage: "Proposal sent" },
      { lead: "Diaz — kitchen carpentry", trade: "Carpentry", source: "Referral", owner: "Tom", value: "$45,368", stage: "Scheduled" },
      { lead: "Reilly — cedar fence", trade: "Fencing", source: "Google", owner: "Maria", value: "$4,200", stage: "Deposit paid" },
      { lead: "Nguyen — deck rebuild", trade: "Carpentry", source: "Website", owner: "Tom", value: "$12,860", stage: "Estimating" },
      { lead: "Brooks — gutter repair", trade: "Roofing", source: "Phone", owner: "Maria", value: "$1,840", stage: "New" },
      { lead: "Okafor — privacy fence", trade: "Fencing", source: "Meta Ads", owner: "Maria", value: "$8,920", stage: "Proposal sent" },
      { lead: "Chen — porch screening", trade: "Carpentry", source: "Referral", owner: "Tom", value: "$6,300", stage: "Scheduled" },
      { lead: "Wallace — chimney flash", trade: "Roofing", source: "Google", owner: "Maria", value: "$2,475", stage: "Estimating" },
      { lead: "Garza — vinyl fence", trade: "Fencing", source: "Website", owner: "Tom", value: "$11,200", stage: "New" },
    ],
    chat: {
      title: "AI Chat",
      promptHint: "Draft a proposal for the Patel roof replacement — 28 squares, GAF Timberline HDZ, tear-off included.",
      pillContext: "leads/patel",
      pillBranch: "draft",
      pillRepo: "GAF",
    },
  },
};

export const trustedBy = {
  label: "Trusted by",
  // Placeholder wordmarks. Swap when partner consent is in hand.
  wordmarks: [
    "GreenLeaf Fencing",
    "Patel Roofing Co.",
    "Diaz Custom Carpentry",
    "Reilly Trade Group",
    "North Star Decks",
    "Foundation Brothers",
  ],
};

export const problem = {
  label: "The problem.",
  headline: {
    lead: "Your tools are",
    accent: "fighting each other.",
  } satisfies AccentLine,
  body:
    "You're stitching together a CRM, a quoting tool, three payment processors, a shared calendar, and a notebook. The actual work happens in the gaps — and the gaps lose you money.",
  points: [
    {
      title: "Generic CRMs",
      body: "Built for SaaS salespeople, not crews. Fields you don't need, fields you can't add, no concept of a job site or a deposit.",
    },
    {
      title: "Tool sprawl",
      body: "Eight tabs open, three logins, one spreadsheet quietly going stale. Estimates re-keyed by hand. Payments tracked from memory.",
    },
  ],
};

export const solution = {
  label: "Stop settling for trade-offs.",
  headline: {
    lead: "One system for the whole job —",
    accent: "from first call to final payment.",
  } satisfies AccentLine,
  body:
    "JobFlex is the operating layer for contracting businesses. AI does the paperwork. You stay on the truck.",
  cards: [
    {
      title: "Production-grade workflows",
      body: "Built for the actual sequence of a job: lead → estimate → proposal → schedule → install → invoice → review. Every step lives in one record.",
      quote: "Cut our admin time by more than half in the first month.",
      attribution: "Maria · Office Manager, GreenLeaf Fencing",
    },
    {
      title: "AI that does the typing",
      body: "Describe a fence in plain English. JobFlex drafts the estimate — materials, labor, and a polished proposal — in under a minute.",
      quote: "I quote three jobs in the time I used to spend on one.",
      attribution: "Tom · Owner, North Star Decks",
    },
    {
      title: "Contractor-first control",
      body: "Your data, your customers, your pricing. Export anything, anytime. No platform lock-in. No surprise rate hikes.",
      quote: "Switched off the old platform in a weekend. Haven't looked back.",
      attribution: "Rey · Foundation Brothers",
    },
  ],
};

export const buildingBlocks = {
  indicator: "01",
  label: "What you get.",
  headline: {
    lead: "Start with",
    accent: "production-grade workflows.",
  } satisfies AccentLine,
  body:
    "Twelve modules. One operating system. Each one designed for how contracting actually runs — not how a SaaS startup imagined it should.",
  groups: [
    {
      label: "Pipeline",
      modules: [
        { icon: "leads", label: "Leads" },
        { icon: "proposals", label: "Proposals" },
        { icon: "jobs", label: "Jobs" },
        { icon: "invoices", label: "Invoices" },
      ],
    },
    {
      label: "Automation",
      modules: [
        { icon: "ai", label: "AI Estimator" },
        { icon: "meta", label: "Meta Ads" },
        { icon: "sms", label: "SMS & Email" },
        { icon: "webhooks", label: "Webhooks" },
      ],
    },
    {
      label: "Field & Finance",
      modules: [
        { icon: "crew", label: "Crew portal" },
        { icon: "reviews", label: "Reviews" },
        { icon: "payments", label: "Payments" },
        { icon: "skills", label: "Skills" },
      ],
    },
  ],
};

export const ownership = {
  indicator: "03",
  label: "Ownership.",
  headline: {
    lead: "Your crew, your clients,",
    accent: "your numbers.",
  } satisfies AccentLine,
  body:
    "Other platforms hold your customer list hostage. JobFlex hands you the keys: export your full dataset anytime, host your own client portal, take your pricing rules with you. Your shop, your operating system.",
  bullets: [
    "Full CSV + JSON export. No surcharge, no quarterly cap.",
    "Custom subdomain for your client portal.",
    "Bring-your-own Stripe, PayPal, Square, or Helcim accounts.",
    "Public API + webhooks. Nothing locked behind a tier.",
  ],
};

export const gtmFeatures = {
  label: "Skip the clunky UX.",
  headline: {
    lead: "Software your crew will",
    accent: "actually open.",
  } satisfies AccentLine,
  body:
    "Three minutes of training, not three days. Built for the truck cab, the job site, and the kitchen table — not the corner office.",
  cards: [
    {
      eyebrow: "Pipeline",
      title: "A real kanban for real jobs.",
      body: "Drag a lead from estimate to scheduled in one motion. Reorder, reassign, snooze — without leaving the board.",
    },
    {
      eyebrow: "AI estimating",
      title: "Sketch the scope. Watch the estimate fill in.",
      body: "AI Fence and AI Roof read your notes, photos, and measurements. You edit any line. The math stays right.",
    },
    {
      eyebrow: "Command palette",
      title: "Quote, dispatch, invoice — in three keystrokes.",
      body: "Hit ⌘K from anywhere. Find a customer, send a proposal, schedule a crew. Never click through a menu again.",
    },
  ],
};

export const customers = {
  label: "In production.",
  headline: {
    lead: "Contractors run leaner ops",
    accent: "with JobFlex.",
  } satisfies AccentLine,
  cards: [
    {
      brand: "GreenLeaf",
      title: "Own your CRM end to end",
      body: "GreenLeaf Fencing replaced a shuttered legacy CRM with JobFlex and cut CRM costs by more than 90% — without losing a single customer record in the migration.",
      cta: "Read the case",
      accent: "emerald" as const,
    },
    {
      brand: "Patel Roofing",
      title: "Cut estimating time by 80%",
      body: "Patel Roofing moved from spreadsheet estimates to JobFlex AI and reclaimed every Friday afternoon. Crews now leave the shop with a finished proposal in hand.",
      cta: "Read the case",
      accent: "amber" as const,
    },
  ],
};

export const testimonials = {
  label: "They are the real sales.",
  quotes: [
    {
      lead: "We didn't want to patch over the problem. We wanted a tool that",
      accent: "understood the actual job.",
      tail: " JobFlex is the first one that did.",
      name: "Amrendra Singh",
      role: "VP of Operations, W3villa Trades",
    },
    {
      lead: "The AI estimator is",
      accent: "the closest thing I've seen",
      tail: " to having a quiet senior estimator on staff.",
      name: "Maria Patel",
      role: "Office Manager, Patel Roofing Co.",
    },
    {
      lead: "We tried four platforms before this. JobFlex is the one that",
      accent: "fit the way we already work.",
      tail: "",
      name: "Tom Reilly",
      role: "Owner, Reilly Trade Group",
    },
  ],
};

export const finalCta = {
  label: "Any questions?",
  headline: {
    lead: "Stop fighting your software.",
    accent: "Start running your shop.",
  } satisfies AccentLine,
  subhead:
    "JobFlex onboards in under an hour. You'll be quoting jobs by lunch.",
  ctas: {
    primary: { label: "Start free trial", href: "/auth/register" as const },
    secondary: { label: "Talk to us", href: "/homeowners" as const },
  },
};

export const faq = {
  label: "Any questions?",
  headline: {
    lead: "Stop fighting your software.",
    accent: "Start running your shop.",
  } satisfies AccentLine,
  items: [
    {
      q: "Can I migrate from ServiceTitan, Jobber, or Housecall Pro?",
      a: "Yes. We import customers, jobs, history, and pricing from CSV exports or direct API. Most teams cut over in a single weekend, with our migration crew on call.",
    },
    {
      q: "How long does onboarding take?",
      a: "Sign up and you're quoting in under an hour. Larger teams (10+ users) get a 4-hour onboarding pack with a JobFlex specialist who configures your trades, templates, and integrations live.",
      defaultOpen: true,
    },
    {
      q: "Do I need a developer to customize it?",
      a: "No. Field-level customization, custom statuses, email templates, and crew-side fields are all point-and-click. Developers can extend further with webhooks and the public API.",
    },
    {
      q: "Does JobFlex work with Claude, ChatGPT, or Cursor?",
      a: "Yes. JobFlex exposes an MCP server and REST endpoints. Plug it into any AI assistant to draft proposals, look up jobs, or send invoices straight from a chat.",
    },
    {
      q: "What does JobFlex cost?",
      a: "Plans start at $79/month for solo operators. Crew and multi-shop pricing live on the Pricing page. Every plan includes the full AI estimator and unlimited clients.",
    },
    {
      q: "Is my data really portable?",
      a: "Yes. Export your full dataset to CSV or JSON anytime — no surcharge, no quarterly cap. If you ever leave, you keep your customer list, your pricing rules, and your history.",
    },
    {
      q: "Do you handle payments for contractors?",
      a: "Yes — Stripe, PayPal, Square, and Helcim are all built in. ACH, card, deposits, payment plans, and partial payments work the same on every processor.",
    },
  ],
  ctas: {
    primary: { label: "Start free trial", href: "/auth/register" as const },
    secondary: { label: "Talk to us", href: "/homeowners" as const },
  },
};

export const footer = {
  wordmark: "JOBFLEX",
  columns: [
    {
      label: "Sitemap",
      links: [
        { label: "Home", href: "/v3" as const },
        { label: "Pricing", href: "/pricing" as const },
        { label: "About", href: "/about" as const },
        { label: "For homeowners", href: "/homeowners" as const },
      ],
    },
    {
      label: "Help",
      links: [
        { label: "User guide", href: "/v3" as const },
        { label: "API docs", href: "/v3" as const },
        { label: "Status", href: "/v3" as const },
        { label: "Support", href: "/v3" as const },
      ],
    },
    {
      label: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" as const },
        { label: "Terms", href: "/terms" as const },
        { label: "Security", href: "/v3" as const },
      ],
    },
    {
      label: "Connect",
      links: [
        { label: "LinkedIn", href: "https://www.linkedin.com" as const },
        { label: "X", href: "https://x.com" as const },
        { label: "Discord", href: "https://discord.com" as const },
      ],
    },
  ],
  copyright: "© 2026 — JOBFLEX. Built in Philadelphia.",
};
