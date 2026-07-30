// Referrals blueprint — demo fixture data, verbatim from the donor file
// jobflex-referrals-blueprint_1.html (script section). Values must not be
// edited independently of the donor: the page is a pixel-identical port,
// content included.
//
// The donor's own note on the shape: "ReferralConversion: signupEmail,
// status (PENDING | CONVERTED | PAID), rewardCents, createdAt."

export type ConversionStatus = "PENDING" | "CONVERTED" | "PAID";

export type Conversion = {
  id: string;
  email: string;
  status: ConversionStatus;
  /** reward in cents — `money()` divides by 100 */
  reward: number;
  when: string;
};

export const CONVERSIONS: Conversion[] = [
  { id: 'v1', email: 'ops@summitroofingnw.com',   status: 'PAID',      reward: 4900, when: '3d ago' },
  { id: 'v2', email: 'mike@ridgelinefence.com',   status: 'PAID',      reward: 4900, when: '1w ago' },
  { id: 'v3', email: 'hello@cascadeexteriors.co', status: 'CONVERTED', reward: 4900, when: '2w ago' },
  { id: 'v4', email: 'dana@northshoregutters.com', status: 'CONVERTED', reward: 4900, when: '2w ago' },
  { id: 'v5', email: 't.mercer@mercerdecks.com',  status: 'PENDING',   reward: 0,    when: '3w ago' },
  { id: 'v6', email: 'crew@evergreensiding.net',  status: 'PENDING',   reward: 0,    when: '1mo ago' },
  { id: 'v7', email: 'jr@harborfenceco.com',      status: 'PAID',      reward: 4900, when: '1mo ago' },
  { id: 'v8', email: 'admin@pugetpropertypm.com', status: 'PENDING',   reward: 0,    when: '2mo ago' }
];
