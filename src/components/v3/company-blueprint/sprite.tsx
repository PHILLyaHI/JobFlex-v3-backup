// Company blueprint — the two icons this donor adds on top of the shell sprite.
//
// The donor ships 44 symbols; 42 of them are byte-identical (same id, same
// geometry) to the ones blueprint-shell/sprite.tsx already renders, so only
// `i-palette` and `i-globe` ship here. Both keep their donor ids — neither
// collides with a shell symbol — so <use href="#i-palette"> resolves without
// touching any markup. Paths are verbatim from the donor.
//
// Rendered as the LAST child of the content fragment.

export function CompanySprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-palette" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".8" /><circle cx="17.5" cy="10.5" r=".8" /><circle cx="8.5" cy="7.5" r=".8" /><circle cx="6.5" cy="12.5" r=".8" /><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.5-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-5-4.5-8.6-10-8.6Z" /></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></symbol>
      </defs>
    </svg>
  );
}
