"use client";
import { beginTrialSimulation } from "@/actions/trialSimulation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { TrialView } from "@/lib/cardlessTrial";
import s from "./trial-card.module.css";
type TrialContext = { view: TrialView | null; isOwner: boolean; startSimulation: () => Promise<void> };
const Context = createContext<TrialContext>({ view: null, isOwner: false, startSimulation: async () => {} });

export function TrialAccessProvider({view,isOwner,children}:{view:TrialView|null;isOwner:boolean;children:React.ReactNode}) {
  const [started, setStarted] = useState<{ source: string; endsAt: string } | null>(null);
  const [startError, setStartError] = useState(false);
  const starting = useRef<string | null>(null);
  const startSimulation = useCallback(async () => {
    if (!view?.simulationPending || starting.current === view.endsAt) return;
    starting.current = view.endsAt;
    try {
      const endsAt = await beginTrialSimulation();
      if (!endsAt) throw new Error("Simulation not available");
      setStarted({ source: view.endsAt, endsAt });
    } catch {
      starting.current = null;
      setStartError(true);
    }
  }, [view]);
  const current = view?.simulationPending && started?.source === view.endsAt
    ? { ...view, endsAt: started.endsAt, simulationPending: false }
    : view;
  return <Context.Provider value={{view:current,isOwner,startSimulation}}>
    <TrialExpiryWatch />
    {startError && <p role="alert">The test countdown could not start. Return to Admin → Signup experiment and reset it.</p>}
    {children}
  </Context.Provider>;
}

/** Start only after the real dashboard data and controls are on screen. */
export function useStartTrialSimulation() {
  const {view,startSimulation} = useContext(Context);
  useEffect(() => { if (view?.simulationPending) void startSimulation(); }, [view?.simulationPending,startSimulation]);
}
export function TrialExpiryWatch() {
  const {view} = useContext(Context); const router=useRouter(); const pathname=usePathname();
  useEffect(()=>{
    if (view?.simulationPending) return;
    if (!view || view.hasCard) return;
    let redirected = false;
    const billingPage = ["/dashboard/upgrade", "/dashboard/subscription", "/dashboard/trial", "/mobile-subscription-v2"].includes(pathname ?? "");
    const check = () => {
      if (!redirected && !billingPage && Date.now() >= Date.parse(view.endsAt)) {
        redirected = true;
        router.replace("/dashboard/trial?locked=1");
      }
    };
    check(); const timer=setInterval(check,1000); window.addEventListener("focus",check);
    return ()=>{clearInterval(timer);window.removeEventListener("focus",check);};
  },[view,router,pathname]);
  return null;
}
export function useTrialTimerVisible() { const {view} = useContext(Context); return Boolean(view && !view.hasCard); }
export function TrialNavTimer({ compact = false }: { compact?: boolean }) {
  const {view,isOwner}=useContext(Context); const [now,setNow]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
  if (!view || view.hasCard) return null;
  const remaining=now ? Math.max(0,Math.ceil((Date.parse(view.endsAt)-now)/1000)) : view.kind === "ended" ? 0 : Math.max(60,view.daysLeft*86400);
  const text=view.simulationPending?"Starting test…":remaining===0?"Trial ended":remaining<60?remaining+"s left":remaining<86400?"Ends today":Math.ceil(remaining/86400)+" days left";
  return <div className={s.navTimer + (compact ? " " + s.compact : "")}><span><b>{text}</b><small>{isOwner?"Add a card to keep access":"Ask your owner to subscribe"}</small></span>{isOwner&&<Link href="/dashboard/upgrade" className={s.navPay}>Pay now</Link>}</div>;
}
export function TrialExpiredGate() {
  return <section className={s.expiredGate} role="alert"><h1>Your free trial has ended</h1><p>Subscribe to continue using JobFlex. Your estimates, clients and work are saved.</p><Link className={s.button} href="/dashboard/upgrade">Pay now — choose a plan</Link></section>;
}
