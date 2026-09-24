import { ArrowUpRight, ChevronDown } from "lucide-react";
import styles from "./provider-key-guide.module.css";

/** Setup help shared by the desktop and handheld integration cards. */
export function ProviderKeyGuide({ provider, expanded, oauthAvailable }: {
  provider: "stripe" | "square";
  expanded: boolean;
  oauthAvailable: boolean;
}) {
  const stripe = provider === "stripe";
  return <details className={styles.guide} open={expanded}>
    <summary>How to get your {stripe ? "Stripe API key" : "Square access token"}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className={styles.body}>
      {stripe ? <ol className={styles.steps}>
        <li><a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer">Open Stripe API keys <ArrowUpRight size={14} aria-hidden="true" /></a>. Choose <strong>Live mode</strong> for real payments.</li>
        <li>Select <strong>Create restricted key</strong>. If asked, choose <strong>Providing this key to another website</strong>.</li>
        <li>Name it <strong>JobFlex</strong>. If asked for a website, enter <code>https://www.jobflex.app</code> and select <strong>Customize permissions for this key</strong>.</li>
        <li>Set these permissions. Leave other resources at <strong>None</strong>.
          <table className={styles.permissions}>
            <caption>Stripe key permissions</caption>
            <thead><tr><th scope="col">Resource</th><th scope="col">Access</th></tr></thead>
            <tbody>
              <tr><th scope="row">Accounts</th><td>Read</td></tr>
              <tr><th scope="row">Checkout Sessions</th><td>Write</td></tr>
              <tr><th scope="row">Webhook Endpoints</th><td>Write</td></tr>
              <tr><th scope="row">PaymentIntents, Charges, Refunds</th><td>Read</td></tr>
            </tbody>
          </table>
        </li>
        <li>Create and copy the key. In JobFlex, choose <strong>Use API key</strong>, paste it, then select <strong>Connect with this key</strong>.</li>
      </ol> : <>
        {oauthAvailable && <p className={styles.note}><strong>Easiest option:</strong> select Connect Square above and approve access. No token to copy.</p>}
        <ol className={styles.steps}>
          <li><a href="https://developer.squareup.com/apps" target="_blank" rel="noreferrer">Open Square Developer Console <ArrowUpRight size={14} aria-hidden="true" /></a> and sign in to your business account.</li>
          <li>Open your application, or create one named <strong>JobFlex</strong>.</li>
          <li>Choose <strong>Production</strong>, then <strong>Credentials</strong>.</li>
          <li>Under <strong>Production Access token</strong>, select <strong>Show</strong> and copy the token.</li>
          <li>In JobFlex, choose <strong>Use access token</strong>, paste it, then select <strong>Connect with this token</strong>.</li>
        </ol>
        <p className={styles.note}>A personal token grants full API access to your Square account; there is no permission checklist.</p>
      </>}
      <p className={styles.note}>Paste only into JobFlex’s {stripe ? "key" : "token"} field. It is stored encrypted.</p>
    </div>
  </details>;
}
