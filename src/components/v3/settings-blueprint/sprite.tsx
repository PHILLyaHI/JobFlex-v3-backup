// Settings blueprint — page-local SVG sprite.
//
// These seven symbols are the ONLY ones the shared shell sprite
// (components/v3/proposals-blueprint/sprite.tsx) lacks; everything else the
// settings page draws — i-users, i-bell, i-check, i-x, i-plus, i-trash,
// i-bank, i-phone, i-pen, i-send, i-undo, i-arrow, i-ext, i-chev, i-cal,
// i-file, i-target, i-hourglass, i-clock, i-box, i-hardhat, i-thumb,
// i-board — already lives in that shell sprite and must NOT be duplicated.
//
// Paths copied verbatim from the donor file, lines 1911-1916; i-mail (the
// notifications footer's "Email only") is drawn in the same 24/2 style.
// Line style: 24×24 / stroke 2 / currentColor (styling comes from svg.ic CSS).
// i-google is the one multi-colour mark: 48×48 with explicit per-path fills,
// kept exactly as the donor writes them.

export function SettingsSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-card" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="1" /><path d="M2 10h20" /></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></symbol>
        <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.2" /><path d="M6.6 6.8A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" /><path d="M3 3l18 18" /></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></symbol>
        <symbol id="i-google" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.97 6.19C6.51 42.62 14.62 48 24 48Z" /></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m3 7 9 6 9-6" /></symbol>
        <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M4 2v20l2.5-1.6L9 22l2.5-1.6L14 22l2.5-1.6L19 22V2l-2.5 1.6L14 2l-2.5 1.6L9 2 6.5 3.6Z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></symbol>
      </defs>
    </svg>
  );
}
