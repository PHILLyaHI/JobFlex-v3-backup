import Link from "next/link";
import { ArrowUpRight, Github, Linkedin, MessageCircle } from "lucide-react";
import { footer } from "@/lib/v3/landing-copy";
import { BevelButton } from "./_primitives/BevelButton";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";

const SOCIAL_ICONS: Record<string, typeof Github> = {
  LinkedIn: Linkedin,
  Discord: MessageCircle,
  X: ArrowUpRight,
};

export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden bg-[color:var(--paper)]">
      {/* Big halftone wordmark */}
      <div className="relative mx-auto max-w-[1400px] px-6 pb-12 pt-16 lg:px-10 lg:pt-24">
        <div className="relative mx-auto" style={{ maxWidth: 1080 }}>
          <HalftoneFigure
            variant="wordmark"
            text={footer.wordmark}
            width={1080}
            height={220}
            color="var(--accent)"
            density={6}
            className="h-auto w-full"
            ariaLabel="JOBFLEX"
          />
        </div>
      </div>

      <div className="relative border-t border-[color:var(--ink-line)]">
        <div className="mx-auto max-w-[1280px] px-6 py-12 lg:px-10 lg:py-16">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4 lg:grid-cols-5">
            {/* Logo column */}
            <div className="col-span-2 md:col-span-4 lg:col-span-1">
              <Link href={"/v3" as never} className="inline-flex items-center gap-2.5">
                <span
                  className="grid h-9 w-9 place-items-center bg-[color:var(--ink)] font-display text-[15px] font-semibold leading-none text-[color:var(--paper)]"
                  style={{
                    clipPath:
                      "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
                  }}
                >
                  J
                </span>
                <span className="font-display text-[18px] font-medium tracking-[-0.02em]">
                  JobFlex
                </span>
              </Link>
              <p className="mt-4 max-w-[28ch] text-[13px] leading-[1.6] text-[color:var(--ink-muted)]">
                The quiet operating system for contractors. Built in Philadelphia
                for the way crews actually work.
              </p>
              <div className="mt-6">
                <BevelButton href={"/auth/register" as never} size="md" variant="filled">
                  Start free trial
                </BevelButton>
              </div>
            </div>

            {/* Link columns */}
            {footer.columns.map((col) => (
              <div key={col.label}>
                <div className="quiet-caps text-[10px] tracking-[0.16em] text-[color:var(--ink-muted)]">
                  {col.label}
                </div>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => {
                    const Icon =
                      col.label === "Connect"
                        ? SOCIAL_ICONS[link.label] ?? ArrowUpRight
                        : null;
                    return (
                      <li key={link.label}>
                        <Link
                          href={link.href as never}
                          className="group inline-flex items-center gap-2 text-[13px] text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
                        >
                          {Icon ? (
                            <Icon
                              className="h-3.5 w-3.5 text-[color:var(--ink-faint)] group-hover:text-[color:var(--ink-soft)]"
                              strokeWidth={1.5}
                            />
                          ) : null}
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom row */}
          <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-t border-[color:var(--ink-line)] pt-6 sm:flex-row sm:items-center">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">
              {footer.copyright}
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">
              v3 · marketing
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
