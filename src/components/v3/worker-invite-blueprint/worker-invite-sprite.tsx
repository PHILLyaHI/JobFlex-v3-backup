// Worker-invite icon sprite — the same four-symbol, geometry-only block the
// team-invite page carries (components/v3/auth-invite-blueprint/
// auth-invite-sprite.tsx), plus the two symbols this page uses that that one
// does not: `i-x` for the declined state and `i-arrow` for the "what happens
// next" list.
//
// The stroke treatment is NOT here — `.jf-worker-invite svg.ic` in
// worker-invite.css carries fill/stroke/width/linecap/linejoin, so the symbols
// stay geometry-only and tint from `currentColor`.
//
// Symbol ids are document-global, and these are the SAME literal ids the
// auth-invite sprite uses. Safe: `(worker-portal)` and `(auth)` are different
// route groups, blueprint-shell never mounts on either, and only one of these
// pages is ever in the document at a time.

export function WorkerInviteSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></symbol>
      <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.2" /><path d="M6.6 6.8A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" /><path d="M3 3l18 18" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M5 5l14 14" /><path d="M19 5L5 19" /></symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></symbol>
    </svg>
  );
}
