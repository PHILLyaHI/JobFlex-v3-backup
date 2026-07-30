// Fence estimator blueprint — the two symbols this donor adds on top of the
// shared shell sprite (components/v3/blueprint-shell/sprite.tsx).
//
// The donor's sprite carries 44 symbols; 42 of them are byte-identical to the
// shell's copies and resolve from there, so only `i-door-open` and
// `i-door-closed` ship here. Both are new ids — no rename was needed — and both
// keep the donor's line style (24×24 / stroke 2 / currentColor, styling comes
// from the `svg.ic` CSS). They are referenced by the openings ledger, which
// picks one per row from the opening's `kind`, and by the Gate / Door buttons in
// the stage toolbar.

export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-door-open" viewBox="0 0 24 24"><path d="M13 4h3a2 2 0 0 1 2 2v14" /><path d="M2 20h3" /><path d="M13 20h9" /><path d="M10 12v.01" /><path d="M13 4.8v14.4a.6.6 0 0 1-.7.6l-5-1a.6.6 0 0 1-.3-.5V5.7a.6.6 0 0 1 .5-.6l5-1a.6.6 0 0 1 .5.7Z" /></symbol>
        <symbol id="i-door-closed" viewBox="0 0 24 24"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" /><path d="M2 20h20" /><path d="M14 12v.01" /></symbol>
      </defs>
    </svg>
  );
}
