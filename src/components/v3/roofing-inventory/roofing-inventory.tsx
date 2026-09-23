"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import RoofingInventoryDesktop from "./roofing-inventory-desktop";
import { useRoofingInventory, type RoofingInventoryProps } from "./roofing-inventory-model";

const RoofingInventoryMobile = dynamic(() => import("./roofing-inventory-mobile"), { ssr: false });
const HANDHELD = "(max-width: 768px)";
const subscribe = (callback: () => void) => {
  const query = window.matchMedia(HANDHELD);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const getSnapshot = () => window.matchMedia(HANDHELD).matches;
const getServerSnapshot = () => false;

export function RoofingInventory(props: RoofingInventoryProps) {
  const handheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const workspace = useRoofingInventory(props);
  return handheld ? <RoofingInventoryMobile workspace={workspace} /> : <RoofingInventoryDesktop workspace={workspace} />;
}
