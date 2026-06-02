"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "filled" | "outline";
type Tone = "light" | "dark";
type Size = "md" | "lg";

type CommonProps = {
  children: React.ReactNode;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  className?: string;
};

type AsButton = CommonProps & {
  href?: undefined;
  type?: "button" | "submit";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
};

type AsLink = CommonProps & {
  href: string;
  type?: undefined;
  onClick?: undefined;
};

type Props = AsButton | AsLink;

const BEVEL = "10px";
const OUTER_CLIP = `polygon(0 0, calc(100% - ${BEVEL}) 0, 100% ${BEVEL}, 100% 100%, ${BEVEL} 100%, 0 calc(100% - ${BEVEL}))`;

const SIZE: Record<Size, string> = {
  md: "h-10 px-5 text-[12px]",
  lg: "h-12 px-7 text-[13px]",
};

function fillSurface(variant: Variant, tone: Tone): string {
  if (variant === "filled") {
    return tone === "light"
      ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
      : "bg-[color:var(--paper)] text-[color:var(--ink)]";
  }
  return tone === "light"
    ? "bg-transparent text-[color:var(--ink)]"
    : "bg-transparent text-[color:var(--paper)]";
}

function outlineColor(tone: Tone): string {
  return tone === "light"
    ? "bg-[color:var(--ink)]"
    : "bg-[color:var(--paper)]";
}

export function BevelButton(props: Props) {
  const {
    children,
    variant = "filled",
    tone = "light",
    size = "md",
    className,
  } = props;

  const base = cn(
    "group relative inline-flex items-center justify-center font-medium uppercase tracking-[0.08em] select-none",
    "transition-[transform,filter] duration-200 ease-[cubic-bezier(.22,1,.36,1)]",
    "hover:-translate-y-[1px] active:translate-y-0",
    "focus-visible:outline-none focus-visible:[--ring:1] focus-visible:drop-shadow-[0_0_0_3px_rgba(31,122,82,0.35)]",
    SIZE[size],
    className,
  );

  const layers = (
    <>
      {variant === "outline" && (
        <span
          aria-hidden
          className={cn("absolute inset-0", outlineColor(tone))}
          style={{ clipPath: OUTER_CLIP }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "absolute transition-colors duration-200",
          variant === "outline"
            ? cn(
                "inset-[1px]",
                tone === "light"
                  ? "bg-[color:var(--paper)] group-hover:bg-[color:var(--paper-deep)]"
                  : "bg-[color:var(--ink)] group-hover:bg-[color:var(--ink-soft)]",
              )
            : cn(
                "inset-0",
                tone === "light"
                  ? "bg-[color:var(--ink)] group-hover:bg-[color:var(--ink-soft)]"
                  : "bg-[color:var(--paper)] group-hover:bg-[color:var(--paper-deep)]",
              ),
        )}
        style={{ clipPath: OUTER_CLIP }}
      />
      <span className={cn("relative z-10 truncate", fillSurface(variant, tone))}>
        {children}
      </span>
    </>
  );

  if ("href" in props && props.href) {
    return (
      <Link href={props.href as never} className={base}>
        {layers}
      </Link>
    );
  }

  const { type = "button", onClick } = props as AsButton;
  return (
    <button type={type} onClick={onClick} className={base}>
      {layers}
    </button>
  );
}
