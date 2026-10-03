// A COMPANY'S OWN TEXTING NUMBER — the words and the rules, pure (2026-10-02).
//
// Twilio verifies a toll-free number for ONE business: the business the
// person being texted knows (errors 30474, 30478). So a contractor's texts to
// its own clients and crew go out from a number JobFlex buys on its own
// Twilio account (JobFlex pays) and registers with the contractor's business
// details. The server half is registration.ts; the settings card and the QA
// check read this file, so it imports nothing that touches the server.

export type SmsBusinessType = "PRIVATE_PROFIT" | "SOLE_PROPRIETOR" | "NON_PROFIT";

/** What Twilio asks about the business, as the contractor types it. */
export type SmsRegistrationDetails = {
  /** As registered with the IRS / the state: "Ridgeline Roofing LLC". */
  legalName: string;
  /** The name clients know, when it differs: "Ridgeline Roofing". */
  dba: string;
  businessType: SmsBusinessType;
  /** "12-3456789". A sole proprietor without one leaves it empty. */
  ein: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  contactFirst: string;
  contactLast: string;
  contactEmail: string;
  contactPhone: string;
};

export type SmsRegistrationStage = "none" | "pending" | "approved" | "rejected" | "failed";

/** One company's registration, as kept in SyncState `smsreg:<orgId>`. */
export type SmsRegistrationState = {
  stage: SmsRegistrationStage;
  /** The toll-free number bought for the company (E.164); kept across a resubmission. */
  number?: string | null;
  numberSid?: string | null;
  verificationSid?: string | null;
  submittedAt?: string | null;
  checkedAt?: string | null;
  approvedAt?: string | null;
  reasons?: { code: number | null; reason: string }[];
  /** A rejected submission can be corrected until then (Twilio's edit window). */
  editUntil?: string | null;
  editAllowed?: boolean;
  /** Our own step that failed (buying the number, sending the form), in words. */
  error?: string | null;
  details?: SmsRegistrationDetails | null;
};

export const BUSINESS_TYPES: readonly { value: SmsBusinessType; label: string }[] = [
  { value: "PRIVATE_PROFIT", label: "LLC or corporation" },
  { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
  { value: "NON_PROFIT", label: "Non-profit" },
];

export const EMPTY_DETAILS: SmsRegistrationDetails = {
  legalName: "", dba: "", businessType: "PRIVATE_PROFIT", ein: "", street: "", street2: "", city: "", state: "", zip: "",
  website: "", contactFirst: "", contactLast: "", contactEmail: "", contactPhone: "",
};

const STAGES: readonly SmsRegistrationStage[] = ["none", "pending", "approved", "rejected", "failed"];

/** The stored JSON back as a state; anything unreadable is "none". */
export function parseRegistration(json: string | null | undefined): SmsRegistrationState {
  if (!json) return { stage: "none" };
  try {
    const raw = JSON.parse(json) as Partial<SmsRegistrationState>;
    const stage = STAGES.includes(raw.stage as SmsRegistrationStage) ? (raw.stage as SmsRegistrationStage) : "none";
    return { ...raw, stage };
  } catch {
    return { stage: "none" };
  }
}

/** Twilio's verification status → ours. */
export function stageFor(status: string | null | undefined): SmsRegistrationStage {
  if (status === "TWILIO_APPROVED") return "approved";
  if (status === "TWILIO_REJECTED") return "rejected";
  if (status === "PENDING_REVIEW" || status === "IN_REVIEW") return "pending";
  return "failed";
}

/** Mailboxes Twilio will not take as a business's own (error 30482) unless the website lists them. */
export function isFreeMailbox(email: string): boolean {
  return /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|zoho)\.[a-z.]+$/i.test(email.trim());
}

const US_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" "));

/** Ten US digits, or null. */
export function usDigits(phone: string): string | null {
  const d = phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return /^[2-9]\d{9}$/.test(d) ? d : null;
}

/** Field → what is wrong with it; an empty object means the form can go. */
export function registrationProblems(d: SmsRegistrationDetails): Partial<Record<keyof SmsRegistrationDetails, string>> {
  const p: Partial<Record<keyof SmsRegistrationDetails, string>> = {};
  const t = (s: string) => s.replace(/\s+/g, " ").trim();
  if (t(d.legalName).length < 2) p.legalName = "The business's legal name, as registered.";
  if (!BUSINESS_TYPES.some((b) => b.value === d.businessType)) p.businessType = "Pick the kind of business.";
  const ein = d.ein.replace(/\D/g, "");
  if (d.businessType !== "SOLE_PROPRIETOR" && ein.length !== 9) p.ein = "The nine-digit EIN, like 12-3456789.";
  if (d.businessType === "SOLE_PROPRIETOR" && ein && ein.length !== 9) p.ein = "Nine digits, or leave it empty.";
  if (t(d.street).length < 3) p.street = "The street address.";
  if (t(d.city).length < 2) p.city = "The city.";
  if (!US_STATES.has(t(d.state).toUpperCase())) p.state = "The two-letter state, like WA.";
  if (!/^\d{5}(-\d{4})?$/.test(t(d.zip))) p.zip = "The five-digit ZIP.";
  if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(t(d.website))) p.website = "The website, starting with https://.";
  if (t(d.contactFirst).length < 1) p.contactFirst = "Who Twilio can contact.";
  if (t(d.contactLast).length < 1) p.contactLast = "Their last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t(d.contactEmail))) p.contactEmail = "A working email address.";
  if (!usDigits(d.contactPhone)) p.contactPhone = "A US phone number.";
  return p;
}

/** The details trimmed, the EIN as 12-3456789, the state upper-cased. */
export function tidyDetails(d: SmsRegistrationDetails): SmsRegistrationDetails {
  const t = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
  const ein = (d.ein ?? "").replace(/\D/g, "");
  return {
    legalName: t(d.legalName).slice(0, 120),
    dba: t(d.dba).slice(0, 120),
    businessType: d.businessType,
    ein: ein.length === 9 ? `${ein.slice(0, 2)}-${ein.slice(2)}` : "",
    street: t(d.street).slice(0, 120),
    street2: t(d.street2).slice(0, 60),
    city: t(d.city).slice(0, 60),
    state: t(d.state).toUpperCase().slice(0, 2),
    zip: t(d.zip).slice(0, 10),
    website: t(d.website).slice(0, 200),
    contactFirst: t(d.contactFirst).slice(0, 60),
    contactLast: t(d.contactLast).slice(0, 60),
    contactEmail: t(d.contactEmail).toLowerCase().slice(0, 120),
    contactPhone: t(d.contactPhone).slice(0, 30),
  };
}

/** Twilio caps the free-text fields at 500 characters. */
export const TWILIO_TEXT_MAX = 500;
const cap = (s: string) => (s.length <= TWILIO_TEXT_MAX ? s : `${s.slice(0, TWILIO_TEXT_MAX - 1).trimEnd()}…`);

/** The opt-in picture every contractor's registration shows: the booking page's text checkbox. */
export const BOOKING_OPT_IN_IMAGE = "https://www.jobflex.app/twilio/opt-in-booking.png";

/**
 * Everything Twilio's toll-free verification asks, for one contractor, in the
 * Twilio library's names. `samples` are the company's own texts, made by the
 * templates themselves (registration.ts builds them).
 */
export function verificationFields(input: { details: SmsRegistrationDetails; companyName: string; samples: string[]; bookingUrl: string }) {
  const d = input.details;
  const name = (d.dba || input.companyName || d.legalName).slice(0, 60);
  const ein = d.ein.replace(/\D/g, "");
  return {
    businessName: d.legalName,
    ...(d.dba && d.dba !== d.legalName ? { doingBusinessAs: d.dba } : {}),
    businessWebsite: d.website,
    notificationEmail: "support@jobflex.app",
    useCaseCategories: ["ACCOUNT_NOTIFICATIONS", "CUSTOMER_CARE"],
    useCaseSummary: cap(
      `${name} is a home-improvement contractor. It texts its own clients and crew through JobFlex, its business software, from this number, which is used by ${name} only. A client who books a visit on its JobFlex booking page and ticks "Text me about my visit and estimate" gets the visit details, a reminder the evening before and the proposal they asked for; crew members get their job schedule. No marketing.`,
    ),
    productionMessageSample: cap(input.samples.filter(Boolean).join("\n")),
    optInImageUrls: [BOOKING_OPT_IN_IMAGE],
    optInType: "WEB_FORM" as const,
    messageVolume: "1,000",
    businessStreetAddress: d.street,
    ...(d.street2 ? { businessStreetAddress2: d.street2 } : {}),
    businessCity: d.city,
    businessStateProvinceRegion: d.state,
    businessPostalCode: d.zip,
    businessCountry: "US",
    businessType: d.businessType,
    ...(ein.length === 9 ? { businessRegistrationNumber: `${ein.slice(0, 2)}-${ein.slice(2)}`, businessRegistrationAuthority: "EIN" as const, businessRegistrationCountry: "US" } : {}),
    businessContactFirstName: d.contactFirst,
    businessContactLastName: d.contactLast,
    businessContactEmail: d.contactEmail,
    businessContactPhone: `+1${usDigits(d.contactPhone) ?? ""}`,
    additionalInformation: cap(
      `Submitted by JobFlex (ISV, jobflex.app) for its customer ${d.legalName}; this toll-free number serves this one business only. Opt-in: on its booking page (${input.bookingUrl}) the client ticks "Text me about my visit and estimate from ${name}", shown with frequency, rates and STOP/HELP (image: the same form). Crew give their own mobile to their employer for job schedules; their first text explains STOP. Opt-outs are never texted again.`,
    ),
    ageGatedContent: false,
  };
}

/** The settings card's words for each stage. */
export const REGISTRATION_COPY = {
  title: "Your texting number",
  sub: "Every text — to your team, your clients and your crew — goes out from a number of your own, registered with the carriers in your business's name. JobFlex buys it and pays for it; Twilio checks your business before it can send, usually within a few days.",
  get: "Get your texting number",
  paidOnly: "Your own texting number comes with a paid plan.",
  notConfigured: "Texting is not set up on this platform yet.",
  formIntro: "Twilio checks these against public records. Use the legal name and address on your EIN letter.",
  freeMail: "Twilio refuses free mailboxes (Gmail, Yahoo…) unless your website lists the address. An address on your own domain is safer.",
  submit: "Register my number",
  resubmit: "Fix and send again",
  pending: "Waiting for Twilio to approve your business. Texts start the moment it does; until then your team gets the same alerts by email and in the app.",
  approved: "Approved. Texts to your team, clients and crew go out from this number, with your name.",
  rejected: "Twilio sent it back. Fix what it asks below and send it again.",
  rejectedClosed: "Twilio sent it back and the time to correct it has passed. Release the number and start again.",
  failed: "Something went wrong on the way to Twilio.",
  check: "Check now",
  release: "Release this number",
  consent: "Clients get texts only after they tick “Text me about my visit and estimate” when they book online.",
  legacy: "This number was bought before registration existed, so carriers will not deliver its texts to clients. Release it, then get your registered number.",
} as const;

/** The form's first values: what JobFlex already knows about the company and the person filling it in. */
export function prefillDetails(
  company: { name: string; website: string | null; address: string | null; phone: string | null; slug: string },
  person: { name: string | null; email: string | null },
): SmsRegistrationDetails {
  const parts = (company.address ?? "").split(/,|\n/).map((x) => x.trim()).filter(Boolean);
  // "13620 NE 20th St, Suite I, Bellevue, WA 98005" → street, street2, city, state, zip
  const tail = parts.length ? parts[parts.length - 1] : "";
  const stZip = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(tail);
  const city = stZip && parts.length >= 3 ? parts[parts.length - 2] : "";
  const streets = stZip ? parts.slice(0, Math.max(0, parts.length - (city ? 2 : 1))) : parts.slice(0, 1);
  const [first, ...rest] = (person.name ?? "").trim().split(/\s+/);
  return {
    ...EMPTY_DETAILS,
    legalName: company.name,
    dba: company.name,
    website: company.website?.trim() || `https://www.jobflex.app/r/${company.slug}`,
    street: streets[0] ?? "",
    street2: streets.slice(1).join(", "),
    city,
    state: stZip ? stZip[1].toUpperCase() : "",
    zip: stZip ? stZip[2] : "",
    contactFirst: first ?? "",
    contactLast: rest.join(" "),
    contactEmail: person.email ?? "",
    contactPhone: company.phone ?? "",
  };
}

/** What the settings card shows: the state in words, never the Twilio ids. */
export type SmsRegistrationView = {
  stage: SmsRegistrationStage;
  /** The company's number, pretty, once bought. */
  number: string | null;
  reasons: string[];
  editUntil: string | null;
  /** Rejected, and Twilio still takes a correction. */
  canEdit: boolean;
  error: string | null;
  /** A paid plan: the only companies that can get a number. */
  paying: boolean;
  /** A number bought before registration existed (the old instant button): release it first. */
  legacy: boolean;
  details: SmsRegistrationDetails;
};
