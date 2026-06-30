"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { LogoDropzone } from "./LogoDropzone";
import { updateBranding } from "@/actions/company";

interface Org {
  id: string;
  name: string;
  phone: string | null;
  billingEmail: string | null;
  address: string | null;
  website: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
}

const COLOR_PRESETS = [
  "#1F7A52", // sage (default)
  "#0EA5E9", // sky
  "#059669", // emerald
  "#C89450", // amber-bronze
  "#E11D48", // rose
  "#7C3AED", // violet
  "#475569", // slate
  "#111113", // ink
];

export function BrandingForm({ org }: { org: Org }) {
  const router = useRouter();
  const [name, setName] = React.useState(org.name);
  const [phone, setPhone] = React.useState(org.phone ?? "");
  const [billingEmail, setBillingEmail] = React.useState(org.billingEmail ?? "");
  const [address, setAddress] = React.useState(org.address ?? "");
  const [website, setWebsite] = React.useState(org.website ?? "");
  const [primaryColor, setPrimaryColor] = React.useState(org.primaryColor ?? "#1F7A52");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(org.logoUrl);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  // Skip the autosave on first mount (initial state already equals server state).
  const firstRun = React.useRef(true);

  // Debounced autosave — persists ~700ms after the last edit; no Save button.
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        await updateBranding({
          name,
          phone: phone || null,
          billingEmail: billingEmail || null,
          address: address || null,
          website: website || null,
          primaryColor,
          logoUrl,
        });
        setStatus("saved");
        router.refresh();
      } catch (err: any) {
        setStatus("error");
        toast.error("Couldn't save", err?.message);
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone, billingEmail, address, website, primaryColor, logoUrl]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Identity</CardTitle>
            <CardSubtitle>How clients and team members see you everywhere.</CardSubtitle>
          </div>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Billing email"
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <Input
            className="md:col-span-2"
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
          <div className="quiet-caps mb-2">Brand color</div>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPrimaryColor(c)}
                aria-label={`Pick color ${c}`}
                className={`h-8 w-8 rounded-full transition-all hairline ${
                  primaryColor === c ? "ring-2 ring-offset-2 ring-[color:var(--ink)]" : ""
                }`}
                style={{ background: c }}
              />
            ))}
            <Input
              className="!w-[120px]"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
          </div>
          <p className="mt-2 text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
            Used on outgoing emails, the public proposal page, and the homeowner request form
            (when public profile is on).
          </p>
        </div>
        <div
          className="mt-5 flex justify-end text-[11px] text-[color:var(--ink-muted)] tabular"
          aria-live="polite"
        >
          {status === "saving" && <span>Saving…</span>}
          {status === "saved" && <span className="text-[color:var(--accent-ink)]">All changes saved</span>}
          {status === "error" && (
            <span className="text-[color:var(--rose)]">Save failed — retrying on next edit</span>
          )}
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Logo</CardTitle>
              <CardSubtitle>Used on emails, proposals, and the portal.</CardSubtitle>
            </div>
          </CardHeader>
          <LogoDropzone value={logoUrl} onChange={setLogoUrl} hint="Square works best · 256×256+" />
          <p className="mt-3 text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
            Until Vercel Blob is configured, uploads are previewed inline as data URLs and
            persisted directly to the org record. Add{" "}
            <code className="font-mono text-[10px]">BLOB_READ_WRITE_TOKEN</code> for proper
            object storage.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Live preview</CardTitle>
              <CardSubtitle>Email header sample.</CardSubtitle>
            </div>
          </CardHeader>
          <div
            className="paper-card !shadow-none p-4 flex items-center gap-3"
            style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: primaryColor }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-8 w-8 rounded-[var(--r-sm)] object-contain bg-white hairline" />
            ) : (
              <div
                className="h-8 w-8 rounded-[var(--r-sm)] grid place-items-center text-white font-display text-[14px]"
                style={{ background: primaryColor }}
              >
                {(name || "JF").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-display text-[15px] tracking-[-0.01em] truncate">{name || "Your company"}</div>
              <div className="text-[10.5px] text-[color:var(--ink-muted)] truncate">
                {website || phone || billingEmail || "—"}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
