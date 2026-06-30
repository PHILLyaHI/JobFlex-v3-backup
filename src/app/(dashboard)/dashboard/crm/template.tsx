"use client";
import { motion } from "framer-motion";

/**
 * Re-mounts on every navigation within the /dashboard/crm segment, so each
 * section (Overview, Customer book, Workflows, Follow-up queue) fades + lifts
 * in. Pairs with the sliding active-pill in <CrmTabs /> for a smooth handoff.
 */
export default function CrmTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
