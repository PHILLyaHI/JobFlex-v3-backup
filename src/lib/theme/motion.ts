import type { Variants } from "framer-motion";

export const editorialEase = [0.22, 1, 0.36, 1] as const;

export const pageEnter: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: editorialEase } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export const listStagger: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

export const listItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: editorialEase } },
};

export const sheetSlide: Variants = {
  initial: { x: "100%" },
  animate: { x: 0, transition: { duration: 0.32, ease: editorialEase } },
  exit: { x: "100%", transition: { duration: 0.22, ease: editorialEase } },
};

export const popover: Variants = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: editorialEase } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12, ease: editorialEase } },
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.44, ease: editorialEase } },
};
