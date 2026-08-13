"use client";

// ESTIMATOR PICKER — review harness (client half).
//
// The picker is NOT a page. It is `position: fixed; inset: 0`, mounted once per
// shell beside the command palette, and opened by a `jf:estimator-picker`
// document event. Reviewing it therefore meant signing in, landing on a
// handheld surface and tapping the topbar's New Estimate button, at every
// width you wanted to see. This route is that, minus the sign-in and the
// navigation: it opens the dialog on load and hands you a button to reopen it.
//
// IT DOES NOT MOUNT <EstimatorPicker /> ITSELF, deliberately. <MobileNav />
// already mounts one — it is the handheld shell's copy, the real one — and a
// second instance would listen to the same document event, so every open would
// stack two dialogs and every measurement would be of the wrong one. Mounting
// the nav instead of the dialog also means this harness is the genuine handheld
// host rather than an approximation of it: same chrome, same drawer to check
// the picker's z-index against, same sprite the `#i-x` close icon resolves out
// of, and the real New Estimate button as the real entry point.
//
// So: no fork of the picker, and no second copy of anything. The only thing
// this file owns is the ground the dialog is judged over.

import { useCallback, useEffect } from "react";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import "./harness.css";

export function EstimatorPickerHarness() {
  // The same event the topbar button dispatches, and the same event the client
  // record dispatches with a `detail.clientId`. Sent bare here: the picker
  // clears its client on every open, and a harness that arrived with one
  // attached would be reviewing a state the New Estimate button never produces.
  const open = useCallback(() => {
    document.dispatchEvent(new CustomEvent("jf:estimator-picker"));
  }, []);

  // One frame after mount, not during it: the dialog focuses its first card on
  // open, and dispatching inside the commit phase would race React's own.
  useEffect(() => {
    const raf = requestAnimationFrame(open);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <div className="jf-epl-app">
      <MobileNav showSearch={false} />

      <div className="jf-epl-sheet">
        <div className="jf-epl-kicker">Review harness &middot; drawing № 2847</div>
        <h1 className="jf-epl-title">
          Estimator
          <br />
          picker
        </h1>
        <p className="jf-epl-note">
          The dialog opens on load. This page exists so it can be read at any
          width without a sign-in — it is the handheld host, not a copy of the
          dialog. The picker itself is the one <code>MobileNav</code> mounts on
          every handheld surface.
        </p>

        <button className="jf-epl-open" type="button" onClick={open}>
          <i>+</i> Open the picker
        </button>

        <ul className="jf-epl-list">
          <li>
            <b>01</b>
            <span>
              Tap the <b>+</b> in the topbar — that is the real entry point, the
              same dumb dispatcher the desktop topbar uses.
            </span>
          </li>
          <li>
            <b>02</b>
            <span>
              Open the drawer from the burger, then open the picker. The dialog
              sits above it; both shells put their drawer at z-index 90.
            </span>
          </li>
          <li>
            <b>03</b>
            <span>
              Drag the viewport across 768px. The sheet and the centred dialog
              swap live, on a media query — there is no user-agent test
              anywhere in this surface.
            </span>
          </li>
          <li>
            <b>04</b>
            <span>
              Escape closes the dialog without closing the drawer behind it.
              Backdrop tap closes it too, and focus returns to whatever opened
              it.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
