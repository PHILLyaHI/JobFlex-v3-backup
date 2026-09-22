"use client";

// Partner portal — topbar. Donor `.topbar` frame, kept plain: the burger (the
// only way to the nav under 860px), the partner's name, one Sign out. No search,
// no bell, no New Estimate — none of those surfaces exist for a partner.
//
// Sign out goes through NextAuth: the partner signed in via the dedicated
// "influencer" credentials provider, so the session is a NextAuth one and
// signOut() clears it (it posts to /api/auth/signout and needs no
// SessionProvider). Back to the partner door, not the app's.

import { signOut } from "next-auth/react";
import styles from "./influencer-shell.module.css";

export function InfluencerTopbar({ partnerName }: { partnerName: string }) {
  return (
    <header className="topbar">
      <button className="icon-btn nav-burger" id="navBurger" type="button" aria-label="Open navigation">
        <svg className="ic">
          <use href="#i-menu" />
        </svg>
      </button>

      <div className={styles.ident}>
        <span className={styles.who}>{partnerName}</span>
      </div>

      <div className="topbar-right">
        <button
          className={`btn btn-ghost ${styles.out}`}
          type="button"
          onClick={() => signOut({ callbackUrl: "/influencer/login" })}
        >
          <svg className="ic" aria-hidden="true">
            <use href="#i-out" />
          </svg>
          Sign out
        </button>
      </div>
    </header>
  );
}
