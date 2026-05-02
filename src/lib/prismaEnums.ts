// String-literal enums replacing Prisma native enums (SQLite has no enum support).
// Import these instead of from @prisma/client.

export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  SALES: "SALES",
  ESTIMATOR: "ESTIMATOR",
  INSTALLER: "INSTALLER",
  ACCOUNTANT: "ACCOUNTANT",
  USER: "USER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const LeadStatus = {
  NEW: "NEW",
  ROUTED: "ROUTED",
  CLAIMED: "CLAIMED",
  CONTACTED: "CONTACTED",
  QUOTED: "QUOTED",
  WON: "WON",
  LOST: "LOST",
  ARCHIVED: "ARCHIVED",
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const ProposalStatus = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  VIEWED: "VIEWED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  PAID: "PAID",
  EXPIRED: "EXPIRED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];

export const MeasurementType = {
  SQFT: "SQFT",
  LINEAR_FT: "LINEAR_FT",
  CUBIC_FT: "CUBIC_FT",
  UNIT: "UNIT",
  HOUR: "HOUR",
  LUMP_SUM: "LUMP_SUM",
} as const;
export type MeasurementType = (typeof MeasurementType)[keyof typeof MeasurementType];

export const PaymentStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentProvider = {
  STRIPE: "STRIPE",
  SQUARE: "SQUARE",
  PAYPAL: "PAYPAL",
  MANUAL: "MANUAL",
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const JobStatus = {
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const AssignmentStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  COMPLETED: "COMPLETED",
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const SubscriptionStatus = {
  FREE: "FREE",
  TRIALING: "TRIALING",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELED: "CANCELED",
  EXPIRED: "EXPIRED",
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const SubscriptionPlan = {
  FREE: "FREE",
  STARTER: "STARTER",
  PROFESSIONAL: "PROFESSIONAL",
  ENTERPRISE: "ENTERPRISE",
} as const;
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const ActivityKind = {
  CREATED: "CREATED",
  UPDATED: "UPDATED",
  SENT: "SENT",
  VIEWED: "VIEWED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  PAID: "PAID",
  NOTE: "NOTE",
  CALL: "CALL",
  EMAIL: "EMAIL",
  SMS: "SMS",
} as const;
export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];

export const ProjectStatus = {
  ACTIVE: "ACTIVE",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ApplicantStatus = {
  APPLIED: "APPLIED",
  INTERVIEWING: "INTERVIEWING",
  HIRED: "HIRED",
  REJECTED: "REJECTED",
} as const;
export type ApplicantStatus = (typeof ApplicantStatus)[keyof typeof ApplicantStatus];

export const ChangeOrderStatus = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
} as const;
export type ChangeOrderStatus = (typeof ChangeOrderStatus)[keyof typeof ChangeOrderStatus];

export const InvoiceStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const InfluencerPayoutStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
} as const;
export type InfluencerPayoutStatus = (typeof InfluencerPayoutStatus)[keyof typeof InfluencerPayoutStatus];
