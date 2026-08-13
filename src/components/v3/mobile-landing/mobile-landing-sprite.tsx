// Icon sprite for the handheld landing.
//
// Geometry only — the stroke treatment lives in `.jf-mobile-landing .ml-ic`
// (mobile-landing.css), exactly as the desktop sheet does it, so one rule
// controls every icon's weight and cap style.
//
// SVG <symbol> ids are DOCUMENT-GLOBAL, like element ids and @keyframes names.
// The desktop landing sprite claims the bare donor ids (#i-bulb, #i-users,
// #i-file, #i-cal, #i-arrow, #i-arrow-r, #i-menu), so every id here carries the
// `jfml-` prefix. The responsive switch mounts exactly one of the two trees, so
// they can never co-exist — the prefix is the belt to that braces, and it also
// keeps this sprite safe against the blueprint app shell's sheet if the page is
// ever mounted somewhere that does render it.
//
// Seven of the eight symbols are the desktop donor's, path for path. `i-close`
// is new: the handheld nav's burger is a toggle, and a burger that stays a
// burger while its drawer is open gives no way to read the control's state at a
// glance. It is drawn in the same 24x24 / stroke-2 / currentColor line style.
//
// The `jfml-khatch` hatch pattern is deliberately NOT here: it lives in the
// kitchen schematic's own <defs>, which is where `.ml-k-cab`'s
// `fill: url(#jfml-khatch)` resolves it.

export function MobileLandingSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="jfml-i-bulb" viewBox="0 0 24 24">
          <path d="M14.5 15c.2-1 .7-1.8 1.4-2.53a4.9 4.9 0 1 0-7.8 0c.7.73 1.2 1.53 1.4 2.53" />
          <path d="M9.5 18h5" />
          <path d="M10.5 21h3" />
          <path d="M12 1.5V3" />
          <path d="m6.34 3.84 1.06 1.06" />
          <path d="m17.66 3.84-1.06 1.06" />
          <path d="M4 9.5h1.5" />
          <path d="M18.5 9.5H20" />
        </symbol>
        <symbol id="jfml-i-users" viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </symbol>
        <symbol id="jfml-i-file" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </symbol>
        <symbol id="jfml-i-cal" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="1" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </symbol>
        <symbol id="jfml-i-arrow" viewBox="0 0 24 24">
          <path d="M7 7h10v10" />
          <path d="M7 17 17 7" />
        </symbol>
        <symbol id="jfml-i-arrow-r" viewBox="0 0 24 24">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </symbol>
        <symbol id="jfml-i-menu" viewBox="0 0 24 24">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </symbol>
        <symbol id="jfml-i-close" viewBox="0 0 24 24">
          <path d="M5 5l14 14" />
          <path d="M19 5L5 19" />
        </symbol>
      </defs>
    </svg>
  );
}
