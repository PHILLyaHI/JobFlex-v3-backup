// Blueprint shell — topbar. Donor markup, verbatim.
//
// This is the union of both donors' topbars: the newer proposals donor's
// mobile burger (its drawer is the only way to reach the nav under 860px —
// the older dashboard donor simply hid the sidebar with no way back) plus the
// dashboard donor's ⌘K chip, which the proposals donor dropped but
// decisions.md still lists as part of the mono annotation layer.

export function Topbar() {
  return (
    <header className="topbar">
      <button className="icon-btn nav-burger" id="navBurger" type="button" aria-label="Open navigation">
        <svg className="ic">
          <use href="#i-menu" />
        </svg>
      </button>
      <label className="search">
        <svg className="ic">
          <use href="#i-search" />
        </svg>
        <input type="text" placeholder="Search clients, proposals, leads…" />
        <kbd>⌘K</kbd>
      </label>

      <div className="topbar-right">
        <button className="btn btn-primary">
          <svg className="ic">
            <use href="#i-plus" />
          </svg>
          New Estimate
        </button>
        <button className="icon-btn" title="Notifications" aria-label="Notifications">
          <svg className="ic">
            <use href="#i-bell" />
          </svg>
          <span className="bell-dot"></span>
        </button>
      </div>
    </header>
  );
}
