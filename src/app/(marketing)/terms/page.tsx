import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

// B2B-SaaS terms. Section 5 (estimates are estimates, verify on site) is the
// load-bearing clause for this product — keep it when editing.
export const metadata = { title: "JobFlex · Terms of service" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 lg:px-10 py-20 prose-editorial">
      <div className="quiet-caps mb-3">Terms</div>
      <h1 className="font-display text-[42px] leading-[1.05] tracking-[-0.025em]">Terms of service</h1>
      <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">Effective date: {LEGAL_EFFECTIVE_DATE}</p>

      <p>
        These terms are an agreement between you and JobFlex (&ldquo;we&rdquo;) for use of the JobFlex
        platform — estimating, proposals, scheduling, and client management software for contractors. By
        creating an account or using the service you accept them. If you use JobFlex on behalf of a
        company, you accept them for that company.
      </p>

      <h2>1. Accounts</h2>
      <p>
        You are responsible for the accuracy of your account information and for everything done under
        your credentials. Keep them safe, and tell us promptly at <strong>{LEGAL_CONTACT_EMAIL}</strong>{" "}
        if you suspect unauthorized access. The organization owner controls who has access to the
        organization&rsquo;s workspace.
      </p>

      <h2>2. Subscription and billing</h2>
      <p>
        Paid plans are billed through Stripe on a recurring basis until cancelled. You can cancel at any
        time; cancellation takes effect at the end of the current billing period. Amounts already billed
        are not refunded — except that within 14 days of your first charge you can request a full refund
        of it, no questions asked. We may change prices with at least 30 days&rsquo; notice before your
        next renewal.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        Don&rsquo;t use JobFlex to break the law, to send spam, to upload malicious code, to probe or
        disrupt the service, or to infringe anyone&rsquo;s rights. Don&rsquo;t resell access or scrape the
        platform. We may suspend accounts that put the service or other customers at risk.
      </p>

      <h2>4. Your clients&rsquo; data</h2>
      <p>
        You control the client information you put into JobFlex — you are the data controller for your
        clients and homeowner leads; we process that data on your behalf to run the service. You are
        responsible for having the right to enter it and for honoring your own obligations to your clients
        (including privacy notices and deletion requests). If your client asks us directly about data you
        hold on them, we will refer them to you.
      </p>

      <h2>5. Estimates and measurements are estimates</h2>
      <p>
        Roof, fence, and other measurements and estimates produced by JobFlex are derived from aerial
        imagery, elevation data, parcel records, and other third-party sources, and from inputs you
        provide. <strong>They are estimates, not guarantees.</strong> Data sources can be outdated,
        occluded, or wrong, and automated measurement has inherent error.{" "}
        <strong>
          You must verify measurements, quantities, and site conditions on site before signing contracts,
          ordering materials, or committing to prices.
        </strong>{" "}
        We are not liable for losses that result from relying on an estimate without verification.
      </p>

      <h2>6. Homeowner requests</h2>
      <p>
        Where JobFlex routes homeowner project requests to contractors, we act only as a conduit. Any
        contract for work is between the contractor and the homeowner; we are not a party to it and
        don&rsquo;t guarantee either side&rsquo;s performance.
      </p>

      <h2>7. Your content and our software</h2>
      <p>
        Your data stays yours. You give us the limited license needed to host, process, and display it in
        order to run the service. The JobFlex software, design, and branding are ours; these terms
        don&rsquo;t transfer any rights in them.
      </p>

      <h2>8. Service changes and availability</h2>
      <p>
        We improve the service continuously and may add, change, or retire features. We aim for high
        availability but do not promise uninterrupted service.
      </p>

      <h2>9. Disclaimer</h2>
      <p>
        The service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>,
        without warranties of any kind, express or implied, including fitness for a particular purpose and
        non-infringement.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the fullest extent allowed by law, we are not liable for indirect, incidental, special, or
        consequential damages, or lost profits. Our total liability for any claim is limited to the
        amounts you paid us in the 12 months before the claim arose.
      </p>

      <h2>11. Termination</h2>
      <p>
        You can stop using JobFlex and delete your account at any time. We may suspend or terminate
        accounts that materially breach these terms, after notice where practical. Sections that by their
        nature should survive (4, 5, 7, 9, 10, 12) survive termination.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Washington, USA, and disputes will be
        resolved in the state or federal courts located in Washington. If part of these terms is found
        unenforceable, the rest remains in effect.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms; for material changes we will notify account holders by email or an
        in-app announcement at least 14 days before they take effect. Continuing to use the service after
        that means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        <strong>{LEGAL_CONTACT_EMAIL}</strong> · See also our <a href="/privacy">Privacy policy</a>.
      </p>
    </main>
  );
}
