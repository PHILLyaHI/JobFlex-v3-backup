"use client";

// Who is looking at the blueprint chrome — read once, on the server, and handed
// down to every client piece that has to reason about it.
//
// WHY A CONTEXT AND NOT A PROP. The three consumers sit at very different
// depths. The desktop sidebar is a direct child of BlueprintShell, but the
// handheld drawer (components/v3/mobile-shell/mobile-nav) is mounted by each
// mobile page component from inside its own tree, and the command palette is a
// sibling of both. Threading a `role` prop to the drawer would mean touching
// every handheld surface that renders <MobileNav />. The blueprint tree has no
// SessionProvider — that is deliberate, see the layout's header — so `useSession`
// is not an option either. One provider at the layout is.
//
// SCOPE. Mounted by src/app/dashboard/layout.tsx, so it covers every blueprint
// route and both viewports of them. The standalone /mobile-*-v2 review URLs are
// NOT under that layout and therefore have no provider; they fall back to the
// unfiltered nav, which is what they showed before. Those routes are outside
// the middleware's matcher too, so they have no role route-gate of their own —
// one gap, in one place, rather than two half-answers.
//
// NOT A SECURITY BOUNDARY. This decides what the chrome DRAWS. What a role may
// open is decided server-side by the route gate in the layout and by the guards
// in @/lib/orgContext.

import { createContext, useContext } from "react";

export type NavIdentity = {
  /** Raw Membership.role — "OWNER", "INSTALLER", … Never humanised: the nav
   *  rules match on the enum value, and display formatting is the caller's. */
  role: string | null;
  /** Display name for the account block. */
  name: string | null;
};

const EMPTY: NavIdentity = { role: null, name: null };

const NavRoleContext = createContext<NavIdentity>(EMPTY);

// Nav badge counts, keyed by nav href ("/dashboard/leads" → 3). Computed once,
// server-side, by the layout (getBadgeCounts in @/lib/badgeCounts) and handed
// down here for the same reason the identity is: the desktop sidebar, the
// handheld drawer and any future tab bar sit at very different depths, and the
// drawer is mounted by every mobile page from inside its own tree. Same
// provider, second channel — NOT folded into NavIdentity, because "who is
// looking" and "what is unread" change for different reasons.
const EMPTY_BADGES: Record<string, number> = {};

const NavBadgesContext = createContext<Record<string, number>>(EMPTY_BADGES);

export function NavRoleProvider({
  identity,
  badges,
  children,
}: {
  identity?: NavIdentity;
  /** Unread/pending counts by nav href, from the layout's getBadgeCounts. */
  badges?: Record<string, number>;
  children: React.ReactNode;
}) {
  return (
    <NavRoleContext.Provider value={identity ?? EMPTY}>
      <NavBadgesContext.Provider value={badges ?? EMPTY_BADGES}>
        {children}
      </NavBadgesContext.Provider>
    </NavRoleContext.Provider>
  );
}

/** Badge counts by nav href, or an empty map outside the provider (the
 *  standalone /mobile-*-v2 review URLs), which renders no badges — exactly
 *  what those fixture routes showed before. */
export function useNavBadges(): Record<string, number> {
  return useContext(NavBadgesContext);
}

/** The signed-in identity, or a null identity outside the provider. A null role
 *  means "do not filter" — the pre-existing behaviour for surfaces that have no
 *  provider, and the safe answer for a shell rendered before the session
 *  resolves, since the server gate is the real boundary either way. */
export function useNavIdentity(): NavIdentity {
  return useContext(NavRoleContext);
}

/** Shorthand for the common case. */
export function useNavRole(): string | null {
  return useContext(NavRoleContext).role;
}
