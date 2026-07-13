"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { Toggle } from "@/components/settings/Toggle";
import { updateLeadProfile } from "@/actions/company";
import { TRADE_TYPES, type TradeType } from "@/lib/tradeTypes";

interface LeadProfile {
  address: string | null;
  phone: string | null;
  tradeTypes: TradeType[];
  leadOffersEnabled: boolean;
  geocoded: boolean;
}

export function LeadProfileForm({ profile }: { profile: LeadProfile }) {
  const router = useRouter();
  const [address, setAddress] = React.useState(profile.address ?? "");
  const [phone, setPhone] = React.useState(profile.phone ?? "");
  const [trades, setTrades] = React.useState<TradeType[]>(profile.tradeTypes);
  const [enabled, setEnabled] = React.useState(profile.leadOffersEnabled);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const firstRun = React.useRef(true);

  function toggleTrade(t: TradeType) {
    setTrades((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  // Debounced autosave, matching BrandingForm. The action re-geocodes only
  // when the saved address actually differs from what's in the DB.
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        await updateLeadProfile({
          address: address.trim() || null,
          phone: phone.trim() || null,
          tradeTypes: trades,
          leadOffersEnabled: enabled,
        });
        setStatus("saved");
        router.refresh();
      } catch (err: unknown) {
        setStatus("error");
        toast.error("Couldn't save", err instanceof Error ? err.message : undefined);
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, phone, trades, enabled]);

  const complete = profile.geocoded && trades.length > 0;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Lead matching</CardTitle>
          <CardSubtitle>
            Homeowner leads from JobFlex are routed by trade, distance, and rating.
          </CardSubtitle>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium leading-none ${
            complete
              ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
              : "bg-[color:var(--paper-deep)] text-[color:var(--ink-muted)]"
          }`}
        >
          {complete ? "Receiving leads" : "Profile incomplete"}
        </span>
      </CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          className="md:col-span-2"
          label="Business address"
          autoComplete="street-address"
          placeholder="Street, city, state, zip"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Input
          label="Phone for lead alerts"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {!profile.geocoded && address.trim() && (
        <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--ink-muted)]">
          We couldn&apos;t pin this address on the map yet — leads are matched by distance, so
          double-check the street, city, and zip.
        </p>
      )}

      <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
        <div className="quiet-caps mb-2">Trades you take</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Trades you take">
          {TRADE_TYPES.map((t) => {
            const on = trades.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTrade(t)}
                className={`min-h-[36px] rounded-full px-3.5 text-[12.5px] leading-none transition-colors border ${
                  on
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] font-medium"
                    : "border-[color:var(--ink-line)] bg-transparent text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-2 border-t border-[color:var(--ink-line)]">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Accept platform leads"
          description="Pause this to stop receiving homeowner lead offers without losing your profile."
        />
      </div>

      <div
        className="mt-2 flex justify-end text-[11px] text-[color:var(--ink-muted)] tabular"
        aria-live="polite"
      >
        {status === "saving" && <span>Saving…</span>}
        {status === "saved" && (
          <span className="text-[color:var(--accent-ink)]">All changes saved</span>
        )}
        {status === "error" && (
          <span className="text-[color:var(--rose)]">Save failed — retrying on next edit</span>
        )}
      </div>
    </Card>
  );
}
