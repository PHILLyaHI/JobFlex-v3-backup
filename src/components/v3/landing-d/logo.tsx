import Image from "next/image";

/* The house mark, shared with the blueprint shell rather than redrawn here.
   /jobflex-mark.png is mostly transparent margin, so the box clips the asset
   and the image is pulled up by the asset's own top inset — the same geometry
   dashboard-blueprint/blueprint.module.css uses, kept in landing-d.css as
   .lp-mark-box / .lp-mark-img so the two cannot drift apart visually. */
export function LogoMark({
  className = "",
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "paper";
}) {
  return (
    <span className={`lp-mark-box ${className}`}>
      <Image
        className={`lp-mark-img ${tone === "paper" ? "lp-mark-img--paper" : ""}`}
        src="/jobflex-mark.png"
        alt=""
        width={116}
        height={116}
        priority
      />
    </span>
  );
}

/* The full lockup: the blueprint's flat ink plate, the JOBFLEX wordmark and the
   CONTRACTOR OS kicker in sky. `dark` is for placement on an already-dark
   surface, where the plate would disappear — there the mark goes to paper and
   the plate is dropped. */
export function Logo({
  dark = false,
  className = "",
}: {
  dark?: boolean;
  className?: string;
}) {
  if (dark) {
    return (
      <span className={`lp-brand lp-brand--bare ${className}`}>
        <LogoMark tone="paper" />
        <span className="lp-brand-txt">
          <span className="lp-brand-name">JOBFLEX</span>
          <span className="lp-brand-sub">Contractor OS</span>
        </span>
      </span>
    );
  }
  return (
    <span className={`lp-brand ${className}`}>
      <LogoMark tone="paper" />
      <span className="lp-brand-txt">
        <span className="lp-brand-name">JOBFLEX</span>
        <span className="lp-brand-sub">Contractor OS</span>
      </span>
    </span>
  );
}
