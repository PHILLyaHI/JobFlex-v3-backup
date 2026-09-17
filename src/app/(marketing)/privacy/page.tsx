import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

// The real policy, written against the app's ACTUAL cookie/tracking inventory
// (2026-09-03 audit, updated 2026-09-09): first-party PostHog analytics with
// session replay on public pages, the promo and landing attribution cookies,
// auth cookies, the cookie banner with its analytics and marketing choices,
// the Meta Pixel and Conversions API behind the marketing choice, payment
// processors, measurement providers. It promises nothing the app does not do
// — keep it in step with reality when the stack changes.
export const metadata = { title: "JobFlex · Privacy policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 lg:px-10 py-20 prose-editorial">
      <div className="quiet-caps mb-3">Privacy</div>
      <h1 className="font-display text-[42px] leading-[1.05] tracking-[-0.025em]">Privacy policy</h1>
      <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">Effective date: {LEGAL_EFFECTIVE_DATE}</p>

      <p>
        JobFlex is software for contractors — estimates, proposals, scheduling, and client management —
        operated from Washington State, USA. This policy explains what we collect, why, and what your
        choices are. It covers the JobFlex app, our marketing pages, and the homeowner request portal.
      </p>

      <h2>What we collect</h2>
      <ul className="list-disc pl-6 space-y-2 my-3 leading-[1.65] text-[color:var(--ink-soft)]">
        <li>
          <strong>Account information.</strong> Name, email, phone, and company details you provide when
          you sign up or edit your profile.
        </li>
        <li>
          <strong>Business data you enter.</strong> Your clients, proposals, jobs, schedules, and the
          property addresses and project details you enter to build estimates. This is your data; we store
          and process it to run the service for you.
        </li>
        <li>
          <strong>Property measurement data.</strong> When you run a roof or fence estimate, we send the
          property address or map location to our measurement providers (EagleView, Google Maps Platform)
          and store the returned measurements, imagery, and elevation data with your account.
        </li>
        <li>
          <strong>Homeowner requests.</strong> If you submit a project request through the homeowner
          portal, we collect your name, contact details, property address, and project description — see
          &ldquo;Homeowner requests&rdquo; below for who receives it.
        </li>
        <li>
          <strong>Payments.</strong> Subscriptions and payments are handled by our payment processors
          (Stripe, and where offered PayPal and Square). We never see or store your full card number. We
          keep records of transactions (amount, date, status, last four digits as reported by the
          processor).
        </li>
        <li>
          <strong>Usage and device data.</strong> We use PostHog, a first-party analytics service (hosted
          in PostHog&rsquo;s US Cloud), to count visitors and page views: IP address, browser and device
          type, and pages visited. On our public pages (marketing pages, sign-up, sign-in, the homeowner
          portal) PostHog also records session replays with every input masked; the signed-in app is never
          recorded. You can turn analytics off in the cookie banner.
        </li>
        <li>
          <strong>Advertising measurement.</strong> If you accept marketing cookies in the cookie banner, the
          Meta Pixel runs on our marketing and sign-up pages and sets the <code>_fbp</code> and{" "}
          <code>_fbc</code> cookies so Meta can tell which of our ads led to a sign-up. When you sign up we
          also send Meta a server-side conversion record (Conversions API) with a hashed email and, with
          your marketing consent, the pixel cookies, your IP address and browser type. Without that consent
          no pixel loads, no Meta cookie is set, and the server record carries the hashed email only.
        </li>
        <li>
          <strong>Promo attribution.</strong> If you arrive through a promo or referral link, we store the
          code in a cookie (<code>jf_attr</code>) and browser storage for 30 days so the discount or
          referral credit can be applied at signup.
        </li>
      </ul>

      <h2>Cookies and browser storage</h2>
      <p>
        Essential cookies are always set. Analytics and marketing cookies depend on where you are:
      </p>
      <ul className="list-disc pl-6 space-y-1 my-3 leading-[1.65] text-[color:var(--ink-soft)]">
        <li>
          <strong>United States and Canada.</strong> Analytics and marketing cookies are on by default and a
          notice at the bottom of the page tells you so. You can turn either off at any time from
          &ldquo;Cookie settings&rdquo; in the footer, and &ldquo;Do not sell or share my personal
          information&rdquo; in the footer turns marketing cookies off in one click (your opt-out under the
          California Consumer Privacy Act and similar state laws).
        </li>
        <li>
          <strong>Everywhere else.</strong> Analytics and marketing cookies are set only after you accept them
          in the cookie banner; until then only essential cookies run. You can change your choice any time
          from &ldquo;Cookie settings&rdquo; in the footer.
        </li>
      </ul>
      <p>
        Your region comes from our hosting provider&rsquo;s country lookup on the request; when it is
        unknown we use the opt-in model. We also use browser storage for conveniences like draft proposals,
        view settings, and dismissed banners — this stays on your device.
      </p>
      <table className="my-4 w-full text-[14px] leading-[1.5]">
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
            <th className="py-1.5 pr-3 font-semibold">Cookie</th>
            <th className="py-1.5 pr-3 font-semibold">Category</th>
            <th className="py-1.5 pr-3 font-semibold">Purpose</th>
            <th className="py-1.5 font-semibold">Duration</th>
          </tr>
        </thead>
        <tbody className="text-[color:var(--ink-soft)]">
          <tr><td className="py-1.5 pr-3"><code>authjs.*</code></td><td className="py-1.5 pr-3">Essential</td><td className="py-1.5 pr-3">Sign-in session and CSRF protection</td><td className="py-1.5">7 days or less</td></tr>
          <tr><td className="py-1.5 pr-3"><code>jf_consent</code></td><td className="py-1.5 pr-3">Essential</td><td className="py-1.5 pr-3">Your cookie choices</td><td className="py-1.5">180 days</td></tr>
          <tr><td className="py-1.5 pr-3"><code>jf_attr</code></td><td className="py-1.5 pr-3">Essential</td><td className="py-1.5 pr-3">Promo or referral code to apply at sign-up</td><td className="py-1.5">30 days</td></tr>
          <tr><td className="py-1.5 pr-3"><code>jf_industry</code>, <code>jf_utm</code></td><td className="py-1.5 pr-3">Essential</td><td className="py-1.5 pr-3">The trade page and campaign you arrived from, so sign-up pre-fills your trade</td><td className="py-1.5">30 days</td></tr>
          <tr><td className="py-1.5 pr-3"><code>ph_*</code></td><td className="py-1.5 pr-3">Analytics</td><td className="py-1.5 pr-3">PostHog visitor and page-view counting, session replay on public pages</td><td className="py-1.5">1 year</td></tr>
          <tr><td className="py-1.5 pr-3"><code>_fbp</code>, <code>_fbc</code></td><td className="py-1.5 pr-3">Marketing</td><td className="py-1.5 pr-3">Meta Pixel — advertising measurement (which ad led to a sign-up)</td><td className="py-1.5">90 days</td></tr>
        </tbody>
      </table>

      <h2>How we use information</h2>
      <p>
        To provide and operate the service; to produce measurements and estimates you request; to bill
        subscriptions; to respond to support requests; to understand aggregate usage of our pages; and to
        protect the service against fraud and abuse.
      </p>
      <p>
        <strong>Selling and sharing.</strong> Except for advertising measurement through the Meta Pixel,
        which the California Consumer Privacy Act may treat as &ldquo;sharing&rdquo; for cross-context
        behavioral advertising, we do not sell or share personal information. You can opt out of that
        sharing at any time with &ldquo;Do not sell or share my personal information&rdquo; in the page
        footer. We disclose information only to the service providers below, acting on our instructions.
      </p>

      <h2>Service providers</h2>
      <ul className="list-disc pl-6 space-y-1 my-3 leading-[1.65] text-[color:var(--ink-soft)]">
        <li>Stripe, PayPal, Square — payment processing</li>
        <li>PostHog (US Cloud) — first-party analytics and session replay on public pages</li>
        <li>Meta Platforms — advertising measurement (Meta Pixel and Conversions API), only with your marketing consent; server records carry a hashed email</li>
        <li>Google Maps Platform — geocoding, mapping, imagery, ground elevation</li>
        <li>EagleView — aerial property measurements</li>
        <li>Vercel — hosting and file storage</li>
      </ul>

      <h2>Homeowner requests</h2>
      <p>
        When you request quotes through the homeowner portal, your name, contact details, property
        address, and project description are sent to the contractor (or contractors) your request is
        routed to. Contractors use that information under their own privacy practices to contact you and
        prepare a quote. If you ask to be matched with a different contractor, the new contractor receives
        the same request details.
      </p>

      <h2>Retention</h2>
      <p>
        We keep your account and business data while your account is active and as needed to meet legal
        and accounting obligations. Homeowner request records are retained up to 24 months, then deleted
        or anonymized. You can ask us to delete your account and associated personal information at any
        time.
      </p>

      <h2>Your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your personal information by emailing{" "}
        <strong>{LEGAL_CONTACT_EMAIL}</strong>. We will verify your request and respond within the time
        required by applicable law (for California residents, the CCPA). We do not discriminate against
        you for exercising these rights. If a contractor holds information about you as their client,
        direct your request to that contractor — see &ldquo;Your clients&rsquo; data&rdquo; in our{" "}
        <a href="/terms">Terms of service</a>.
      </p>

      <h2>Children</h2>
      <p>
        JobFlex is a business tool and is not directed to children under 16. We do not knowingly collect
        their information.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we will update the date above and, for material changes, notify account
        holders by email or an in-app announcement.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <strong>{LEGAL_CONTACT_EMAIL}</strong>. JobFlex operates under the laws of
        the State of Washington, USA.
      </p>
    </main>
  );
}
