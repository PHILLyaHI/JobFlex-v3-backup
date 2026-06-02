"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Plus, X, Globe, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";
import { LogoDropzone } from "./LogoDropzone";
import { updateLanding } from "@/actions/company";

interface OrgLanding {
  id: string;
  name: string;
  primaryColor: string | null;
  publicProfileEnabled: boolean;
  landingHeroTitle: string | null;
  landingHeroSubtitle: string | null;
  heroImageUrl: string | null;
  servicesJson: string | null;
}

const DEFAULT_SERVICES = ["Roofing", "Kitchen", "Fencing", "Decking"];

export function LandingBuilder({ org }: { org: OrgLanding }) {
  const router = useRouter();
  const initialServices: string[] = React.useMemo(() => {
    if (!org.servicesJson) return [];
    try {
      const parsed = JSON.parse(org.servicesJson);
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  }, [org.servicesJson]);

  const [enabled, setEnabled] = React.useState(org.publicProfileEnabled);
  const [title, setTitle] = React.useState(org.landingHeroTitle ?? "");
  const [subtitle, setSubtitle] = React.useState(org.landingHeroSubtitle ?? "");
  const [heroImage, setHeroImage] = React.useState<string | null>(org.heroImageUrl);
  const [services, setServices] = React.useState<string[]>(initialServices);
  const [serviceDraft, setServiceDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function addService() {
    const v = serviceDraft.trim();
    if (!v) return;
    if (services.includes(v)) {
      toast.error("Already added");
      return;
    }
    setServices([...services, v]);
    setServiceDraft("");
  }

  function removeService(s: string) {
    setServices(services.filter((x) => x !== s));
  }

  async function save() {
    setBusy(true);
    try {
      await updateLanding({
        publicProfileEnabled: enabled,
        landingHeroTitle: title || null,
        landingHeroSubtitle: subtitle || null,
        heroImageUrl: heroImage,
        services,
      });
      toast.success("Landing saved");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  const accent = org.primaryColor ?? "#1F7A52";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-5">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Public profile</CardTitle>
              <CardSubtitle>
                Drives the homeowner request form at{" "}
                <code className="font-mono text-[11px]">/homeowners</code>.
              </CardSubtitle>
            </div>
            <Globe className="h-4 w-4 text-[color:var(--ink-muted)]" />
          </CardHeader>
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Publish to homeowner network"
            description="When on, your customizations below appear on the public form. When off, the form falls back to JobFlex defaults."
          />
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Hero</CardTitle>
              <CardSubtitle>The first thing a prospect reads.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A premium roof in 7 days, guaranteed."
            />
            <Textarea
              label="Subtitle"
              rows={2}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Family-owned. Licensed in 4 states. Free same-week quotes for the rest of the season."
            />
            <LogoDropzone
              label="Hero image"
              hint="A wide shot of your best work · 1600×600+"
              aspect="wide"
              value={heroImage}
              onChange={setHeroImage}
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Services offered</CardTitle>
              <CardSubtitle>Chips appear under the hero. Used to filter inbound leads.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              value={serviceDraft}
              onChange={(e) => setServiceDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addService();
                }
              }}
              placeholder="Roofing, Kitchen, Fencing…"
            />
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="h-3 w-3" />}
              onClick={addService}
            >
              Add
            </Button>
          </div>
          {services.length === 0 ? (
            <div className="mt-4 paper-card !shadow-none p-3 text-[11px] text-[color:var(--ink-muted)]">
              No services yet. Add a few — common ones are{" "}
              {DEFAULT_SERVICES.map((d, i) => (
                <span key={d}>
                  <button
                    type="button"
                    onClick={() => setServices([...services, d])}
                    className="text-[color:var(--accent)] hover:underline"
                  >
                    {d}
                  </button>
                  {i < DEFAULT_SERVICES.length - 1 ? ", " : "."}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <AnimatePresence>
                {services.map((s) => (
                  <motion.span
                    key={s}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="inline-flex items-center gap-1.5 h-7 pl-3 pr-1.5 rounded-full hairline bg-white/60 dark:bg-white/[0.04] text-[12px]"
                  >
                    <span className="text-[color:var(--ink-soft)]">{s}</span>
                    <button
                      type="button"
                      onClick={() => removeService(s)}
                      aria-label={`Remove ${s}`}
                      className="h-4 w-4 grid place-items-center rounded-full text-[color:var(--ink-muted)] hover:text-rose-700"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          )}
        </Card>

        <div className="flex gap-2">
          <Button onClick={save} loading={busy} icon={<Save className="h-3.5 w-3.5" />}>
            Save landing
          </Button>
          <a
            href="/homeowners"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--r-md)] hairline text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:bg-black/[0.04]"
          >
            <Eye className="h-3.5 w-3.5" />
            View public form
          </a>
        </div>
      </div>

      {/* Live preview */}
      <Card className="lg:sticky lg:top-24 self-start">
        <CardHeader>
          <div>
            <CardTitle>Preview</CardTitle>
            <CardSubtitle>How the public form will look right now.</CardSubtitle>
          </div>
          {enabled ? (
            <Badge tone="success" dot>
              Public
            </Badge>
          ) : (
            <Badge tone="neutral">Hidden</Badge>
          )}
        </CardHeader>
        <div
          className="rounded-[var(--r-md)] overflow-hidden hairline relative"
          style={{ background: "#fff" }}
        >
          <div
            className="relative h-[160px] flex items-end p-5"
            style={{
              backgroundImage: heroImage
                ? `linear-gradient(0deg, rgba(17,17,19,0.55), rgba(17,17,19,0.15)), url(${heroImage})`
                : `linear-gradient(135deg, ${accent}AA, ${accent}66)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div>
              <div className="text-[10px] tracking-[0.14em] uppercase text-white/80 font-medium">
                {org.name}
              </div>
              <div className="font-display text-[20px] tracking-[-0.015em] text-white mt-1 leading-tight">
                {title || "Get a free quote in 24 hours"}
              </div>
              {subtitle && (
                <div className="text-[11.5px] text-white/85 mt-1 leading-snug">
                  {subtitle.length > 100 ? subtitle.slice(0, 100) + "…" : subtitle}
                </div>
              )}
            </div>
          </div>
          <div className="p-4">
            <div className="quiet-caps mb-2">Services</div>
            <div className="flex flex-wrap gap-1.5">
              {(services.length ? services : DEFAULT_SERVICES).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center h-6 px-2.5 rounded-full text-[10.5px] font-medium hairline"
                  style={{
                    color: accent,
                    background: `${accent}15`,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="mt-4 paper-card !shadow-none p-3">
              <div className="text-[10.5px] text-[color:var(--ink-muted)]">Name</div>
              <div className="h-7 mt-1 rounded-[var(--r-sm)] bg-black/[0.04]" />
              <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-2.5">Phone</div>
              <div className="h-7 mt-1 rounded-[var(--r-sm)] bg-black/[0.04]" />
              <button
                type="button"
                disabled
                className="mt-3 w-full h-8 rounded-[var(--r-sm)] text-[12px] font-medium text-white opacity-90"
                style={{ background: accent }}
              >
                Request quote
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
          Save to publish. The form at <code className="font-mono">/homeowners</code> reads these
          fields when public profile is on.
        </p>
      </Card>
    </div>
  );
}
