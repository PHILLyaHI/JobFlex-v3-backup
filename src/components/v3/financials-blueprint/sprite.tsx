// Financials blueprint — the ONE sprite symbol the shared shell does not
// already carry. The donor's sprite is the shell's 42-symbol set plus
// `i-receipt`; every shared id has byte-identical geometry, so only the new
// symbol ships here and every other `<use href="#i-…">` resolves against the
// shell copy (components/v3/blueprint-shell/sprite.tsx).
//
// Line style: 24×24 / stroke 2 / currentColor (styling comes from svg.ic CSS).

export function FinancialsSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M4 2v20l2.5-1.6L9 22l2.5-1.6L14 22l2.5-1.6L19 22V2l-2.5 1.6L14 2l-2.5 1.6L9 2 6.5 3.6Z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></symbol>
      </defs>
    </svg>
  );
}
