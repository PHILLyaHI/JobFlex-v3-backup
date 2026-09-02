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
import { checkEmailAvailable } from "@/actions/auth";
import { TRADE_TYPES, type TradeType } from "@/lib/tradeTypes";
import { RegisterSprite } from "./register-sprite";
import { ReferralBanner, type RegisterAttribution } from "./referral-banner";
import {
  applySignupPromo,
  signupPlans,
  type SignupPlan,
  type SignupPromo,
} from "@/actions/signupPaywall";
import { completePendingSignup, startPendingSignup } from "@/actions/signupCheckout";
import {
  CUSTOM_BASE_CENTS,
  CUSTOM_BASE_FEATURES,
  CUSTOM_PAGES,
  CUSTOM_PAGE_CENTS,
  CUSTOM_PLAN_SLUG,
  CUSTOM_YEAR_MULTIPLIER,
  customPriceCents,
} from "@/lib/customPlan";
import styles from "./auth-register.module.css";

// 1 account · 2 company · 3 THE PLAN (the paywall) · 4 done.
/** The picker's exit, in step with the 0.22s transform in the stylesheet. */
const PICKER_EXIT_MS = 220;

type Step = 1 | 2 | 3 | 4;

/** Fallback trial length, used only until the catalog answers. */
const DEFAULT_TRIAL_DAYS = 14;

// How long the "Your shop is live" panel holds before it hands over to the
// dashboard. Shared by both register surfaces.
export const REDIRECT_SECONDS = 5;

// Donor `setStep`: items[0] is `on` at step 1 and `done` after it; items[1] is
// `on` at step 2, `done` at step 3, and bare at step 1.
function stItem(index: 0 | 1 | 2, step: Step): string {
  if (index === 0) return "st-item" + (step === 1 ? " on" : " done");
  if (index === 1) return "st-item" + (step === 2 ? " on" : step > 2 ? " done" : "");
  return "st-item" + (step === 3 ? " on" : step > 3 ? " done" : "");
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
  const sideCardRef = React.useRef<HTMLImageElement>(null);

  /* THE RETURN FROM STRIPE. `?signup=<token>&session_id=…` is the success URL
     the checkout route set, and it is the only input this needs — so it is read
     ONCE during the first render (lazy state initialiser). Everything it
     implies (which step to open on, which token this page belongs to, whether
     to say the checkout was cancelled) is INITIAL STATE derived from it, not
     state pushed from an effect. The effect below only does the part that talks
     to the server. */
  const [ret] = React.useState<{ token: string; sessionId: string | null; cancelled: boolean } | null>(
    () => {
      if (typeof window === "undefined") return null;
      const url = new URL(window.location.href);
      const t = url.searchParams.get("signup");
      if (!t) return null;
      return {
        token: t,
        sessionId: url.searchParams.get("session_id"),
        cancelled: url.searchParams.get("checkout") === "cancelled",
      };
    },
  );

  const [step, setStep] = React.useState<Step>(ret ? 3 : 1);

  /* THE PLAN STEP. Everything here is read from the live catalog after the
     account exists — the step cannot price itself before there is an org to
     price for, and `signupPlans` is owner-scoped. */
  const [plans, setPlans] = React.useState<SignupPlan[]>([]);
  const [planSlug, setPlanSlug] = React.useState<string | null>(null);
  const [interval, setInterval] = React.useState<"MONTH" | "YEAR">("MONTH");
  const [plansErr, setPlansErr] = React.useState<string | null>(
    ret?.cancelled ? "Checkout was cancelled — your account has not been created yet." : null,
  );
  const [checkoutReady, setCheckoutReady] = React.useState(true);
  const [promo, setPromo] = React.useState<SignupPromo | null>(null);
  const [promoText, setPromoText] = React.useState("");
  const [promoBusy, setPromoBusy] = React.useState(false);
  const [promoErr, setPromoErr] = React.useState<string | null>(null);
  /* True from the first frame when Stripe has just sent them back: the account
     is being created before anything else can be clicked. Initial state rather
     than a setState inside the effect below. */
  const [payBusy, setPayBusy] = React.useState(Boolean(ret?.sessionId && !ret.cancelled));
  /* THE CUSTOM PLAN. Not a catalog row — a base price plus the add-on pages
     the shop picks, so it is held here and priced by lib/customPlan (the same
     module the checkout route re-prices with, because a client number is never
     what gets charged). */
  const [customPages, setCustomPages] = React.useState<string[]>([]);
  /* THE PICKER OPENS AND CLOSES ON A CURVE, which takes two flags because it
     is mounted and unmounted rather than hidden: `pickerOpen` decides whether
     the dialog is in the tree at all, `pickerOn` is added one frame later so
     the enter transition has a start state to leave from, and dropped FIRST on
     the way out so the exit can play before the node goes. Same arrangement as
     the support composer — a dialog that pops in and vanishes reads as a
     glitch, and this one is opened by a card the shop is mid-comparison on. */
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerOn, setPickerOn] = React.useState(false);
  const pickerExit = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPicker = React.useCallback(() => {
    if (pickerExit.current) {
      clearTimeout(pickerExit.current);
      pickerExit.current = null;
    }
    setPickerOpen(true);
  }, []);

  const closePicker = React.useCallback(() => {
    setPickerOn(false);
    pickerExit.current = setTimeout(() => {
      setPickerOpen(false);
      pickerExit.current = null;
    }, PICKER_EXIT_MS);
  }, []);

  // One frame after the node exists, not in the same commit: a class set in the
  // render that mounts it is the element's FIRST style, and there is nothing to
  // transition from.
  React.useEffect(() => {
    if (!pickerOpen) return;
    const id = requestAnimationFrame(() => setPickerOn(true));
    return () => cancelAnimationFrame(id);
  }, [pickerOpen]);

  React.useEffect(
    () => () => {
      if (pickerExit.current) clearTimeout(pickerExit.current);
    },
    [],
  );

  /* THE YEARLY SAVING, read off the catalog rather than written into the
     label. It is taken from the RECOMMENDED plan (the one the switch is most
     likely to be pressed against) and not from the biggest number in the list:
     a seeded $1 tier whose annual price is two dollars discounts by 83%, and
     advertising that against a $79 plan that saves 17% is a promise the
     checkout will not keep. Null when nothing in the catalog prices a year. */
  const yearlySavePct = React.useMemo(() => {
    const ref = plans.find((p) => p.highlight && p.priceCents > 0 && p.yearlyPriceCents)
      ?? plans.find((p) => p.priceCents > 0 && p.yearlyPriceCents);
    if (!ref?.yearlyPriceCents) return null;
    const list = ref.priceCents * 12;
    if (list <= ref.yearlyPriceCents) return null;
    return Math.round((1 - ref.yearlyPriceCents / list) * 100);
  }, [plans]);

  /** The pending signup this plan step belongs to. Parked by step 2, or carried
   *  back from Stripe on the return URL. */
  const [token, setToken] = React.useState<string | null>(ret?.token ?? null);
  const trialDays =
    planSlug === CUSTOM_PLAN_SLUG
      ? DEFAULT_TRIAL_DAYS
      : plans.find((p) => p.slug === planSlug)?.trialDays || DEFAULT_TRIAL_DAYS;
  const customCents = customPriceCents(customPages, interval);
  /* Every feature any plan lists, in the order the catalog gives them, and
     de-duplicated case-insensitively ("Everything in Starter" is a plan's own
     roll-up line and is dropped — it describes the column, not a feature). */
  const featureRows = React.useMemo(() => {
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const p of plans) {
      for (const f of p.features) {
        const key = f.trim().toLowerCase();
        if (!key || key.startsWith("everything in") || seen.has(key)) continue;
        seen.add(key);
        rows.push(f.trim());
      }
    }
    return rows;
  }, [plans]);

  /* WHAT EACH PLAN ACTUALLY INCLUDES. The catalog writes the inheritance as a
     line of prose — "Everything in Starter" — so a naive per-plan lookup marked
     the cheaper plans' features as MISSING from the dearer ones, which read as
     Professional being worse than Starter. A plan carrying that roll-up
     inherits every feature of the plans before it, in catalog order. */
  const includedBySlug = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    let inherited = new Set<string>();
    for (const p of plans) {
      const own = p.features.map((f) => f.trim().toLowerCase());
      const rollsUp = own.some((f) => f.startsWith("everything in"));
      const set = new Set<string>(rollsUp ? inherited : []);
      for (const f of own) {
        if (!f || f.startsWith("everything in")) continue;
        set.add(f);
      }
      map.set(p.slug, set);
      inherited = set;
    }
    return map;
  }, [plans]);

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

  /* Donor `syncNewsHeight`: `.side-perk` is pinned above the art panel (the
     quote card it replaced), so its `bottom` needs that panel's measured
     height. The donor writes `--news-h` on
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

  /* The catalog is read when the plan step opens, not on mount: before the
     account exists there is no owner to read it as. */
  React.useEffect(() => {
    if (step !== 3) return;
    let live = true;
    void signupPlans()
      .then((res) => {
        if (!live) return;
        setPlans(res.plans);
        setCheckoutReady(res.checkoutReady);
        if (res.promo) setPromo(res.promo);
        // Pre-select what the catalog marks as the one to pick, else the first.
        setPlanSlug((cur) => cur ?? (res.plans.find((p) => p.highlight) ?? res.plans[0])?.slug ?? null);
      })
      .catch(() => {
        if (live) setPlansErr("Couldn't load the plans. You can pick one later in Subscription.");
      });
    return () => {
      live = false;
    };
  }, [step]);

  async function onApplyPromo() {
    if (promoBusy) return;
    setPromoBusy(true);
    setPromoErr(null);
    try {
      const res = await applySignupPromo(promoText);
      if (res.ok) {
        setPromo(res.promo);
        // Carried into account creation as the signup's attribution — there is
        // no organization to stamp until checkout returns.
        setAttribution({ kind: res.promo.kind, code: res.promo.code });
      } else setPromoErr(res.error);
    } catch {
      setPromoErr("Couldn't check that code.");
    } finally {
      setPromoBusy(false);
    }
  }

  /* The trial starts at Stripe: the existing subscription checkout route takes
     the plan and interval and auto-applies whatever promo is stamped on the org
     — which is what `applySignupPromo` above writes. Nothing about discounts is
     re-implemented here. */
  async function onStartTrial() {
    if (payBusy || !planSlug) return;
    setPayBusy(true);
    setPlansErr(null);
    try {
      const res = await fetch("/api/checkout/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, planSlug, interval, customPages }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setPlansErr(body.error || "Couldn't open checkout — your account has not been created.");
    } catch {
      setPlansErr("Couldn't reach checkout — your account has not been created.");
    } finally {
      setPayBusy(false);
    }
  }

  /* TESTING EXIT (owner's call, while the product is in testing). It creates
     the workspace WITHOUT a subscription — the only path that does. Everything
     else about it is the same as the paid return: the pending intent is spent,
     the account is created, the session is established here. */
  async function onSkipPlan() {
    if (payBusy || !token) return;
    setPayBusy(true);
    setPlansErr(null);
    try {
      const res = await completePendingSignup(token, null);
      if (!res.ok) {
        setPlansErr(res.error);
        return;
      }
      await signIn("credentials", { email: res.email, password, redirect: false });
      toast.success("Welcome to JobFlex", "Your workspace is ready.");
      setStep(4);
    } catch {
      setPlansErr("Couldn't finish the signup. Try again.");
    } finally {
      setPayBusy(false);
    }
  }

  React.useEffect(() => {
    if (!ret?.sessionId || ret.cancelled) return;
    void completePendingSignup(ret.token, ret.sessionId)
      .then((res) => {
        if (!res.ok) {
          setPlansErr(res.error);
          return;
        }
        // The password is not in scope on a fresh page load, so this hands over
        // to sign-in rather than pretending to know it.
        toast.success("You're in", "Sign in to open your new workspace.");
        router.push("/auth/login" as Route);
      })
      .catch(() => setPlansErr("Couldn't finish the signup. Try again."))
      .finally(() => setPayBusy(false));
  }, [ret, router]);

  // Tick the countdown down on the success step, then leave. Gated on `step` so
  // the clock cannot start before the account exists, and cleared on unmount so
  // a person who clicks the button first is not navigated a second time.
  React.useEffect(() => {
    if (step !== 4) return;
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

  /* Donor `finish(withCompany)` — but NOTHING IS CREATED HERE any more.
     Until 2026-08-28 this wrote the Organization, the owner User and the
     Membership, signed them in, and only then showed the plan: a visitor who
     never subscribed still ended up with a workspace. The details are parked as
     a PENDING INTENT instead (actions/signupCheckout), and the account is
     created when checkout comes back — or when the testing skip is used. */
  async function finish(withCompany: boolean) {
    if (creating) return;
    setCreating(true);
    setErr2(null);
    try {
      const res = await startPendingSignup({
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
      setToken(res.token);
      if (!withCompany) {
        setDoneNote(
          (prev) =>
            prev +
            " Add your address and trades in Company settings when you want matched leads.",
        );
      }
      setStep(3);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't continue.";
      setErr2(msg);
      toast.error("Couldn't continue", msg);
    } finally {
      setCreating(false);
    }
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

      <main className={step === 3 ? "auth auth--wide" : "auth"}>
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
            {/* Shown only once it is reached (owner's call, 2026-08-28): the
                plan is the third step, but announcing it on the first screen
                announces a price before anyone has seen the product. */}
            {step >= 3 ? (
              <>
                <span className="st-line"></span>
                <div className={stItem(2, step)} data-step="3">
                  <span className="st-n">3</span>
                  <span className="st-txt">
                    <span className="st-t">Your plan</span>
                    <span className="st-h">14 days free</span>
                  </span>
                </div>
              </>
            ) : null}
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
          {/* ───── ШАГ 3 · THE PLAN ─────
              INDUSTRIAL DRAFTING BRUTALISM, the page's own language, pushed
              harder because this is the one screen that has to sell:
                · FULL BLEED. The art panel slides out and the comparison takes
                  the screen — three plans read as a table, and half a screen is
                  where that goes wrong.
                · ONE SHARED FEATURE LIST. Every plan prints the SAME rows: the
                  ones it includes in ink with a tick, the ones it does not in
                  grey with a dash. The gap between the columns is the argument
                  for the bigger plan, and it is visible without reading.
                · LESS TEXT, LOUDER TYPE. The per-plan paragraphs are gone; the
                  price is 44px, the plan name is the mono annotation layer, and
                  nothing on the card is a sentence.
                · The promo field carries its own APPLY inside the frame, so the
                  row is one object instead of a field and a stray button. */}
          <div className={step === 3 ? "step" : "step is-hidden"} id="stepPlan">
            {/* Title and the billing switch on ONE line: the switch is the
                control that rewrites every price under it, so it belongs beside
                the question, not stacked under it where it read as a third
                heading. The trial sentence moved to the fine print above the
                CTA, where the rest of the terms are. */}
            <div className="pw-head">
              <h1 className="auth-h1">Pick a plan.</h1>
              <div className="pw-int" role="group" aria-label="Billing period">
                {(["MONTH", "YEAR"] as const).map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={"pw-int-b" + (interval === i ? " on" : "")}
                    aria-pressed={interval === i}
                    onClick={() => setInterval(i)}
                  >
                    {i === "MONTH" ? "Monthly" : "Yearly"}
                    {/* The real number, not a hand-written one: it is read off
                        the catalog the shop is about to be charged from. */}
                    {i === "YEAR" && yearlySavePct ? <i>Save {yearlySavePct}%</i> : null}
                  </button>
                ))}
              </div>
            </div>

            {plansErr ? (
              <div className="err" role="alert">
                {plansErr}
              </div>
            ) : null}

            <div className="pw-plans">
              {plans.map((p) => {
                const yearly = interval === "YEAR" ? p.yearlyPriceCents : null;
                const cents = yearly ?? p.priceCents;
                const per = yearly ? "/yr" : "/mo";
                /* What twelve months at the monthly rate would have cost, and
                   the saving against it. Only drawn when the annual price is
                   genuinely cheaper — a struck price that is not a discount is
                   a lie, not a decoration. */
                const listCents = yearly ? p.priceCents * 12 : 0;
                const savePct =
                  yearly && listCents > yearly
                    ? Math.round((1 - yearly / listCents) * 100)
                    : 0;
                const on = planSlug === p.slug;
                const has = includedBySlug.get(p.slug) ?? new Set<string>();
                return (
                  <button
                    key={p.slug}
                    type="button"
                    className={"pw-plan" + (on ? " on" : "") + (p.highlight ? " pw-plan--hero" : "")}
                    aria-pressed={on}
                    onClick={() => setPlanSlug(p.slug)}
                  >
                    {p.highlight ? <span className="pw-tag">Most picked</span> : null}
                    <span className="pw-plan-n">{p.name}</span>
                    <span className="pw-price">
                      ${(cents / 100).toFixed(0)}
                      <i>{per}</i>
                    </span>
                    {savePct > 0 ? (
                      <span className="pw-save">
                        <s>${(listCents / 100).toFixed(0)}</s> Save {savePct}% · $
                        {((listCents - cents) / 100).toFixed(0)}
                      </span>
                    ) : null}
                    <span className="pw-pick" aria-hidden="true">
                      {on ? "Selected" : "Choose"}
                    </span>
                    <span className="pw-feats">
                      {featureRows.map((f) => {
                        const included = has.has(f.toLowerCase());
                        return (
                          <span key={f} className={included ? "pw-f" : "pw-f pw-f--no"}>
                            <svg className="ic">
                              <use href={included ? "#i-check" : "#i-minus"} />
                            </svg>
                            {f}
                          </span>
                        );
                      })}
                    </span>
                  </button>
                );
              })}
              {/* THE CUSTOM PLAN — the same card shape, priced by what is
                  ticked rather than by a tier somebody else drew. */}
              <button
                type="button"
                className={
                  "pw-plan pw-plan--custom" + (planSlug === CUSTOM_PLAN_SLUG ? " on" : "")
                }
                aria-pressed={planSlug === CUSTOM_PLAN_SLUG}
                onClick={() => {
                  setPlanSlug(CUSTOM_PLAN_SLUG);
                  openPicker();
                }}
              >
                <span className="pw-plan-n">Custom</span>
                <span className="pw-price">
                  ${(customCents / 100).toFixed(0)}
                  <i>{interval === "YEAR" ? "/yr" : "/mo"}</i>
                </span>
                {/* The same saving the catalog plans show, off the same
                    arithmetic: a year here is CUSTOM_YEAR_MULTIPLIER months. */}
                {interval === "YEAR" ? (
                  <span className="pw-save">
                    <s>${((customPriceCents(customPages) * 12) / 100).toFixed(0)}</s> Save{" "}
                    {Math.round((1 - CUSTOM_YEAR_MULTIPLIER / 12) * 100)}% · $
                    {((customPriceCents(customPages) * 12 - customCents) / 100).toFixed(0)}
                  </span>
                ) : null}
                <span className="pw-pick" aria-hidden="true">
                  {planSlug === CUSTOM_PLAN_SLUG ? "Selected" : "Build it"}
                </span>
                <span className="pw-feats">
                  {CUSTOM_BASE_FEATURES.map((f) => (
                    <span key={f} className="pw-f">
                      <svg className="ic">
                        <use href="#i-check" />
                      </svg>
                      {f}
                    </span>
                  ))}
                  <span className="pw-f pw-f--add">
                    <svg className="ic">
                      <use href="#i-plus" />
                    </svg>
                    {customPages.length === 0
                      ? `Add pages · $${(CUSTOM_PAGE_CENTS / 100).toFixed(0)} each`
                      : `${customPages.length} page${customPages.length === 1 ? "" : "s"} added`}
                  </span>
                  {customPages.map((id) => {
                    const page = CUSTOM_PAGES.find((x) => x.id === id);
                    return page ? (
                      <span key={id} className="pw-f">
                        <svg className="ic">
                          <use href="#i-check" />
                        </svg>
                        {page.label}
                      </span>
                    ) : null;
                  })}
                </span>
                <span
                  className="pw-edit"
                  role="presentation"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlanSlug(CUSTOM_PLAN_SLUG);
                    openPicker();
                  }}
                >
                  Choose pages
                </span>
              </button>

              {plans.length === 0 && !plansErr ? (
                <div className="fld-note">Loading plans…</div>
              ) : null}
            </div>

            <div className="pw-foot">
              {/* PROMO — the same codes the ?promo / ?ref links carry. Applying
                  one stamps it on the shop and checkout picks it up there. */}
              <div className={"pw-promo" + (promo ? " is-on" : "")}>
                <input
                  className="pw-promo-in"
                  value={promo ? promo.code : promoText}
                  onChange={(e) => setPromoText(e.target.value.toUpperCase())}
                  placeholder="Promo or referral code"
                  aria-label="Promo or referral code"
                  disabled={promoBusy || Boolean(promo)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onApplyPromo();
                    }
                  }}
                />
                <button
                  className="pw-promo-b"
                  type="button"
                  onClick={() => void onApplyPromo()}
                  disabled={promoBusy || Boolean(promo) || promoText.trim().length === 0}
                >
                  {promoBusy ? "…" : promo ? "✓" : "Apply"}
                </button>
              </div>

              <button
                className="btn pw-go"
                type="button"
                onClick={() => void onStartTrial()}
                disabled={payBusy || !planSlug || !checkoutReady}
              >
                {payBusy
                  ? "Opening checkout…"
                  : checkoutReady
                    ? `Start ${trialDays} days free`
                    : "Checkout is not configured"}
              </button>
            </div>

            {promo ? (
              <p className="pw-promo-ok" role="status">
                <b>{promo.code}</b>
                {promo.percentOff ? ` · ${promo.percentOff}% off` : ""} · {promo.displayName}
              </p>
            ) : promoErr ? (
              <p className="err" role="alert">
                {promoErr}
              </p>
            ) : null}

            <p className="pw-note">
              No charge today. <b>{trialDays} days free.</b> Cancel before it ends and you pay
              nothing.
            </p>

            {/* The testing exit. Small, quiet, cornered — an escape, not an
                offer. */}
            <button className="pw-skip" type="button" onClick={() => void onSkipPlan()} disabled={payBusy}>
              Skip for now
            </button>

            {/* THE PAGE PICKER. Hand-rolled (no Radix here, same as every other
                dialog in this fleet): a scrim, one panel, Escape closes it. The
                price in its foot is the same function the server charges by. */}
            {pickerOpen ? (
              <div
                className={"pwp" + (pickerOn ? " is-on" : "")}
                role="dialog"
                aria-modal="true"
                aria-label="Choose the pages in your plan"
                onKeyDown={(e) => {
                  if (e.key === "Escape") closePicker();
                }}
              >
                <div className="pwp-scrim" onClick={() => closePicker()} />
                <div className="pwp-box">
                  <div className="pwp-head">
                    <div>
                      <div className="pwp-kick">Custom plan</div>
                      <h2 className="pwp-h">Pick the pages you want.</h2>
                    </div>
                    <button
                      className="pwp-x"
                      type="button"
                      aria-label="Close"
                      onClick={() => closePicker()}
                    >
                      ×
                    </button>
                  </div>

                  <p className="pwp-lede">
                    ${(CUSTOM_BASE_CENTS / 100).toFixed(0)}/mo covers the everyday workspace —
                    proposals, clients, projects, jobs, invoices. Everything below is $
                    {(CUSTOM_PAGE_CENTS / 100).toFixed(0)}/mo each.
                  </p>

                  <div className="pwp-list">
                    {CUSTOM_PAGES.map((page) => {
                      const on = customPages.includes(page.id);
                      return (
                        <button
                          key={page.id}
                          type="button"
                          className={"pwp-row" + (on ? " on" : "")}
                          aria-pressed={on}
                          onClick={() =>
                            setCustomPages((cur) =>
                              cur.includes(page.id)
                                ? cur.filter((x) => x !== page.id)
                                : [...cur, page.id],
                            )
                          }
                        >
                          <span className="pwp-box-t" aria-hidden="true">
                            {on ? (
                              <svg className="ic">
                                <use href="#i-check" />
                              </svg>
                            ) : null}
                          </span>
                          <span className="pwp-txt">
                            <span className="pwp-n">{page.label}</span>
                            <span className="pwp-note">{page.note}</span>
                          </span>
                          <span className="pwp-p">
                            +${(CUSTOM_PAGE_CENTS / 100).toFixed(0)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pwp-foot">
                    <span className="pwp-total">
                      ${(customCents / 100).toFixed(0)}
                      <i>{interval === "YEAR" ? "/yr" : "/mo"}</i>
                    </span>
                    <button
                      className="btn pwp-done"
                      type="button"
                      onClick={() => closePicker()}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>


          <div className={step === 4 ? "step" : "step is-hidden"} id="stepDone">
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

        <aside className={step === 3 ? "auth-side is-out" : "auth-side"} aria-hidden={step === 3}>
          <div className="side-wash"></div>
          {/* WHY FILL THIS IN. One white card against the ink field, three
              lines long: what you get, what it costs, what it takes. The block
              it replaces ran a paragraph, a rule, three stat chips and a
              button to explain the same thing. */}
          <div className={step === 2 ? "side-perk" : "side-perk is-hidden"} id="sidePerk">
            <div className="pk">
              <span className="pk-eyebrow">
                <svg className="ic">
                  <use href="#i-gift" />
                </svg>
                Free
              </span>
              <h2 className="pk-h">
                Fill this in and
                <br />
                homeowner leads
                <br />
                come to you.
              </h2>
              <p className="pk-p">Your trades, near you. No cost, no cap.</p>
            </div>
          </div>

          {/* THE ART PANEL — see the note in the login page: a picture in the
              product's own drawing language instead of an invented quote. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="side-art"
            id="sideCard"
            ref={sideCardRef}
            src="/auth/side-site-2.png"
            alt=""
            aria-hidden="true"
          />
        </aside>
      </main>
    </div>
  );
}
