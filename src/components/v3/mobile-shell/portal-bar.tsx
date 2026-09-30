"use client";

// PORTAL BAR — the worker portal's handheld topbar (stage C, 2026-09-30).
//
// The portal (/w/<token>/…) renders the same job editions as the dashboard,
// but it has no dashboard behind it: no drawer, no estimator, no support
// composer, no session. So it does not mount MobileNav — it wears the same
// dark plate (MobileNav's own classes, so the two bars can never drift) with
// "All jobs" where the burger is, and the reader's name and company where
// "Contractor OS" is. The icon sprite comes along, because MobileNav was the
// one that rendered it.

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import styles from "./mobile-nav.module.css";
import { MobileSprite } from "./sprite";

export function PortalBar({
  workerName,
  orgName,
  backHref,
}: {
  workerName: string;
  orgName: string | null;
  backHref: string;
}) {
  return (
    <>
      <MobileSprite />
      <header className={styles.tbar} data-portal-bar>
        <Link className={styles.tbarBtn} href={backHref as Route} aria-label="All jobs">
          <svg className={styles.ic} aria-hidden="true">
            <use href="#i-chevl" />
          </svg>
        </Link>
        <span className={styles.tbarMarkBox}>
          <Image className={styles.tbarMarkImg} src="/jobflex-mark.png" alt="" width={108} height={108} priority />
        </span>
        <span className={styles.tbarTxt}>
          <span className={styles.tbarName}>{workerName}</span>
          <span className={styles.tbarSub}>{orgName ? `${orgName} · crew` : "Crew portal"}</span>
        </span>
      </header>
    </>
  );
}
