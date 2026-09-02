// Roof estimator blueprint — the ONE sprite symbol the shared shell does not
// already carry. The donor's sprite is the shell's 42-symbol set plus `i-tag`;
// every shared id (i-roof, i-check, i-bulb, i-file, …) has byte-identical
// geometry, so only the new symbol ships here and every other
// `<use href="#i-…">` resolves against the shell copy
// (components/v3/blueprint-shell/sprite.tsx).
//
// Line style: 24×24 / stroke 2 / currentColor (styling comes from svg.ic CSS).

export function RoofEstimatorSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-tag" viewBox="0 0 24 24"><path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z" /><circle cx="7" cy="7" r="1.2" /></symbol>
      </defs>
    </svg>
  );
}
