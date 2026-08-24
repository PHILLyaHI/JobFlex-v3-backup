export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      {/* framing-square glyph */}
      <path
        d="M10 8.5h4v11h9v4H10z"
        fill="var(--color-lime)"
      />
      <circle cx="21.5" cy="11" r="2.6" fill="#fff" opacity="0.9" />
    </svg>
  );
}

export function Logo({
  dark = false,
  className = "",
}: {
  dark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark
        className={`h-8 w-8 ${dark ? "text-white/10" : "text-lp-base"}`}
      />
      <span
        className={`text-[22px] font-extrabold tracking-tight ${
          dark ? "text-white" : "text-lp-base"
        }`}
      >
        jobflex
      </span>
    </span>
  );
}
