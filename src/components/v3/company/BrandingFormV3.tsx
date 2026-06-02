"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Mail, Phone, Globe2, MapPin, Building2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { LogoDropzone } from "@/components/company/LogoDropzone";
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
  publicProfileEnabled: boolean;
}

const COLOR_PRESETS = [
  "#1F7A52", // pressroom indigo (default)
  "#0EA5E9", // sky
  "#059669", // emerald
  "#C89450", // amber-bronze
  "#E11D48", // rose
  "#7C3AED", // violet
  "#475569", // slate
  "#111113", // ink
];

export function BrandingFormV3({ org }: { org: Org }) {
  const router = useRouter();
  const [name, setName] = React.useState(org.name);
  const [phone, setPhone] = React.useState(org.phone ?? "");
  const [billingEmail, setBillingEmail] = React.useState(org.billingEmail ?? "");
  const [address, setAddress] = React.useState(org.address ?? "");
  const [website, setWebsite] = React.useState(org.website ?? "");
  const [primaryColor, setPrimaryColor] = React.useState(org.primaryColor ?? "#1F7A52");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(org.logoUrl);
  const [busy, setBusy] = React.useState(false);

  const dirty =
    name !== org.name ||
    (phone || null) !== org.phone ||
    (billingEmail || null) !== org.billingEmail ||
    (address || null) !== org.address ||
    (website || null) !== org.website ||
    primaryColor !== (org.primaryColor ?? "#1F7A52") ||
    logoUrl !== org.logoUrl;

  async function save() {
    setBusy(true);
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
      toast.success("Branding saved");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Brand snapshot — single confident hero strip */}
      <section
        className="paper-card relative overflow-hidden"
        style={{
          borderLeftWidth: 3,
          borderLeftStyle: "solid",
          borderLeftColor: primaryColor,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 100% 0%, ${primaryColor}14 0%, transparent 55%)`,
          }}
        />
        <div className="relative flex items-center gap-5 p-6">
          <div className="shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="h-16 w-16 rounded-[var(--r-md)] object-contain bg-white hairline"
              />
            ) : (
              <div
                className="h-16 w-16 rounded-[var(--r-md)] grid place-items-center font-display text-[28px] text-white"
                style={{ background: primaryColor }}
              >
                {(name || "JF").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="quiet-caps mb-1">Brand snapshot</div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-[28px] tracking-[-0.02em] leading-[1.05] text-[color:var(--ink)] truncate">
                {name || "Your company"}
              </h2>
              {org.publicProfileEnabled ? (
                <Badge tone="success" dot>
                  Public
                </Badge>
              ) : (
                <Badge tone="neutral">Private</Badge>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4 text-[12px] text-[color:var(--ink-muted)]">
              {website && (
                <span className="inline-flex items-center gap-1.5">
                  <Globe2 className="h-3 w-3" />
                  <span className="truncate max-w-[220px]">{website}</span>
                </span>
              )}
              {phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3 w-3" />
                  <span className="tabular">{phone}</span>
                </span>
              )}
              {billingEmail && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3 w-3" />
                  <span className="truncate max-w-[220px]">{billingEmail}</span>
                </span>
              )}
              {!website && !phone && !billingEmail && (
                <span className="italic">No contact details yet.</span>
              )}
            </div>
          </div>
          <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
            <div className="quiet-caps">Accent</div>
            <div
              className="h-8 w-20 rounded-[var(--r-sm)] hairline"
              style={{ background: primaryColor }}
              aria-label={`Brand color ${primaryColor}`}
            />
            <span className="font-mono text-[10.5px] tabular text-[color:var(--ink-muted)]">
              {primaryColor.toUpperCase()}
            </span>
          </div>
        </div>
      </section>

      {/* Identity + logo / preview, 2-col desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Identity</CardTitle>
                <CardSubtitle>How clients and teammates see you everywhere.</CardSubtitle>
              </div>
              <Building2 className="h-4 w-4 text-[color:var(--ink-muted)]" />
            </CardHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input
                label="Billing email"
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                placeholder="billing@yourcompany.com"
              />
              <Input
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-0100"
              />
              <Input
                label="Website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourcompany.com"
              />
              <div className="md:col-span-2 relative">
                <Input
                  label="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City, State"
                />
                <MapPin className="absolute right-3 top-[34px] h-3.5 w-3.5 text-[color:var(--ink-muted)] pointer-events-none" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Brand color</CardTitle>
                <CardSubtitle>
                  Used sparingly — emails, proposal accents, and the public form CTA.
                </CardSubtitle>
              </div>
            </CardHeader>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPrimaryColor(c)}
                  aria-label={`Pick color ${c}`}
                  aria-pressed={primaryColor === c}
                  className={`h-9 w-9 rounded-full transition-all hairline ${
                    primaryColor === c
                      ? "ring-2 ring-offset-2 ring-[color:var(--ink)] scale-105"
                      : "hover:scale-105"
                  }`}
                  style={{ background: c }}
                />
              ))}
              <div className="ml-2 w-px h-6 bg-[color:var(--ink-line)]" aria-hidden />
              <Input
                className="!w-[140px]"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="Hex color"
              />
            </div>
            <p className="mt-4 text-[11px] text-[color:var(--ink-muted)] leading-relaxed">
              Keep it to one strong accent. Pressroom Indigo (<code className="font-mono">#1F7A52</code>) is
              the system default — your color overrides it across every customer-facing surface.
            </p>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={save} loading={busy} icon={<Save className="h-3.5 w-3.5" />}>
              Save branding
            </Button>
            {dirty && (
              <span className="text-[11px] text-[color:var(--ink-muted)] tabular">
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Logo</CardTitle>
                <CardSubtitle>Square 256×256+ works best.</CardSubtitle>
              </div>
            </CardHeader>
            <LogoDropzone
              value={logoUrl}
              onChange={setLogoUrl}
              hint="PNG / SVG · up to 2 MB"
            />
            <p className="mt-3 text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
              Until Vercel Blob is configured, uploads are previewed inline as data URLs and saved
              to the org record. Add <code className="font-mono text-[10px]">BLOB_READ_WRITE_TOKEN</code> for
              object storage.
            </p>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Email preview</CardTitle>
                <CardSubtitle>Header that goes out with every proposal.</CardSubtitle>
              </div>
            </CardHeader>
            <div
              className="paper-card !shadow-none p-4 flex items-center gap-3"
              style={{
                borderLeftWidth: 3,
                borderLeftStyle: "solid",
                borderLeftColor: primaryColor,
              }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-9 w-9 rounded-[var(--r-sm)] object-contain bg-white hairline"
                />
              ) : (
                <div
                  className="h-9 w-9 rounded-[var(--r-sm)] grid place-items-center text-white font-display text-[16px]"
                  style={{ background: primaryColor }}
                >
                  {(name || "JF").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15px] tracking-[-0.01em] truncate">
                  {name || "Your company"}
                </div>
                <div className="text-[10.5px] text-[color:var(--ink-muted)] truncate">
                  {website || phone || billingEmail || "—"}
                </div>
              </div>
            </div>
            <div className="mt-3 paper-card !shadow-none p-3 text-[11px] leading-relaxed text-[color:var(--ink-soft)]">
              Hi Sam — your proposal is ready. Tap below to review and sign.
              <div
                className="mt-2 inline-flex items-center h-7 px-3 rounded-[var(--r-sm)] text-[11px] font-medium text-white"
                style={{ background: primaryColor }}
              >
                View proposal
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
