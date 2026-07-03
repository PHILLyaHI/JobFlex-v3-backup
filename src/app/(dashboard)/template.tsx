"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { editorialEase } from "@/lib/theme/motion";

/**
 * Route transition for the dashboard. A `template.tsx` remounts on every
 * navigation, so this plays a short crossfade as the page content swaps —
 * smoothing route changes without the page-load choreography that would slow
 * down a task-focused product surface. Opacity only (no transform) so it never
 * creates a containing block that would re-anchor `position: fixed` children.
 * Honors prefers-reduced-motion by collapsing to an instant swap.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: editorialEase }}
    >
      {children}
    </motion.div>
  );
}
