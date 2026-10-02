"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { resetTrialSimulation } from "@/actions/trialSimulation";
import s from "./signup-experiment.module.css";
export function SimulationButton() {
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function start() {
    setBusy(true);setError("");
    try {
      const result = await resetTrialSimulation();
      const login = await signIn("signup-ticket", { ticket: result.ticket, redirect: false });
      if (login?.error) throw new Error("Couldn't open the test workspace. Try resetting it again.");
      window.location.assign("/dashboard");
    } catch(e) { setError(e instanceof Error?e.message:"Couldn't start the simulation.");setBusy(false); }
  }
  return <><button className={s.button} onClick={start} disabled={busy}>{busy?"Opening test workspace…":"Reset & open 15-second trial"}</button>{error&&<p role="alert">{error}</p>}</>;
}
