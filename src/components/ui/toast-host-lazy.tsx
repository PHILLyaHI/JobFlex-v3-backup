"use client";
import dynamic from "next/dynamic";
import { useToastStore } from "./toast-store";

/* The root layout's toast host, loaded only once a toast exists. Toast.tsx
   carries framer-motion (117 KB raw in the client bundle); mounted eagerly
   it rode along with every page, the landing included (landing-e pass C,
   2026-09-11). Here the store is watched from a two-line client component,
   and the host — with its library — is fetched the first time anything is
   pushed. The first toast appears a beat later; every later one is instant. */
const ToastHost = dynamic(() => import("./Toast").then((m) => m.ToastHost), { ssr: false });

export function ToastHostLazy() {
  // `seen` latches on the first push (toast-store), so the host — and its
  // exit animations — stays mounted after the store empties again.
  const seen = useToastStore((s) => s.seen);
  return seen ? <ToastHost /> : null;
}
