"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Plus, X, Globe, Eye, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";
import { LogoDropzone } from "@/components/company/LogoDropzone";
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
const TITLE_LIMIT = 80;
const SUBTITLE_LIMIT = 180;

export function LandingBuilderV3({ org }: { org: OrgLanding }) {
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

  function addService(value?: string) {
    const v = (value ?? serviceDraft).trim();
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
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_480px] gap-8">
      {/* Editor column */}
      <div className="space-y-6">
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
            description="When on, your customizations appear on the public form. When off, the form falls back to JobFlex defaults."
          />
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Hero</CardTitle>
              <CardSubtitle>The first thing a prospect reads.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_LIMIT))}
                placeholder="A premium roof in 7 days, guaranteed."
              />
              <div className="mt-1 flex justify-end">
                <span className="text-[10px] text-[color:var(--ink-muted)] tabular">
                  {title.length}/{TITLE_LIMIT}
                </span>
              </div>
            </div>
            <div>
              <Textarea
                label="Subtitle"
                rows={2}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value.slice(0, SUBTITLE_LIMIT))}
                placeholder="Family-owned. Licensed in 4 states. Free same-week quotes."
              />
              <div className="mt-1 flex justify-end">
                <span className="text-[10px] text-[color:var(--ink-muted)] tabular">
                  {subtitle.length}/{SUBTITLE_LIMIT}
                </span>
              </div>
            </div>
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
              <CardSubtitle>
                Chips appear under the hero. Used to filter inbound leads.
              </CardSubtitle>
            </div>
            <Badge tone="neutral">{services.length}</Badge>
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
              onClick={() => addService()}
            >
              Add
            </Button>
          </div>
          {services.length === 0 ? (
            <div className="mt-4 paper-card !shadow-none p-4 text-[12px] leading-relaxed text-[color:var(--ink-muted)]">
              <div className="quiet-caps mb-2">Suggested</div>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_SERVICES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => addService(d)}
                    className="inline-flex items-center h-7 px-3 rounded-full hairline bg-white/60 text-[11px] font-medium text-[color:var(--ink-soft)] hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent)] transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5 mr-1" />
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-1.5">
              <AnimatePresence>
                {services.map((s) => (
                  <motion.span
                    key={s}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="inline-flex items-center gap-1.5 h-7 pl-3 pr-1.5 rounded-full hairline bg-white/60 text-[12px]"
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

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy} icon={<Save className="h-3.5 w-3.5" />}>
            Save landing
          </Button>
          <a
            href="/homeowners"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--r-md)] hairline text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:bg-black/[0.04]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open public form
          </a>
        </div>
      </div>

      {/* Sticky preview column */}
      <div className="xl:sticky xl:top-10 self-start">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="quiet-caps inline-flex items-center gap-2">
            <Eye className="h-3 w-3" /> Live preview
          </div>
          {enabled ? (
            <Badge tone="success" dot>
              Public
            </Badge>
          ) : (
            <Badge tone="neutral">Hidden</Badge>
          )}
        </div>

        {/* Browser-chrome frame for context */}
        <div className="rounded-[var(--r-md)] overflow-hidden hairline bg-white shadow-sm">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[color:var(--ink-line)] bg-[color:var(--paper-muted,#f7f5f1)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#fcb6b6]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#fbe39a]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#a8e1b8]" />
            <span className="flex-1" />
            <span className="text-[10px] font-mono text-[color:var(--ink-muted)] tabular">
              jobflex.com/homeowners
            </span>
          </div>

          <div
            className="relative h-[200px] flex items-end p-6"
            style={{
              backgroundImage: heroImage
                ? `linear-gradient(0deg, rgba(17,17,19,0.62), rgba(17,17,19,0.10)), url(${heroImage})`
                : `linear-gradient(135deg, ${accent}AA, ${accent}55)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div>
              <div className="text-[10px] tracking-[0.14em] uppercase text-white/85 font-medium">
                {org.name}
              </div>
              <div className="font-display text-[22px] tracking-[-0.015em] text-white mt-1 leading-tight">
                {title || "Get a free quote in 24 hours"}
              </div>
              {subtitle && (
                <div className="text-[12px] text-white/90 mt-1.5 leading-snug max-w-[420px]">
                  {subtitle.length > 120 ? subtitle.slice(0, 120) + "…" : subtitle}
                </div>
              )}
            </div>
          </div>

          <div className="p-5">
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
            <div className="mt-5 paper-card !shadow-none p-4">
              <div className="text-[10.5px] text-[color:var(--ink-muted)]">Name</div>
              <div className="h-8 mt-1 rounded-[var(--r-sm)] bg-black/[0.04]" />
              <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-3">Phone</div>
              <div className="h-8 mt-1 rounded-[var(--r-sm)] bg-black/[0.04]" />
              <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-3">Project</div>
              <div className="h-8 mt-1 rounded-[var(--r-sm)] bg-black/[0.04]" />
              <button
                type="button"
                disabled
                className="mt-4 w-full h-9 rounded-[var(--r-sm)] text-[12px] font-medium text-white opacity-90"
                style={{ background: accent }}
              >
                Request quote
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed px-1">
          Save to publish. The form at <code className="font-mono">/homeowners</code> reads these
          fields when public profile is on.
        </p>
      </div>
    </div>
  );
}
