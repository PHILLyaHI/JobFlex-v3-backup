"use client";

// Auth · Create account — Blueprint edition. Pixel-identical port of
// `jobflex-auth-register-blueprint.html`.
//
// This page is STANDALONE: an auth surface ships its own chrome (brand lockup,
// split layout, dark drafting-sheet right panel) and does NOT mount inside
// components/v3/blueprint-shell — that shell's sidebar + topbar belong to the
// signed-in contractor dashboard. `.bp` is the wrapper that carries the donor's
// `:root` tokens and `body` rules — see the header of auth-register.module.css.
//
// The markup below is the donor's <body> verbatim, in source order:
//   sprite · main.auth ( section.auth-form [ brand · ref-banner · stepper ·
//   step1 · step2 · stepDone ] · aside.auth-side [ side-wash · side-perk ·
//   side-card ] )
//
// Adaptations (format only): HTML attributes become their JSX spellings
// (class → className, …), the donor's HTML entities (&amp; …) become the
// characters they encode, and the donor's three inert `href="…html"` links
// become the app routes they name.
//
// BEHAVIOUR. The donor's own script is ported in full — show/hide password,
// chip toggling with its live counter, the two-step progression with its
// literal validation strings, the perk/Google button label swaps, and the
// `--news-h` measurement that positions the perk block above the quote card.
// Grafted onto it, unchanged, is the live registration wiring the classic
// /auth/register page carried: registerAccount (server action) → next-auth
// signIn, the promo/referral attribution capture, and the Google OAuth entry.
// No server action, API route or Prisma call was added or altered.

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "@/components/ui/Toast";
import { checkEmailAvailable, registerAccount } from "@/actions/auth";
import { TRADE_TYPES, type TradeType } from "@/lib/tradeTypes";
import { RegisterSprite } from "./register-sprite";
import { ReferralBanner, type RegisterAttribution } from "./referral-banner";
import styles from "./auth-register.module.css";

type Step = 1 | 2 | 3;

// How long the "Your shop is live" panel holds before it hands over to the
// dashboard. Shared by both register surfaces.
export const REDIRECT_SECONDS = 5;

// Donor `setStep`: items[0] is `on` at step 1 and `done` after it; items[1] is
// `on` at step 2, `done` at step 3, and bare at step 1.
function stItem(index: 0 | 1, step: Step): string {
  if (index === 0) return "st-item" + (step === 1 ? " on" : " done");
  return "st-item" + (step === 2 ? " on" : step === 3 ? " done" : "");
}

// Donor `#tradeNote`, verbatim.
function tradeNote(n: number): string {
  return n === 0
    ? "No trades picked — you can add them later, but no leads will be matched."
    : n + (n === 1 ? " trade" : " trades") + " selected — leads will be matched to these.";
}

export function RegisterContent() {
  const router = useRouter();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sideCardRef = React.useRef<HTMLElement>(null);

  const [step, setStep] = React.useState<Step>(1);

  const [name, setName] = React.useState("");
  const [biz, setBiz] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [showPw2, setShowPw2] = React.useState(false);
  // Step 1 is now gated on a server answer (is this email free?), so it has a
  // pending state the Continue button reads.
  const [checking, setChecking] = React.useState(false);

  const [addr, setAddr] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [trades, setTrades] = React.useState<TradeType[]>([]);
  // "Other" is the one chip that cannot say what it means on its own. Picking it
  // opens a free-text line so the trade the taxonomy has no word for still
  // reaches the company record instead of being flattened into a shrug.
  const [otherTrade, setOtherTrade] = React.useState("");
  const otherRef = React.useRef<HTMLInputElement>(null);

  // The success panel holds for five seconds before it hands over to the
  // dashboard — long enough to read that the shop is live, short enough that
  // nobody has to hunt for the button. The button is still there for anyone who
  // does not want to wait.
  const [countdown, setCountdown] = React.useState(REDIRECT_SECONDS);

  const [attribution, setAttribution] = React.useState<RegisterAttribution | null>(null);
  const [err1, setErr1] = React.useState<string | null>(null);
  const [err2, setErr2] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [doneNote, setDoneNote] = React.useState("");
  const [googleBusy, setGoogleBusy] = React.useState(false);
  const [learnBusy, setLearnBusy] = React.useState(false);

  /* Donor `syncNewsHeight`: `.side-perk` is pinned above the quote card, so its
     `bottom` needs the card's measured height. The donor writes `--news-h` on
     document.documentElement; it is written on the page wrapper here instead so
     a client-side navigation away cannot leave the variable behind — the perk
     block inherits it either way, so the computed value is identical. */
  React.useEffect(() => {
    function syncNewsHeight() {
      const card = sideCardRef.current;
      if (!card) return;
      const h = card.getBoundingClientRect().height;
      if (h) rootRef.current?.style.setProperty("--news-h", h + "px");
    }
    window.addEventListener("resize", syncNewsHeight);
    syncNewsHeight();
    return () => window.removeEventListener("resize", syncNewsHeight);
  }, [step]);

  // Tick the countdown down on the success step, then leave. Gated on `step` so
  // the clock cannot start before the account exists, and cleared on unmount so
  // a person who clicks the button first is not navigated a second time.
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
      // Turning "Other" back off throws away whatever was typed under it, so a
      // stale label cannot be submitted for a chip that is no longer selected.
      if (t === "Other" && on) setOtherTrade("");
      // Focus the revealed input on the way in — the whole point of the chip is
      // that there is something else to say.
      if (t === "Other" && !on) window.setTimeout(() => otherRef.current?.focus(), 0);
      return on ? prev.filter((x) => x !== t) : [...prev, t];
    });
  }

  // Donor `#step1Form` submit. The donor's checks were client-side only, which
  // meant the one failure a person cannot fix by looking at the form — an email
  // that is already registered — was not reported until AFTER they had filled in
  // step 2 and pressed Create account, by which point the message pointed at a
  // field two screens back. Step 1 now also asks the server whether the address
  // is free, and only advances on a clean answer.
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
    if (password !== password2) {
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
    } catch (err: unknown) {
      setErr1(err instanceof Error ? err.message : "Couldn't check that email. Try again.");
      return;
    } finally {
      setChecking(false);
    }
    setDoneNote(b + " is ready.");
    setStep(2);
  }

  // Donor `finish(withCompany)` — the 800ms fake is replaced by the real
  // registerAccount + signIn round trip; every string and state change around
  // it is the donor's.
  async function finish(withCompany: boolean) {
    if (creating) return;
    setCreating(true);
    setErr2(null);
    try {
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

  // Donor `#googleBtn`: swaps its label for 1600ms. Here the swap accompanies
  // the real next-auth redirect instead of standing in for it.
  function onGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    window.setTimeout(() => setGoogleBusy(false), 1600);
    void signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <div className={styles.bp} ref={rootRef}>
      <RegisterSprite />

      <main className="auth">
        <section className="auth-form">
          <Link className="brand" href={"/" as Route}>
            <span className="brand-mark">J</span>
            <span className="brand-name">JobFlex</span>
          </Link>

          <ReferralBanner onChange={setAttribution} />

          {/* индикатор шагов */}
          <div className="stepper" id="stepper">
            <div className={stItem(0, step)} data-step="1">
              <span className="st-n">1</span>
              <span className="st-txt">
                <span className="st-t">Your account</span>
                <span className="st-h">Required</span>
              </span>
            </div>
            <span className="st-line"></span>
            <div className={stItem(1, step)} data-step="2">
              <span className="st-n">2</span>
              <span className="st-txt">
                <span className="st-t">Your company</span>
                <span className="st-h">Optional</span>
              </span>
            </div>
          </div>

          {/* ───── ШАГ 1 ───── */}
          {/* The donor's "Get started" kicker is gone (owner's call) — the
              stepper above already says which step this is, so the badge only
              repeated it. Same for step 2's "Almost there". */}
          <div className={step === 1 ? "step" : "step is-hidden"} id="step1">
            <h1 className="auth-h1">Register.</h1>

            <form id="step1Form" noValidate onSubmit={(e) => void onStep1(e)}>
              <div className="grid2">
                <label className="fld">
                  <span className="fld-lbl">Your name</span>
                  <input
                    className="fld-in"
                    id="name"
                    placeholder="First and last"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="fld">
                  <span className="fld-lbl">Business name</span>
                  <input
                    className="fld-in"
                    id="biz"
                    placeholder="Company name"
                    autoComplete="organization"
                    value={biz}
                    onChange={(e) => setBiz(e.target.value)}
                  />
                </label>
              </div>
              <label className="fld">
                <span className="fld-lbl">Email</span>
                <input
                  className="fld-in"
                  type="email"
                  id="email"
                  placeholder="you@yourshop.com"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="fld">
                <span className="fld-lbl">Password</span>
                <span className="pw-wrap">
                  <input
                    className="fld-in"
                    type={showPw ? "text" : "password"}
                    id="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="pw-toggle"
                    type="button"
                    aria-label="Show password"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    <svg className="ic">
                      <use href={showPw ? "#i-eye-off" : "#i-eye"} />
                    </svg>
                  </button>
                </span>
                <span className="fld-note">At least 8 characters.</span>
              </label>
              {/* Confirm password (owner's call, 2026-08-18). Its own toggle
                  state, so revealing one field does not reveal the other. */}
              <label className="fld">
                <span className="fld-lbl">Confirm password</span>
                <span className="pw-wrap">
                  <input
                    className="fld-in"
                    type={showPw2 ? "text" : "password"}
                    id="password2"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                  />
                  <button
                    className="pw-toggle"
                    type="button"
                    aria-label="Show confirmation password"
                    onClick={() => setShowPw2((v) => !v)}
                  >
                    <svg className="ic">
                      <use href={showPw2 ? "#i-eye-off" : "#i-eye"} />
                    </svg>
                  </button>
                </span>
                <span className="fld-note">Type it once more.</span>
              </label>

              <button className="btn" type="submit" id="nextBtn" disabled={checking}>
                {checking ? "Checking…" : "Continue"}
                <svg className="ic">
                  <use href="#i-arrow-r" />
                </svg>
              </button>
              <div className={err1 ? "err" : "err is-hidden"} id="err1">
                {err1}
              </div>
            </form>

            <div className="divider">
              <span className="kpi-lbl">or</span>
            </div>
            <button className="btn btn--ghost" type="button" id="googleBtn" onClick={onGoogle}>
              {googleBusy ? (
                <>
                  <svg className="ic">
                    <use href="#i-check" />
                  </svg>
                  Redirecting to Google…
                </>
              ) : (
                <>
                  <svg className="ic ic--brand">
                    <use href="#i-google" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <div className="foot">
              Already have an account?{" "}
              <Link className="link-ink" href={"/auth/login" as Route}>
                Sign in
              </Link>
            </div>
          </div>

          {/* ───── ШАГ 2 ───── */}
          <div className={step === 2 ? "step" : "step is-hidden"} id="step2">
            <h1 className="auth-h1">Tell us what you do.</h1>

            <form
              id="step2Form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void finish(true);
              }}
            >
              <div className="grid2">
                <label className="fld">
                  <span className="fld-lbl">Company address</span>
                  <input
                    className="fld-in"
                    id="addr"
                    placeholder="Street, city, state, ZIP"
                    autoComplete="street-address"
                    value={addr}
                    onChange={(e) => setAddr(e.target.value)}
                  />
                </label>
                <label className="fld">
                  <span className="fld-lbl">Company phone</span>
                  <input
                    className="fld-in"
                    type="tel"
                    id="phone"
                    placeholder="Phone number"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>

              <div className="fld">
                <span className="fld-lbl">Trades you take</span>
                <div className="chips" role="group" aria-label="Your trades">
                  {TRADE_TYPES.map((t) => (
                    <button
                      key={t}
                      className={trades.includes(t) ? "chip on" : "chip"}
                      type="button"
                      aria-pressed={trades.includes(t)}
                      onClick={() => toggleTrade(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {trades.includes("Other") && (
                  <input
                    ref={otherRef}
                    className="fld-in fld-in--other"
                    type="text"
                    maxLength={80}
                    placeholder="Name the trade — e.g. epoxy & garage floor coatings"
                    aria-label="Your other trade"
                    value={otherTrade}
                    onChange={(e) => setOtherTrade(e.target.value)}
                  />
                )}
                <span className="fld-note" id="tradeNote">
                  {tradeNote(trades.length)}
                </span>
              </div>

              <div className="btn-pair">
                <button
                  className="btn btn--ghost"
                  type="button"
                  id="backBtn"
                  onClick={() => setStep(1)}
                >
                  <svg className="ic">
                    <use href="#i-back" />
                  </svg>
                  Back
                </button>
                <button className="btn" type="submit" id="createBtn" disabled={creating}>
                  {creating ? "Creating…" : "Create account"}
                </button>
              </div>
              <div className={err2 ? "err" : "err is-hidden"} id="err2">
                {err2}
              </div>
            </form>

            <div className="foot">
              <button
                className="link-quiet"
                type="button"
                id="skipBtn"
                onClick={() => void finish(false)}
              >
                Skip — set this up later
              </button>
            </div>
          </div>

          {/* ───── ГОТОВО ───── */}
          <div className={step === 3 ? "step" : "step is-hidden"} id="stepDone">
            <div className="done-mark">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
            </div>
            <div className="auth-kicker kpi-lbl">Account created</div>
            <h1 className="auth-h1">Your shop is live.</h1>
            <p className="auth-lede" id="doneNote">
              {doneNote}
            </p>
            <div className="btn-pair">
              <Link className="btn" href={"/dashboard" as Route}>
                Open the dashboard
              </Link>
            </div>
            <p className="fld-note" role="status" id="doneCountdown">
              {countdown > 0
                ? `Taking you there in ${countdown}…`
                : "Opening your dashboard…"}
            </p>
          </div>
        </section>

        <aside className="auth-side">
          <div className="side-wash"></div>
          <div className={step === 2 ? "side-perk" : "side-perk is-hidden"} id="sidePerk">
            <div className="pk">
              <span className="pk-eyebrow">
                <svg className="ic">
                  <use href="#i-gift" />
                </svg>
                Free with your account
              </span>
              <h2 className="pk-h">
                Homeowner leads,
                <br />
                sent straight to you.
              </h2>
              <p className="pk-p">
                Tell us where you work and what you do — JobFlex matches nearby homeowner requests
                to your trades and drops them in your Leads inbox.
              </p>
              <div className="pk-rule"></div>
              <div className="pk-facts">
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
              <button className="perk-btn" type="button" id="learnMore" onClick={onLearnMore}>
                {learnBusy ? "How lead matching works" : "Learn more"}
                <svg className="ic">
                  <use href="#i-arrow" />
                </svg>
              </button>
            </div>
          </div>

          <figure className="side-card" id="sideCard" ref={sideCardRef}>
            <div className="kpi-lbl">Day one</div>
            <blockquote className="side-q">
              “Set up the shop, sent my first proposal before lunch.”
            </blockquote>
            <figcaption className="side-n">
              A clean slate — your organization, your login, your first quote.
            </figcaption>
          </figure>
        </aside>
      </main>
    </div>
  );
}
