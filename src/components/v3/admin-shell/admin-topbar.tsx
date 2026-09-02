"use client";

// Admin shell — topbar. Donor `.topbar` frame, kept plain: the burger (the only
// way to the nav under 860px), the admin's name, and one Sign out button. No
// search, no New Estimate, no bell — none of those surfaces exist for the
// platform operator.
//
// Sign out clears whichever door the admin came through: the `jf_admin` cookie
// via the adminLogout server action, or the NextAuth session via the client
// signOut (which needs no SessionProvider — it posts to /api/auth/signout).

import { useTransition } from "react";
import { signOut } from "next-auth/react";
import { adminLogout } from "@/actions/adminAuth";
import styles from "./admin-shell.module.css";

export type SignOutMode = "cookie" | "nextauth";

export function AdminTopbar({
  adminName,
  signOutMode,
}: {
  adminName: string;
  signOutMode: SignOutMode;
}) {
  const [pending, startTransition] = useTransition();

  const onSignOut = () => {
    if (signOutMode === "cookie") {
      startTransition(async () => {
        await adminLogout();
      });
    } else {
      signOut({ callbackUrl: "/admin/login" });
    }
  };

  return (
    <header className="topbar">
      <button className="icon-btn nav-burger" id="navBurger" type="button" aria-label="Open navigation">
        <svg className="ic">
          <use href="#i-menu" />
        </svg>
      </button>

      {/* One line. The cookie-door principal is literally named "Platform
          admin", so a "Platform admin" kicker above it printed the same string
          twice — once shouted. */}
      <div className={styles.ident}>
        <span className={styles.who}>{adminName}</span>
      </div>

      <div className="topbar-right">
        <button
          className={`btn btn-ghost ${styles.out}`}
          type="button"
          onClick={onSignOut}
          disabled={pending}
        >
          <svg className="ic" aria-hidden="true">
            <use href="#i-out" />
          </svg>
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
