// Business details provided by the operator. Verify inbox delivery before launch.
export const LEGAL_OPERATOR_NAME = "Dmitiriy Apetenok";
export const LEGAL_CONTACT_EMAIL = "support@jobflex.app";

/** "Last updated" per legal page. Bump a page's entry when its text materially changes. */
export const LEGAL_UPDATED = {
  privacy: { iso: "2026-09-22", label: "September 22, 2026" },
  terms: { iso: "2026-09-20", label: "September 20, 2026" },
} as const;
