"use client";

// MOBILE · Create account (/mobile-v1/auth/register)
// ─────────────────────────────────────────────────────────────────────────────
// A handheld composition of the blueprint register surface. It sits BESIDE the
// desktop page at /auth/register — neither replaces the other, and no file
// under components/v3/auth-register-blueprint/ was touched.
//
// WHAT IS CARRIED OVER UNCHANGED from the desktop port
// (components/v3/auth-register-blueprint/register-content.tsx):
//   · the two-step flow with its third "done" state, Back and Skip;
//   · the donor's literal validation strings and the `tradeNote` counter copy;
//   · registerAccount (server action) → signIn("credentials") → done, with the
//     signIn-failure branch that toasts "Account created" and routes to
//     /auth/login;
//   · signIn("google", { callbackUrl: "/dashboard" }) with the 1600ms label
//     swap, and the 1800ms "Learn more" swap;
//   · the show/hide password toggle (the confirm-password field below it gets
//     its own independent one);
//   · the trade chip picker validating against the canonical TRADE_TYPES;
//   · the ?promo / ?ref → 30-day cookie → localStorage → validateAttributionCode
//     attribution chain (see mobile-referral-panel.tsx).
// No server action, API route or Prisma model was added or altered.
//
// WHAT IS DELIBERATELY NOT CARRIED
//   · the split layout's right-hand drafting sheet and its `--news-h`
//     measurement effect. That effect exists only to pin `.side-perk` above the
//     quote card in a two-column desktop grid; there is no second column here,
//     so both the measurement and the resize listener are dead weight. The
//     PANEL CONTENT survives: the perk block is a card inside step 2 and the
//     quote is a card at the foot of step 1.
//
// LAYOUT MODEL — mobile-only, 320→768px, no `md:`/`lg:` variants, no UA
// sniffing. A sticky ink masthead, a scrolling sheet, and a sticky bottom
// action bar that keeps the primary action in the thumb zone on every step.

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "@/components/ui/Toast";
import { checkEmailAvailable, completeCompanySetup, registerAccount } from "@/actions/auth";
import type { SetupPrefill } from "@/app/(auth)/auth/register/register-responsive";
import { TRADE_TYPES, type TradeType } from "@/lib/tradeTypes";
// One definition of the success-panel hold, shared with the desktop surface.
import { REDIRECT_SECONDS } from "@/components/v3/auth-register-blueprint/register-content";
import { MobileRegisterSprite } from "./mobile-register-sprite";
import {
  MobileReferralPanel,
  MobileReferralPill,
  type ResolvedAttribution,
} from "./mobile-referral-panel";
import "./mobile-auth-register.css";

type Step = 1 | 2 | 3;

/* ── The 21-trade problem ───────────────────────────────────────────────────
   The blueprint mockup hard-coded 10 chips (including "Gutters", which is not
   in TRADE_TYPES and would be rejected by registerSchema's z.enum). The desktop
   port therefore renders all 21 canonical trades — on a 320px phone that is
   eight unbroken rows of chips with no scent of structure.

   Solution: keep all 21 rendered, none hidden behind a "show more", but give
   them the drawing's own organising device — mono-cap section annotations. Five
   clusters of 2–6 chips scan in one pass, and a type-to-filter field above them
   gets a contractor who knows their trade there in three keystrokes.

   The grouping is a VIEW over TRADE_TYPES, never a copy of it: anything in
   TRADE_TYPES that no cluster claims is collected into a trailing group below,
   so adding a trade upstream can never make it unreachable here. */
const TRADE_CLUSTERS: ReadonlyArray<{ label: string; trades: readonly TradeType[] }> = [
  { label: "Interior", trades: ["Flooring", "Tile", "Countertops", "Kitchen & Bath", "Drywall", "Painting"] },
  { label: "Exterior", trades: ["Roofing", "Siding", "Windows", "Fencing", "Decking", "Landscaping"] },
  { label: "Systems", trades: ["Plumbing", "Electrical", "HVAC", "Insulation"] },
  { label: "Structure", trades: ["Carpentry", "Concrete", "Demolition"] },
  { label: "General", trades: ["General Contractor", "Other"] },
];

const CLAIMED = new Set<string>(TRADE_CLUSTERS.flatMap((g) => [...g.trades]));
const UNCLAIMED = TRADE_TYPES.filter((t) => !CLAIMED.has(t));
const TRADE_GROUPS: ReadonlyArray<{ label: string; trades: readonly TradeType[] }> =
  UNCLAIMED.length > 0
    ? [...TRADE_CLUSTERS, { label: "Other trades", trades: UNCLAIMED }]
    : TRADE_CLUSTERS;

// Donor `#tradeNote`, verbatim.
function tradeNote(n: number): string {
  return n === 0
    ? "No trades picked — you can add them later, but no leads will be matched."
    : n + (n === 1 ? " trade" : " trades") + " selected — leads will be matched to these.";
}

export function MobileRegisterContent({ setup = null }: { setup?: SetupPrefill | null }) {
  const router = useRouter();
  // A Google signup finishing its company step; see the desktop build.
  const setupMode = setup !== null;

  const [step, setStep] = React.useState<Step>(setupMode ? 2 : 1);

  const [name, setName] = React.useState(setup?.name ?? "");
  const [biz, setBiz] = React.useState(setup?.businessName ?? "");
  const [email, setEmail] = React.useState(setup?.email ?? "");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [password2, setPassword2] = React.useState("");
  const [showPw2, setShowPw2] = React.useState(false);

  const [addr, setAddr] = React.useState("");
  const [phone, setPhone] = React.useState(setup?.companyPhone || setup?.phone || "");
  const [trades, setTrades] = React.useState<TradeType[]>([]);
  // The free-text line behind the "Other" chip — see toggleTrade below.
  const [otherTrade, setOtherTrade] = React.useState("");
  const otherRef = React.useRef<HTMLInputElement>(null);
  // Success panel hold before the handover to the dashboard.
  const [countdown, setCountdown] = React.useState(REDIRECT_SECONDS);
  const [tradeQuery, setTradeQuery] = React.useState("");

  // The resolved promo/referral. `attribution` — the shape registerAccount
  // takes — is derived from it, so there is exactly one source of truth for the
  // capture chain.
  const [pill, setPill] = React.useState<ResolvedAttribution | null>(null);
  const attribution = pill ? { kind: pill.kind, code: pill.code } : null;
  const [err1, setErr1] = React.useState<string | null>(null);
  const [err2, setErr2] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  // Step-1 gate: the duplicate-email check runs before the step swaps, so the
  // Continue button owns a busy state of its own.
  const [checking, setChecking] = React.useState(false);
  const [doneNote, setDoneNote] = React.useState("");
  const [googleBusy, setGoogleBusy] = React.useState(false);
  const [learnBusy, setLearnBusy] = React.useState(false);

  // Changing step swaps the whole sheet — start the new one at the top, or the
  // user lands mid-form on a shorter step.
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // Five-second hold on the success panel, then hand over to the dashboard. The
  // sticky bar's "Open the dashboard" button still works for anyone who would
  // rather not wait; the timer is cleared on unmount so they are not navigated
  // twice.
  React.useEffect(() => {
    if (step !== 3) return;
    if (countdown <= 0) {
      router.push("/dashboard" as Route);
      return;
    }
    const t = window.setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [step, countdown, router]);

  function toggleTrade(t: TradeType) {
    setTrades((prev) => {
      const on = prev.includes(t);
      // Same contract as the desktop surface: "Other" carries a free-text line,
      // cleared when the chip goes back off so a stale label cannot be sent for
      // a chip nobody has selected, and focused on the way in.
      if (t === "Other" && on) setOtherTrade("");
      if (t === "Other" && !on) window.setTimeout(() => otherRef.current?.focus(), 0);
      return on ? prev.filter((x) => x !== t) : [...prev, t];
    });
  }

  const q = tradeQuery.trim().toLowerCase();
  const visibleGroups = TRADE_GROUPS.map((g) => ({
    label: g.label,
    trades: q ? g.trades.filter((t) => t.toLowerCase().includes(q)) : g.trades,
  })).filter((g) => g.trades.length > 0);

  // Donor `#step1Form` submit — the donor's client-side checks, then a real
  // server round trip so a taken email is caught HERE rather than after the
  // user has already filled in step 2.
  async function onStep1(e: React.FormEvent) {
    e.preventDefault();
    if (checking) return;
    const n = name.trim();
    const b = biz.trim();
    const em = email.trim();
    if (!n || !b || !em) {
      setErr1("Name, business name and email are required.");
      return;
    }
    if (em.indexOf("@") === -1) {
      setErr1("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setErr1("Password must be at least 8 characters.");
      return;
    }
    if (password2 !== password) {
      setErr1("Passwords do not match.");
      return;
    }
    setErr1(null);
    setChecking(true);
    try {
      const res = await checkEmailAvailable(em);
      if (!res.available) {
        setErr1(res.message || "That email is already registered. Try signing in instead.");
        return;
      }
      setDoneNote(b + " is ready.");
      setStep(2);
    } catch (err: unknown) {
      setErr1(err instanceof Error ? err.message : "Couldn't check that email.");
    } finally {
      setChecking(false);
    }
  }

  // Donor `finish(withCompany)` — the real registerAccount + signIn round trip.
  async function finish(withCompany: boolean) {
    if (creating) return;
    setCreating(true);
    setErr2(null);
    try {
      if (setupMode) {
        if (!biz.trim()) {
          setErr2("Enter your business name.");
          return;
        }
        if (!addr.trim() || trades.length === 0) {
          setErr2("Address and at least one trade are needed: leads are matched on them.");
          return;
        }
        await completeCompanySetup({
          businessName: biz.trim(),
          companyAddress: addr.trim(),
          companyPhone: phone.trim() || undefined,
          phone: phone.trim() || undefined,
          tradeTypes: trades,
          otherTrade:
            trades.includes("Other") && otherTrade.trim() ? otherTrade.trim() : undefined,
        });
        toast.success("Welcome to JobFlex", "Your company is set up. Pick a plan to go live.");
        router.push("/dashboard/upgrade" as Route);
        return;
      }
      await registerAccount({
        name: name.trim(),
        businessName: biz.trim(),
        email: email.trim(),
        password,
        companyAddress: withCompany ? addr.trim() || undefined : undefined,
        companyPhone: withCompany ? phone.trim() || undefined : undefined,
        tradeTypes: withCompany && trades.length ? trades : undefined,
        otherTrade:
          withCompany && trades.includes("Other") && otherTrade.trim()
            ? otherTrade.trim()
            : undefined,
        attribution: attribution ?? undefined,
      });
      // Account exists — establish the session client-side, then land on the app.
      const res = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (res?.error) {
        // Account was created but auto sign-in failed — send them to login.
        toast.success("Account created", "Please sign in to continue.");
        router.push("/auth/login" as Route);
        return;
      }
      if (!withCompany) {
        setDoneNote(
          (prev) =>
            prev +
            " Add your address and trades in Company settings when you want matched leads.",
        );
      }
      toast.success("Welcome to JobFlex", "Your workspace is ready.");
      setStep(3);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't create your account.";
      setErr2(msg);
      toast.error("Couldn't create account", msg);
    } finally {
      setCreating(false);
    }
  }

  // Donor `#learnMore`: swaps its own label for 1800ms.
  function onLearnMore() {
    if (learnBusy) return;
    setLearnBusy(true);
    window.setTimeout(() => setLearnBusy(false), 1800);
  }

  // Donor `#googleBtn`: swaps its label for 1600ms, accompanying the real
  // next-auth redirect.
  function onGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    window.setTimeout(() => setGoogleBusy(false), 1600);
    void signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="jf-mobile-auth-register">
      <MobileRegisterSprite />

      {/* ── masthead: the inverse plate the desktop spends a whole column on ── */}
      <header className="mr-top">
        <Link className="mr-brand" href={"/" as Route}>
          <span className="mr-mark">J</span>
          <span className="mr-word">
            <span className="mr-word-n">JobFlex</span>
            <span className="mr-word-s">Contractor OS</span>
          </span>
        </Link>
        <span className="mr-stamp">{step === 3 ? "Done" : `Step ${step}/2`}</span>
      </header>

      <main className="mr-sheet">
        {/* ── progress: two drawing cells, never a wrapping rail ── */}
        {step !== 3 && (
          <div className="mr-steps" aria-label="Signup progress">
            <div className={step === 1 ? "mr-cell is-on" : "mr-cell is-done"}>
              <span className="mr-cell-n">1</span>
              <span className="mr-cell-tx">
                <span className="mr-cell-t">Your account</span>
                <span className="mr-cell-h">Required</span>
              </span>
            </div>
            <div className={step === 2 ? "mr-cell is-on" : "mr-cell"}>
              <span className="mr-cell-n">2</span>
              <span className="mr-cell-tx">
                <span className="mr-cell-t">Your company</span>
                <span className="mr-cell-h">{setupMode ? "Required" : "Optional"}</span>
              </span>
            </div>
          </div>
        )}

        {/* ═══════════ STEP 1 ═══════════ */}
        <section className={step === 1 ? "mr-step" : "mr-step is-hidden"} aria-hidden={step !== 1}>
          <h1 className="mr-h1">Register.</h1>


          <form id="mr-step1-form" noValidate onSubmit={(e) => void onStep1(e)}>
            <label className="mr-fld" htmlFor="mr-name">
              <span className="mr-lbl">Your name</span>
              <input
                className="mr-in"
                id="mr-name"
                name="name"
                placeholder="First and last"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="mr-fld" htmlFor="mr-biz">
              <span className="mr-lbl">Business name</span>
              <input
                className="mr-in"
                id="mr-biz"
                name="businessName"
                placeholder="Company name"
                autoComplete="organization"
                value={biz}
                onChange={(e) => setBiz(e.target.value)}
              />
            </label>
            <label className="mr-fld" htmlFor="mr-email">
              <span className="mr-lbl">Email</span>
              <input
                className="mr-in"
                type="email"
                id="mr-email"
                name="email"
                placeholder="you@yourshop.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="mr-fld">
              <label className="mr-lbl" htmlFor="mr-password">
                Password
              </label>
              <span className="mr-pw">
                <input
                  className="mr-in"
                  type={showPw ? "text" : "password"}
                  id="mr-password"
                  name="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="mr-pw-btn"
                  type="button"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                  onClick={() => setShowPw((v) => !v)}
                >
                  <svg className="ic" aria-hidden="true">
                    <use href={showPw ? "#mrg-eye-off" : "#mrg-eye"} />
                  </svg>
                </button>
              </span>
              <span className="mr-note">At least 8 characters.</span>
            </div>
            <div className="mr-fld">
              <label className="mr-lbl" htmlFor="mr-password-confirm">
                Confirm password
              </label>
              <span className="mr-pw">
                <input
                  className="mr-in"
                  type={showPw2 ? "text" : "password"}
                  id="mr-password-confirm"
                  name="passwordConfirm"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                />
                <button
                  className="mr-pw-btn"
                  type="button"
                  aria-label={showPw2 ? "Hide confirmation password" : "Show confirmation password"}
                  aria-pressed={showPw2}
                  onClick={() => setShowPw2((v) => !v)}
                >
                  <svg className="ic" aria-hidden="true">
                    <use href={showPw2 ? "#mrg-eye-off" : "#mrg-eye"} />
                  </svg>
                </button>
              </span>
              <span className="mr-note">Type it again to confirm.</span>
            </div>

            {/* the attribution entry affordance lives BELOW the required
                fields; the earned pill (above) lives under the headline */}
            {/* The applied code sits where the code field was — under the
                form, not above it (owner, 2026-09-03). */}
            {pill ? (
              <MobileReferralPill pill={pill} />
            ) : (
              <MobileReferralPanel resolved={pill} onResolved={setPill} />
            )}

            <div className={err1 ? "mr-err" : "mr-err is-hidden"} role="alert">
              {err1}
            </div>
          </form>

          <div className="mr-div">
            <span className="mr-caps">or</span>
          </div>

          <button className="mr-btn mr-btn--ghost" type="button" onClick={onGoogle}>
            {googleBusy ? (
              <>
                <svg className="ic" aria-hidden="true">
                  <use href="#mrg-check" />
                </svg>
                Redirecting to Google…
              </>
            ) : (
              <>
                <svg className="ic ic--brand" aria-hidden="true">
                  <use href="#mrg-google" />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <p className="mr-foot">
            <span>Already have an account?</span>
            {/* the handheld login, not the desktop one — the mobile pair links
                both ways (mobile-auth-login/mobile-login-content.tsx already
                points its "Create account" here). The signIn-FAILURE branch in
                finish() deliberately still routes to /auth/login: that string
                is carried verbatim from the desktop port. */}
            <Link className="mr-link-ink" href={"/mobile-v1/auth/login" as Route}>
              Sign in
            </Link>
          </p>

        </section>

        {/* ═══════════ STEP 2 ═══════════ */}
        <section className={step === 2 ? "mr-step" : "mr-step is-hidden"} aria-hidden={step !== 2}>
          <h1 className="mr-h1">{setupMode ? "Tell us about your company." : "Tell us what you do."}</h1>
          {setupMode ? (
            <label className="mr-fld">
              <span className="mr-lbl">Business name</span>
              <input
                className="mr-in"
                placeholder="Company name"
                autoComplete="organization"
                value={biz}
                onChange={(e) => setBiz(e.target.value)}
              />
            </label>
          ) : null}

          {/* the desktop right panel's perk block, re-cut as an inverse card */}
          <div className="mr-perk">
            <span className="mr-perk-eyebrow">
              <svg className="ic" aria-hidden="true">
                <use href="#mrg-gift" />
              </svg>
              Free with your account
            </span>
            <h2 className="mr-perk-h">
              Homeowner leads,
              <br />
              sent straight to you.
            </h2>
            <p className="mr-perk-p">
              Tell us where you work and what you do — JobFlex matches nearby homeowner requests to
              your trades and drops them in your Leads inbox.
            </p>
            <div className="mr-perk-rule" />
            <div className="mr-perk-facts">
              <span>
                <b>Your trades</b> only
              </span>
              <span>
                <b>Near you</b> · 25 mi
              </span>
              <span>
                <b>$0</b> · no cap
              </span>
            </div>
            <button className="mr-perk-btn" type="button" onClick={onLearnMore}>
              {learnBusy ? "How lead matching works" : "Learn more"}
              <svg className="ic" aria-hidden="true">
                <use href="#mrg-arrow" />
              </svg>
            </button>
          </div>

          <form
            id="mr-step2-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void finish(true);
            }}
          >
            <label className="mr-fld" htmlFor="mr-addr">
              <span className="mr-lbl">Company address</span>
              <input
                className="mr-in"
                id="mr-addr"
                name="companyAddress"
                placeholder="Street, city, state, ZIP"
                autoComplete="street-address"
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
              />
            </label>
            <label className="mr-fld" htmlFor="mr-phone">
              <span className="mr-lbl">Company phone</span>
              <input
                className="mr-in"
                type="tel"
                id="mr-phone"
                name="companyPhone"
                placeholder="Phone number"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            <div className="mr-fld">
              <span className="mr-lbl">Trades you take</span>

              <div className="mr-filter">
                <svg className="ic mr-filter-ic" aria-hidden="true">
                  <use href="#mrg-search" />
                </svg>
                <input
                  className="mr-in mr-filter-in"
                  id="mr-trade-filter"
                  type="text"
                  placeholder={`Filter ${TRADE_TYPES.length} trades`}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={tradeQuery}
                  onChange={(e) => setTradeQuery(e.target.value)}
                  aria-label="Filter trades"
                />
                {tradeQuery.length > 0 && (
                  <button
                    className="mr-filter-x"
                    type="button"
                    aria-label="Clear trade filter"
                    onClick={() => setTradeQuery("")}
                  >
                    <svg className="ic" aria-hidden="true">
                      <use href="#mrg-x" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="mr-trades" role="group" aria-label="Your trades">
                {visibleGroups.map((g) => (
                  <div className="mr-tgrp" key={g.label}>
                    <p className="mr-tgrp-h">
                      <span>{g.label}</span>
                      <i />
                    </p>
                    <div className="mr-chips">
                      {g.trades.map((t) => (
                        <button
                          key={t}
                          className={trades.includes(t) ? "mr-chip is-on" : "mr-chip"}
                          type="button"
                          aria-pressed={trades.includes(t)}
                          onClick={() => toggleTrade(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {visibleGroups.length === 0 && (
                  <p className="mr-empty">No trade matches “{tradeQuery.trim()}”.</p>
                )}
              </div>

              {trades.includes("Other") && (
                <input
                  ref={otherRef}
                  className="mr-in mr-in--other"
                  type="text"
                  maxLength={80}
                  placeholder="Name the trade — e.g. epoxy floors"
                  aria-label="Your other trade"
                  value={otherTrade}
                  onChange={(e) => setOtherTrade(e.target.value)}
                />
              )}

              <span className="mr-note" aria-live="polite">
                {tradeNote(trades.length)}
              </span>
            </div>

            <div className={err2 ? "mr-err" : "mr-err is-hidden"} role="alert">
              {err2}
            </div>
          </form>

          {setupMode ? null : (
            <p className="mr-foot">
              <button
                className="mr-link-quiet"
                type="button"
                disabled={creating}
                onClick={() => void finish(false)}
              >
                Skip — set this up later
              </button>
            </p>
          )}
        </section>

        {/* ═══════════ DONE ═══════════ */}
        <section
          className={step === 3 ? "mr-step mr-step--center" : "mr-step mr-step--center is-hidden"}
          aria-hidden={step !== 3}
        >
          <div className="mr-done">
            <svg className="ic" aria-hidden="true">
              <use href="#mrg-check" />
            </svg>
          </div>
          <p className="mr-kicker">Account created</p>
          <h1 className="mr-h1">You&apos;re all set.</h1>
          <p className="mr-lede">{doneNote}</p>
          <p className="mr-note" role="status">
            {countdown > 0 ? `Taking you there in ${countdown}…` : "Opening your dashboard…"}
          </p>
        </section>
      </main>

      {/* ── sticky action bar: the primary action stays in the thumb zone ── */}
      <div className="mr-bar">
        <div className="mr-bar-in">
          {step === 1 && (
            <button className="mr-btn" type="submit" form="mr-step1-form" disabled={checking}>
              {checking ? (
                "Checking…"
              ) : (
                <>
                  Continue
                  <svg className="ic" aria-hidden="true">
                    <use href="#mrg-arrow-r" />
                  </svg>
                </>
              )}
            </button>
          )}
          {step === 2 && (
            <>
              {setupMode ? null : (
              <button
                className="mr-btn mr-btn--ghost mr-btn--back"
                type="button"
                aria-label="Back to your account details"
                disabled={creating}
                onClick={() => setStep(1)}
              >
                {/* Icon-only by design: at 320px a labelled Back plus
                    "CREATE ACCOUNT" leaves ~12px of slack, which a font
                    fallback eats. 56px fixed keeps the row provably safe and
                    the control is still a 56×52 target with an accessible
                    name. */}
                <svg className="ic" aria-hidden="true">
                  <use href="#mrg-back" />
                </svg>
              </button>
              )}
              <button className="mr-btn" type="submit" form="mr-step2-form" disabled={creating}>
                {creating ? (setupMode ? "Saving…" : "Creating…") : setupMode ? "Continue" : "Create account"}
              </button>
            </>
          )}
          {step === 3 && (
            <Link className="mr-btn" href={"/dashboard" as Route}>
              Open the dashboard
              <svg className="ic" aria-hidden="true">
                <use href="#mrg-arrow-r" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
