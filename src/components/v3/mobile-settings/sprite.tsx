// MOBILE SETTINGS — page-local SVG sprite.
//
// The shared handheld sprite (components/v3/mobile-shell/sprite.tsx, rendered
// by <MobileNav/>) already carries i-users, i-card, i-bell, i-bank, i-grid,
// i-check, i-x, i-plus, i-mail, i-send, i-arrow, i-chev, i-cal, i-file,
// i-target, i-hardhat, i-thumb, i-board and i-out. These seven are the only
// symbols the settings surface draws that it lacks, so they are the only ones
// declared here — a duplicate id would shadow the shared one document-wide.
//
// Paths are the desktop settings sprite's, verbatim
// (components/v3/settings-blueprint/sprite.tsx) plus i-ext / i-pen / i-box
// from the shared desktop shell sprite, so the two surfaces draw identical
// marks. Line style: 24×24 / stroke 2 / currentColor (styling comes from the
// stylesheet's `.mst-ic`). i-google is the one multi-colour mark: 48×48 with
// explicit per-path fills and no stroke.

export function MobileSettingsSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M4 2v20l2.5-1.6L9 22l2.5-1.6L14 22l2.5-1.6L19 22V2l-2.5 1.6L14 2l-2.5 1.6L9 2 6.5 3.6Z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></symbol>
        <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.2" /><path d="M6.6 6.8A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" /><path d="M3 3l18 18" /></symbol>
        <symbol id="i-ext" viewBox="0 0 24 24"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></symbol>
        <symbol id="i-pen" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></symbol>
        <symbol id="i-box" viewBox="0 0 24 24"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></symbol>
        <symbol id="i-google" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.97 6.19C6.51 42.62 14.62 48 24 48Z" /></symbol>
      </defs>
    </svg>
  );
}
