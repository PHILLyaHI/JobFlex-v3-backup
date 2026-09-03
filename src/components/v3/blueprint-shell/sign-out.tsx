"use client";

// Sign out — the one control every signed-in role needs and, until now, only
// office roles had.
//
// The blueprint shell never carried a sign-out: the classic chrome hides it in
// the Topbar account menu (src/components/layout/Topbar.tsx), and the blueprint
// footer offers the account page instead. That page is behind the limited-role
// route gates, so a field worker (INSTALLER) had no way out of the app at all —
// they could not even check which login they were on and switch. The control
// therefore lives in the shell footer, next to the identity plate, for every
// role rather than only the gated ones.
//
// EVERY log out is "log out everywhere" (owner's call, 2026-09-03): the
// credential epoch is bumped first, so every other device's JWT dies on its
// next request, then THIS browser is signed out through next-auth. The bump
// is best-effort — if the session is already dead the action throws and the
// local sign-out still runs.
//
// next-auth's client `signOut` works without a SessionProvider — it reads the
// CSRF token from /api/auth/csrf and posts, it does not read session context.
// That matters here: the blueprint tree deliberately has no provider (see
// src/app/dashboard/layout.tsx), so a `useSession()`-based control would break.

import { signOut } from "next-auth/react";

import { signOutEverywhere } from "@/actions/accountSettings";

/** Revoke every device's session, then sign this browser out. */
export async function logOutEverywhere(callbackUrl = "/"): Promise<void> {
  try {
    await signOutEverywhere();
  } catch {
    /* already signed out elsewhere, or offline — the local sign-out still runs */
  }
  await signOut({ callbackUrl });
}

export function SignOutButton({
  className,
  iconClassName,
  onDone,
  label,
  callbackUrl = "/",
}: {
  /** Visible text after the icon — the settings page renders it as a labelled button. */
  label?: string;
  callbackUrl?: string;
  /** The footer icon-button class of whichever shell is rendering — the
   *  desktop's global `sb-foot-ic` or the handheld module's `sbFootIc`. */
  className?: string;
  /** Same story for the icon: `ic` on desktop, the module's own on handheld. */
  iconClassName?: string;
  /** Handheld passes its drawer-close here so the drawer isn't left open
   *  behind the redirect. */
  onDone?: () => void;
}) {
  return (
    <button
      className={className}
      type="button"
      title="Log out"
      aria-label="Log out"
      onClick={() => {
        onDone?.();
        void logOutEverywhere(callbackUrl);
      }}
    >
      <svg className={iconClassName} aria-hidden="true">
        <use href="#i-out" />
      </svg>
      {label ? label : null}
    </button>
  );
}
