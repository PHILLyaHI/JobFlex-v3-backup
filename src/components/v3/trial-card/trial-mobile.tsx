"use client";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import s from "./trial-card.module.css";
export function MobileTrial({children}:{children:React.ReactNode}) {
  return <div className={s.mobilePage}><MobileNav/><main className={s.mobileBody}>{children}</main></div>;
}
