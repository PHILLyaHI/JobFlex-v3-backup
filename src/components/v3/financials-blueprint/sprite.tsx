// Financials blueprint — the sprite symbols the shared shell does not already
// carry. The donor's sprite is the shell's 42-symbol set plus `i-receipt`;
// every shared id has byte-identical geometry, so only the new symbols ship
// here and every other `<use href="#i-…">` resolves against the shell copy
// (components/v3/blueprint-shell/sprite.tsx).
//
// The five after `i-receipt` are the Overhead tab's line icons — insurance,
// vehicles, software, office, utilities. Rent / warehouse / other and the
// three scaling lines reuse shell symbols (building, box, dots, hardhat,
// target, megaphone).
//
// Line style: 24×24 / stroke 2 / currentColor (styling comes from svg.ic CSS).

export function FinancialsSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M4 2v20l2.5-1.6L9 22l2.5-1.6L14 22l2.5-1.6L19 22V2l-2.5 1.6L14 2l-2.5 1.6L9 2 6.5 3.6Z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></symbol>
        <symbol id="i-truck" viewBox="0 0 24 24"><path d="M2 7h11v9H2z" /><path d="M13 10h4l3 3v3h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></symbol>
        <symbol id="i-laptop" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 19h20" /></symbol>
        <symbol id="i-briefcase" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="1" /><path d="M9 7V4h6v3" /><path d="M3 12h18" /></symbol>
        <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></symbol>
        <symbol id="i-tag" viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.5" /></symbol>
      </defs>
    </svg>
  );
}
