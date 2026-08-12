"use client";
import * as React from "react";
import { validateAttributionCode } from "@/actions/attribution";
import { CODE_RE, readClientAttr } from "@/lib/attributionShared";

export type RegisterAttribution = { kind: "promo" | "ref"; code: string };

// Step 4 of the attribution loop: the signup page checks the URL, then the
// 30-day capture cookie/localStorage, validates the code server-side, and shows
// "Referred by Mike Johnson ✓". The pill is a claim, not proof — the server
// re-validates whatever code registerAccount receives.
//
// This is the logic of the retired src/app/(auth)/auth/register/referred-by.tsx,
// unchanged, re-dressed in the donor's `.ref-banner` markup. The donor mockup
// shows the referred state only — it defines no manual "enter a code" field and
// no remove control, so neither ships here (see the port report).
export function ReferralBanner({ onChange }: { onChange: (a: RegisterAttribution | null) => void }) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [pill, setPill] = React.useState<{
    kind: "promo" | "ref";
    code: string;
    displayName: string;
    percentOff: number | null;
  } | null>(null);

  const apply = React.useCallback(async (kind: "promo" | "ref", code: string): Promise<boolean> => {
    const res = await validateAttributionCode({ kind, code });
    if (!res.ok) return false;
    setPill({ kind: res.kind, code: res.code, displayName: res.displayName, percentOff: res.percentOff });
    onChangeRef.current({ kind: res.kind, code: res.code });
    return true;
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- state is set after the async server validation resolves, not synchronously */
  React.useEffect(() => {
    // Freshest signal first: a code in the register URL itself, then the capture
    // cookie, then localStorage.
    const sp = new URLSearchParams(window.location.search);
    const urlPromo = sp.get("promo")?.trim().toUpperCase();
    const urlRef = sp.get("ref")?.trim().toUpperCase();
    const fromUrl = urlPromo
      ? ({ k: "promo", c: urlPromo } as const)
      : urlRef
        ? ({ k: "ref", c: urlRef } as const)
        : null;
    const candidate = fromUrl && CODE_RE.test(fromUrl.c) ? fromUrl : readClientAttr();
    if (!candidate) return;
    void apply(candidate.k, candidate.c);
  }, [apply]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!pill) return null;

  return (
    <div className="ref-banner">
      <svg className="ic">
        <use href="#i-gift" />
      </svg>
      <div>
        <div className="ref-t">Referred by {pill.displayName} ✓</div>
        <div className="ref-c">
          Code {pill.code} applied
          {pill.percentOff ? ` · ${pill.percentOff}% off your first month` : ""}
        </div>
      </div>
    </div>
  );
}
