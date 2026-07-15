// Shared retry for outbound email transports (Resend / SMTP / Gmail).
// Kept dependency-free (imports nothing from resend/smtp/gmail) so every
// transport can use it without creating a circular import.
//
// Policy: up to 3 attempts total on TRANSIENT failures (network blips, 429,
// 5xx from the provider, SMTP 4xx greylist/timeout), with exponential backoff.
// PERMANENT failures (bad recipient address, 401/403 auth / invalid key, SMTP
// 5xx) are thrown immediately — retrying them is pointless.

/**
 * Backoff (ms) BEFORE each retry. Length = max retries, so [500, 1500] gives up
 * to 3 attempts total (initial + 2 retries), honoring "up to 3 attempts".
 * Add a third value (e.g. 4000) here to allow a 4th attempt.
 */
const RETRY_DELAYS_MS = [500, 1500];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Recipient(s) as a plain string for log lines. Email addresses are not secrets. */
export function recipientLabel(to: string | string[]): string {
  return Array.isArray(to) ? to.join(", ") : to;
}

/**
 * Decide whether an email-send error is worth retrying. Defaults to retrying on
 * unknown / network errors, and refuses to retry clearly-permanent ones so a bad
 * address or invalid key fails fast.
 */
export function isTransientEmailError(err: unknown): boolean {
  const e = (err ?? {}) as {
    code?: unknown;
    responseCode?: unknown;
    statusCode?: unknown;
    status?: unknown;
    name?: unknown;
    response?: { status?: unknown };
  };

  // Nodemailer / SMTP numeric response code: SMTP semantics are the reverse of
  // HTTP — 4xx is transient (greylist, timeout, mailbox busy), 5xx is permanent
  // (bad mailbox, blocked sender).
  if (typeof e.responseCode === "number") {
    return e.responseCode >= 400 && e.responseCode < 500;
  }

  // Node socket / DNS errors (string codes) are transient.
  if (
    typeof e.code === "string" &&
    /ETIMEDOUT|ETIMEOUT|ECONNRESET|ECONNREFUSED|ECONNABORTED|ESOCKET|ECONNECTION|EAI_AGAIN|ENOTFOUND|EPIPE|ENETUNREACH/i.test(
      e.code,
    )
  ) {
    return true;
  }

  // HTTP-style status (Resend / Gmail / Gaxios): 408 + 429 + 5xx transient;
  // other 4xx (400/401/403/404/422 — bad address, auth, validation) permanent.
  const status =
    (typeof e.statusCode === "number" && e.statusCode) ||
    (typeof e.status === "number" && e.status) ||
    (typeof e.response?.status === "number" && e.response.status) ||
    (typeof e.code === "number" && e.code) ||
    undefined;
  if (typeof status === "number") {
    if (status === 429 || status === 408) return true;
    return status >= 500;
  }

  // Resend surfaces failures by `name` (it returns { data, error }, not a throw).
  // Rate-limit / server errors are transient; validation (bad address) and auth
  // (invalid key) are permanent.
  if (typeof e.name === "string") {
    const n = e.name.toLowerCase();
    if (n.includes("rate_limit") || n.includes("internal_server") || n.includes("application_error")) {
      return true;
    }
    if (
      n.includes("validation") ||
      n.includes("invalid") ||
      n.includes("not_authorized") ||
      n.includes("restricted") ||
      n.includes("missing")
    ) {
      return false;
    }
  }

  // Unknown shape → give it the benefit of the doubt (a transient blip).
  return true;
}

/**
 * Run an email send with up to 3 attempts on transient failure.
 * `attempt` MUST throw on failure (Resend's { error } must be converted to a
 * throw by the caller). `label` is used only for the final-failure log line and
 * should identify the transport + recipient — never the body or any secret.
 */
export async function withEmailRetry<T>(
  label: string,
  attempt: () => Promise<T>,
  isTransient: (err: unknown) => boolean = isTransientEmailError,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      const isFinalAttempt = i === RETRY_DELAYS_MS.length;
      if (isFinalAttempt || !isTransient(err)) {
        console.error(
          `[email] send failed via ${label} after ${i + 1} attempt(s):`,
          (err as { message?: string })?.message ?? err,
        );
        throw err;
      }
      await sleep(RETRY_DELAYS_MS[i]);
    }
  }
  // Unreachable (loop either returns or throws), but satisfies the type checker.
  throw lastErr;
}
