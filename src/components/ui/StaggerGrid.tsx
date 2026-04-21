"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export function StaggerGrid({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05, delayChildren: delay } } }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
