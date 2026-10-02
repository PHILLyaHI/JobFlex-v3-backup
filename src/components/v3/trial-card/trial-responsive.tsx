"use client";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
const MobileTrial = dynamic(() => import("./trial-mobile").then(m=>m.MobileTrial), { ssr:false });
const query = "(max-width: 768px)";
const subscribe = (notify:()=>void) => { const media=window.matchMedia(query);media.addEventListener("change",notify);return ()=>media.removeEventListener("change",notify); };
export function TrialResponsive({children}:{children:React.ReactNode}) {
  const mobile = useSyncExternalStore(subscribe,()=>window.matchMedia(query).matches,()=>false);
  return mobile ? <MobileTrial>{children}</MobileTrial> : children;
}
