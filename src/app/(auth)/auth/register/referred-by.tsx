"use client";
import * as React from "react";
import { BadgeCheck, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { validateAttributionCode } from "@/actions/attribution";
import { CODE_RE, readClientAttr } from "@/lib/attributionShared";

export type RegisterAttribution = { kind: "promo" | "ref"; code: string };

// Step 4 of the attribution loop: the signup page checks the URL, then the
// 30-day capture cookie/localStorage, validates the code server-side, and shows
// "Referred by Mike Johnson ✓". The pill is a claim, not proof — the server
// re-validates whatever code registerAccount receives.
export function ReferredBy({ onChange }: { onChange: (a: RegisterAttribution | null) => void }) {
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
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const apply = React.useCallback(async (kind: "promo" | "ref", code: string): Promise<boolean> => {
    const res = await validateAttributionCode({ kind, code });
    if (!res.ok) return false;
    setPill({ kind: res.kind, code: res.code, displayName: res.displayName, percentOff: res.percentOff });
    setEditing(false);
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

  function remove() {
    setPill(null);
    setDraft("");
    onChangeRef.current(null);
  }

  async function submitDraft() {
    const code = draft.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      setEditError("That code doesn't look right.");
      return;
    }
    setChecking(true);
    setEditError(null);
    // Codes are globally unique per kind — try influencer promo first, then referral.
    const ok = (await apply("promo", code)) || (await apply("ref", code));
    setChecking(false);
    if (!ok) setEditError("We couldn't find that code.");
  }

  if (pill) {
    return (
      <div className="mb-5 flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-[color:var(--ink-line)] bg-[color:var(--accent-soft)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5 text-[13px] leading-snug">
          <BadgeCheck className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
          <span className="truncate">
            Referred by <span className="font-medium">{pill.displayName}</span>
            {pill.percentOff ? (
              <span className="text-[color:var(--ink-muted)]"> · {pill.percentOff}% off your subscription</span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          onClick={remove}
          aria-label="Remove referral code"
          className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mb-5">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label="Referral or promo code"
              value={draft}
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="MIKE20"
            />
          </div>
          <Button type="button" onClick={submitDraft} loading={checking}>
            Apply
          </Button>
        </div>
        {editError && <p className="mt-1.5 text-[11.5px] text-rose-700">{editError}</p>}
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setEditError(null);
          }}
          className="mt-1.5 min-h-[28px] text-[11.5px] text-[color:var(--ink-faint)] underline underline-offset-2 hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mb-5 min-h-11 text-left text-[12.5px] text-[color:var(--ink-muted)] underline decoration-[color:var(--ink-line)] underline-offset-[3px] hover:text-[color:var(--ink)]"
    >
      Have a referral or promo code?
    </button>
  );
}
