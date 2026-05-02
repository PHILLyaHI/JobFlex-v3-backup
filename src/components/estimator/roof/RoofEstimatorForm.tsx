"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Sparkles, Settings, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EstimatorBreakdown, type EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import { EstimatorSummary } from "@/components/estimator/EstimatorSummary";
import { toast } from "@/components/ui/Toast";
import { nanoid } from "nanoid";
import { estimateRoof, convertRoofEstimateToProposal } from "@/actions/roofEstimator";

interface Props {
  mapsEnabled: boolean;
  aiEnabled: boolean;
}

const PITCHES = ["3/12", "4/12", "5/12", "6/12", "7/12", "8/12", "10/12", "12/12"];
const WASTES = ["8%", "10%", "12%", "15%"];

export function RoofEstimatorForm({ mapsEnabled, aiEnabled }: Props) {
  const router = useRouter();
  const [address, setAddress] = React.useState("");
  const [mapUrl, setMapUrl] = React.useState<string | null>(null);
  const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [pitch, setPitch] = React.useState("6/12");
  const [squares, setSquares] = React.useState("24");
  const [waste, setWaste] = React.useState("10%");
  const [busy, setBusy] = React.useState(false);
  const [materials, setMaterials] = React.useState<EstimateLine[]>([]);
  const [labor, setLabor] = React.useState<EstimateLine[]>([]);
  const [assumptions, setAssumptions] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [convertBusy, setConvertBusy] = React.useState(false);

  async function lookup() {
    if (!address.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/maps/lookup?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Lookup failed");
      if (data?.disabled) {
        toast.info("Maps disabled", "Add GOOGLE_MAPS_API_KEY to enable satellite preview.");
        return;
      }
      setMapUrl(data.mapUrl ?? null);
      if (data.lat && data.lng) setCoords({ lat: data.lat, lng: data.lng });
    } catch (err: any) {
      toast.error("Couldn't look up", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await estimateRoof({
        address: address || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        pitch,
        squares: Number(squares),
        wastePct: Number(waste.replace("%", "")),
      });
      if (!res.ok) throw new Error(res.error);
      if (res.disabled) toast.info("AI disabled · sample result loaded");
      setTitle(res.data.title);
      setAssumptions(res.data.assumptions);
      setMaterials(
        res.data.materials.map((m) => ({
          id: nanoid(6),
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
        })),
      );
      setLabor(
        res.data.labor.map((m) => ({
          id: nanoid(6),
          name: m.name,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          unit: m.unit,
        })),
      );
      toast.success("Roof estimate ready");
    } catch (err: any) {
      toast.error("Generation failed", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setConvertBusy(true);
    try {
      const res = await convertRoofEstimateToProposal({
        title: title || `Roof · ${address || "site"}`,
        scope: assumptions.join("\n"),
        materials: materials.map(({ id: _, ...rest }) => rest),
        labor: labor.map(({ id: _, ...rest }) => rest),
        assumptions,
      });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${res.id}` as any);
    } catch (err: any) {
      toast.error("Couldn't convert", err?.message);
      setConvertBusy(false);
    }
  }

  const hasResult = materials.length > 0 || labor.length > 0;
  const materialsTotal = materials.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const laborTotal = labor.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Address</CardTitle>
              <CardSubtitle>We'll pull a satellite preview to eyeball the footprint.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              prefix={<MapPin className="h-3.5 w-3.5" />}
              placeholder="118 Cedar Ave, Philadelphia, PA"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[color:var(--ink-muted)]">
                {mapsEnabled ? "Using Google Maps static imagery" : "Maps disabled — manual only"}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={lookup}
                loading={busy}
                disabled={!address.trim() || !mapsEnabled}
              >
                Look up
              </Button>
            </div>
          </div>
        </Card>

        {mapsEnabled ? (
          <div className="paper-card p-0 overflow-hidden border-l-[3px] border-l-[color:var(--accent)]">
            <div className="px-5 pt-4">
              <div className="quiet-caps">Satellite preview</div>
              {coords && (
                <div className="text-[10px] text-[color:var(--ink-muted)] tabular mt-0.5">
                  {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                </div>
              )}
            </div>
            <div className="mt-3 aspect-[16/9] bg-black/[0.03]">
              {mapUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mapUrl} alt="Satellite" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-[color:var(--ink-faint)] text-[12px]">
                  Enter address + click Look up
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="paper-card p-6 flex items-center gap-3">
            <div className="h-9 w-9 rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] grid place-items-center text-[color:var(--accent)]">
              <Settings className="h-4 w-4" />
            </div>
            <div className="text-[12px] leading-relaxed">
              <div className="font-medium text-[color:var(--ink)]">Maps disabled</div>
              <div className="text-[color:var(--ink-muted)]">
                Set <code className="font-mono text-[11px]">GOOGLE_MAPS_API_KEY</code> to enable
                satellite preview. You can still generate estimates from dimensions.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dimensions */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Dimensions</CardTitle>
            <CardSubtitle>Roof specifics drive material quantities and labor hours.</CardSubtitle>
          </div>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Pitch" value={pitch} onChange={(e) => setPitch(e.target.value)}>
            {PITCHES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Input
            label="Squares (100 sqft)"
            type="number"
            value={squares}
            onChange={(e) => setSquares(e.target.value)}
            hint="1 square = 100 sqft"
          />
          <Select label="Waste factor" value={waste} onChange={(e) => setWaste(e.target.value)}>
            {WASTES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </Select>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            size="lg"
            loading={busy}
            onClick={generate}
            icon={<Sparkles className="h-4 w-4" />}
          >
            Generate roof estimate
          </Button>
        </div>
      </Card>

      {hasResult && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-5">
            <EstimatorBreakdown
              title="Materials"
              subtitle="Shingles, underlayment, flashing, fasteners"
              rows={materials}
              onChange={setMaterials}
            />
            <EstimatorBreakdown
              title="Labor"
              subtitle="Tear-off, install, cleanup"
              rows={labor}
              onChange={setLabor}
            />
          </div>
          <div className="lg:col-span-2">
            <EstimatorSummary
              materialsTotal={materialsTotal}
              laborTotal={laborTotal}
              assumptions={assumptions}
              onConvert={convert}
              onSave={async () => toast.info("Estimate saved locally — coming to dashboard next")}
              convertLoading={convertBusy}
            />
          </div>
        </div>
      )}
    </div>
  );
}
