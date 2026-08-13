// MOBILE HOMEOWNER — the icon sprite.
//
// The desktop page's ten symbols, plus `jfmh-i-x` for the category sheet's
// close control. Same line style throughout: 24×24 viewBox, stroke 2,
// currentColor, no fills.
//
// SVG <symbol> ids are DOCUMENT-GLOBAL, exactly like element ids and
// @keyframes names. `homeowner-landing` and `homeowner-blueprint` both claim
// the bare `i-img` / `i-doc` / … set and get away with it only because they
// never co-mount. This sprite does not join that pile: every id is prefixed
// `jfmh-`, so the page is safe even in the one arrangement that would break
// the bare names — the responsive switch at /homeowner momentarily holding two
// stylesheets in the document, or a future surface mounting both.

export function MobileHomeownerSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="jfmh-i-img" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </symbol>
        <symbol id="jfmh-i-doc" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </symbol>
        <symbol id="jfmh-i-grid" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </symbol>
        <symbol id="jfmh-i-bulb" viewBox="0 0 24 24">
          <path d="M9 15c-.2-1-.7-1.7-1.4-2.4A4.9 4.9 0 0 1 7.1 9.4a4.9 4.9 0 0 1 9.8 0c0 1.2-.5 2.3-1.5 3.2-.7.7-1.2 1.4-1.4 2.4" />
          <path d="M9.5 18h5" />
          <path d="M10.5 21h3" />
          <path d="M12 1.5V3" />
          <path d="m5.4 4.2 1.1 1.1" />
          <path d="m18.6 4.2-1.1 1.1" />
          <path d="M3 9.5h1.5" />
          <path d="M19.5 9.5H21" />
        </symbol>
        <symbol id="jfmh-i-chev" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </symbol>
        <symbol id="jfmh-i-check" viewBox="0 0 24 24">
          <path d="M20 6 9 17l-5-5" />
        </symbol>
        <symbol id="jfmh-i-clock" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l4 2" />
        </symbol>
        <symbol id="jfmh-i-tag" viewBox="0 0 24 24">
          <path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z" />
          <circle cx="7" cy="7" r="1.2" />
        </symbol>
        <symbol id="jfmh-i-arrow-r" viewBox="0 0 24 24">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </symbol>
        <symbol id="jfmh-i-arrow" viewBox="0 0 24 24">
          <path d="M7 7h10v10" />
          <path d="M7 17 17 7" />
        </symbol>
        <symbol id="jfmh-i-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </symbol>
      </defs>
    </svg>
  );
}
