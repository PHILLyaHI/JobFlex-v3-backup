// SUBSCRIPTION — BLUEPRINT · the ONE icon the shell does not already publish.
//
// The mockup carries the whole app icon set (~34 symbols: i-logo, i-search,
// i-grid, i-file, i-users, i-crm, i-cal, …) because it also carries the whole
// app shell. The shell here renders its own sprite from
// blueprint-shell/sprite.tsx (the proposals set, 49 symbols), and the five
// icons this page's CONTENT uses — i-arrow, i-bulb, i-x, i-file, i-gift — are
// already in it with byte-identical path data, checked symbol by symbol
// against the source. So the whole sprite is discarded except `i-copy`, which
// the shell set does not carry.
//
// SVG symbol ids are document-global and the shell's sprite is mounted on this
// page, so the id was checked for collision before being added: nothing else
// publishes `i-copy`.
//
// `position: absolute` is the source's own inline style and is load-bearing
// here for a second reason: this element is a child of the shell's
// `.content`, which is `display: flex; flex-direction: column; gap: 22px`.
// Out of flow means it is not a flex item, so it adds no phantom 22px gap.

export function SubscriptionSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-copy" viewBox="0 0 24 24">
          <rect x="9" y="9" width="12" height="12" rx="1.5" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </symbol>
      </defs>
    </svg>
  );
}
