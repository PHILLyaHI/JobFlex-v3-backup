// Reviews blueprint — the ONE sprite symbol the shared shell does not already
// carry. The donor's sprite is the shell's 42-symbol set plus `i-star`; every
// shared id (i-thumb, i-send, i-check, …) has byte-identical geometry, so only
// the new symbol ships here and every other `<use href="#i-…">` resolves
// against the shell copy (components/v3/blueprint-shell/sprite.tsx).
//
// `i-star` is the one FILLED glyph in the set: the donor overrides svg.ic's
// stroke pass with fill="currentColor" stroke="none" on the path itself, so the
// rating glyphs read as solid marks. Kept verbatim.

export function ReviewsSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9Z" fill="currentColor" stroke="none" /></symbol>
      </defs>
    </svg>
  );
}
