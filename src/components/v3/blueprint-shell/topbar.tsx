// Blueprint shell — topbar. Donor markup, verbatim.
//
// This is the union of both donors' topbars: the newer proposals donor's
// mobile burger (its drawer is the only way to reach the nav under 860px —
// the older dashboard donor simply hid the sidebar with no way back) plus the
// dashboard donor's ⌘K chip, which the proposals donor dropped but
// decisions.md still lists as part of the mono annotation layer.

// The search field was a dead `<input>` and the ⌘K chip was decoration. Both
// now open the command palette, which the shell renders alongside this bar.
// A button, not an input: the field never accepted typing, so presenting it as
// something you type into was the lie. It opens the thing you type into.

export function Topbar() {
  const openPalette = () => {
    document.dispatchEvent(new CustomEvent("jf:command-palette"));
  };
  const openPicker = () => {
    document.dispatchEvent(new CustomEvent("jf:estimator-picker"));
  };

  return (
    <header className="topbar">
      <button className="icon-btn nav-burger" id="navBurger" type="button" aria-label="Open navigation">
        <svg className="ic">
          <use href="#i-menu" />
        </svg>
      </button>
      {/* The ⌘K chip is gone by request. It came from the dashboard donor and
          decisions.md lists it under the mono annotation layer, so this is a
          deliberate departure rather than a slip: the shortcut still works and
          is still advertised, in the accessible name instead of as a plate in
          the bar. */}
      <button className="search" type="button" onClick={openPalette} aria-label="Search — ⌘K">
        <svg className="ic">
          <use href="#i-search" />
        </svg>
        <span className="search-ph">Search clients, proposals, leads…</span>
      </button>

      <div className="topbar-right">
        {/* The app's most prominent CTA was a bare <button> with no onClick,
            no type and no id — the only thing touching it was the press
            animation, so it looked responsive and did nothing. It then pointed
            straight at Smart Proposal, which quietly decided FOR the user that
            every estimate is an AI one. It now opens the estimator picker, so
            the engine is a choice: Roof, Fence, Manual or Smart Proposal.
            A dumb dispatcher, like the ⌘K chip beside it — the dialog owns its
            own state and is mounted once in the shell. */}
        <button className="btn btn-primary" type="button" onClick={openPicker}>
          <svg className="ic">
            <use href="#i-plus" />
          </svg>
          New Estimate
        </button>
        {/* The bell had no handler, and `.bell-dot` was a static CSS dot no
            code ever toggled — so it advertised unread notifications
            permanently, whether or not any existed. Until a notification
            surface exists, it opens the palette (where everything reachable
            is listed) and the dot is gone rather than lying. */}
        <button
          className="icon-btn"
          type="button"
          title="Notifications"
          aria-label="Notifications"
          onClick={openPalette}
        >
          <svg className="ic">
            <use href="#i-bell" />
          </svg>
        </button>
      </div>
    </header>
  );
}
