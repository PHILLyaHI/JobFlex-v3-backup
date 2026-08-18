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
// next-auth's client `signOut` works without a SessionProvider — it reads the
// CSRF token from /api/auth/csrf and posts, it does not read session context.
// That matters here: the blueprint tree deliberately has no provider (see
// src/app/dashboard/layout.tsx), so a `useSession()`-based control would break.

import { signOut } from "next-auth/react";

export function SignOutButton({
  className,
  iconClassName,
  onDone,
}: {
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
      title="Sign out"
      aria-label="Sign out"
      onClick={() => {
        onDone?.();
        signOut({ callbackUrl: "/" });
      }}
    >
      <svg className={iconClassName} aria-hidden="true">
        <use href="#i-out" />
      </svg>
    </button>
  );
}
