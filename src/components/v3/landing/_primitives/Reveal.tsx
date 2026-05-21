"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
  className?: string;
  once?: boolean;
  margin?: string;
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children,
  delay = 0,
  duration = 0.6,
  y = 16,
  className,
  once = true,
  margin = "-80px",
}: Props) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin }}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: ReactNode[];
  delay?: number;
  step?: number;
  duration?: number;
  y?: number;
  className?: string;
  itemClassName?: string;
};

export function RevealStagger({
  children,
  delay = 0,
  step = 0.08,
  duration = 0.55,
  y = 14,
  className,
  itemClassName,
}: StaggerProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={className}>
        {children.map((c, i) => (
          <div key={i} className={itemClassName}>
            {c}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={className}>
      {children.map((c, i) => (
        <motion.div
          key={i}
          className={itemClassName}
          initial={{ opacity: 0, y }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{
            duration,
            delay: delay + i * step,
            ease: EASE,
          }}
        >
          {c}
        </motion.div>
      ))}
    </div>
  );
}
