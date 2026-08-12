// Team-invite icon sprite — PORT of the donor's inline
// `<svg width="0" height="0" style="position:absolute">` block from
// `jobflex-auth-invite-blueprint.html`, verbatim: same four symbols, same
// order, same viewBox, same path data character for character.
//
// `i-users` is declared but never <use>d — that is the donor's own dead
// symbol, kept because deleting it would be an edit to the design of record.
// `i-eye`, `i-eye-off` and `i-check` are all live.
//
// The stroke treatment is NOT here — `.jf-auth-invite svg.ic` in
// auth-invite.css carries fill/stroke/width/linecap/linejoin, exactly as the
// donor did, so the symbols stay geometry-only.
//
// Symbol ids are document-global and the donor's literal ids are kept. Safe
// here: `(auth)` has no route-group layout, so blueprint-shell (and its own
// sprite) never mounts on this route, and only one auth page is ever in the
// document at a time.

export function AuthInviteSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></symbol>
      <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.2" /><path d="M6.6 6.8A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" /><path d="M3 3l18 18" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></symbol>
      <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1A4 4 0 0 1 16 11" /></symbol>
    </svg>
  );
}
