// MOBILE · Create account — icon sprite.
//
// The path data is the desktop port's (components/v3/auth-register-blueprint/
// register-sprite.tsx) character-for-character, plus three icons the mobile
// composition needs that the desktop one does not (search / clear / chevron).
//
// SYMBOL IDS ARE NAMESPACED. `<symbol id>` lives in the DOCUMENT id space, not
// in a stylesheet scope, so two sprites that both publish `#i-check` would have
// the first-mounted one win every `<use>` on the page. The desktop register
// sprite already owns the bare `i-*` names; every id here is prefixed `mrg-`
// (Mobile ReGister) so the two can never shadow one another even if some future
// layout mounts both.

export function MobileRegisterSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <symbol id="mrg-eye" viewBox="0 0 24 24">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </symbol>
      <symbol id="mrg-eye-off" viewBox="0 0 24 24">
        <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.2" />
        <path d="M6.6 6.8A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" />
        <path d="M3 3l18 18" />
      </symbol>
      <symbol id="mrg-arrow-r" viewBox="0 0 24 24">
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </symbol>
      <symbol id="mrg-arrow" viewBox="0 0 24 24">
        <path d="M6 18L18 6" />
        <path d="M9 6h9v9" />
      </symbol>
      <symbol id="mrg-back" viewBox="0 0 24 24">
        <path d="M15 5l-7 7 7 7" />
      </symbol>
      <symbol id="mrg-check" viewBox="0 0 24 24">
        <path d="M4 12.5l5 5L20 6.5" />
      </symbol>
      <symbol id="mrg-gift" viewBox="0 0 24 24">
        <rect x="3" y="9" width="18" height="12" rx="1" />
        <path d="M3 13h18" />
        <path d="M12 9v12" />
        <path d="M8 9a2.5 2.5 0 0 1 0-5c2 0 4 5 4 5" />
        <path d="M16 9a2.5 2.5 0 0 0 0-5c-2 0-4 5-4 5" />
      </symbol>
      {/* new for the handheld composition */}
      <symbol id="mrg-search" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </symbol>
      <symbol id="mrg-x" viewBox="0 0 24 24">
        <path d="M6 6l12 12" />
        <path d="M18 6L6 18" />
      </symbol>
      <symbol id="mrg-chev" viewBox="0 0 24 24">
        <path d="M6 9.5l6 6 6-6" />
      </symbol>
      <symbol id="mrg-google" viewBox="0 0 48 48">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"
        />
      </symbol>
    </svg>
  );
}
