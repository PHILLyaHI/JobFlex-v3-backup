// Referrals blueprint — row SHAPE only.
//
// The donor file (jobflex-referrals-blueprint_1.html) shipped an eight-row demo
// fixture here. It is gone: the page now reads the real `ReferralConversion`
// rows in src/app/dashboard/referrals/page.tsx and passes them down, so the
// only thing this module still owns is the type the server component fills.
//
// The donor's own note on the shape: "ReferralConversion: signupEmail,
// status (PENDING | CONVERTED | PAID), rewardCents, createdAt."

export type ConversionStatus = "PENDING" | "CONVERTED" | "PAID";

export type Conversion = {
  id: string;
  /** `ReferralConversion.signupEmail` */
  email: string;
  status: ConversionStatus;
  /** `ReferralConversion.rewardCents` — `money()` divides by 100. 0 when the
   *  credit has not been sized yet (every PENDING row). */
  reward: number;
  /** `relative(createdAt)` — "3d ago", already formatted server-side so the
   *  markup builder stays a pure string join. */
  when: string;
};
