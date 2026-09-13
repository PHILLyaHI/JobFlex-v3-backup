"use client";

// An isolated comparison surface. The three cards receive the same takeoff
// and the existing estimate/proposal actions; each keeps its own draft state.
// Claude's live estimator and comparison switch are deliberately untouched.
import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { nanoid } from "nanoid";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { estimateRoof, convertRoofEstimateToProposal } from "@/actions/roofEstimator";
import { toast } from "@/components/ui/Toast";
import { ensureWithinLimit, reportPlanLimit, reportPlanLimitResult } from "@/stores/usePlanLimitStore";
import { EstimateLinesTable, type EditableLine } from "../roof-estimator-blueprint/estimate-lines-table";
import type { BuildEstimateCardProps, BuildMode } from "../roof-estimator-blueprint/build-estimate-card";
import type { RoofFacts, RoofPackage, RoofPackageSpec } from "@/lib/roofPackage/takeoff";
import "../dashboard-blueprint/blueprint-global.css";
import styles from "./comparison.module.css";

const CARDS = {
  a: dynamic<BuildEstimateCardProps>(() => import("./impeccable-card"), { ssr: false }),
  b: dynamic<BuildEstimateCardProps>(() => import("./frontend-card"), { ssr: false }),
  c: dynamic<BuildEstimateCardProps>(() => import("./independent-card"), { ssr: false }),
};
const LABELS = { a: "Impeccable", b: "Frontend design", c: "Independent" };
type Design = keyof typeof CARDS;
type Condition = "entered" | "missing-pitch" | "empty" | "recon";
const PITCHES = ["2/12", "3/12", "4/12", "5/12", "6/12", "7/12", "8/12", "9/12", "10/12", "12/12"];
const WASTES = [8, 10, 12, 15];
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
type Draft = { title: string; materials: EditableLine[]; labor: EditableLine[]; assumptions: string[] };
const EMPTY: Draft = { title: "", materials: [], labor: [], assumptions: [] };

export function RoofCardComparison() {
  const params = useSearchParams();
  const query = params.get("design");
  const selected: Design = query === "b" || query === "c" ? query : "a";
  const [squaresText, setSquaresText] = React.useState("24");
  const [pitch, setPitch] = React.useState("6/12");
  const [condition, setCondition] = React.useState<Condition>("entered");
  const squares = Number(squaresText);
  const validSquares = squaresText.trim() !== "" && Number.isFinite(squares) && squares >= 0;
  const facts: RoofFacts | null = condition === "empty" || !validSquares ? null : {
    squares, squaresBasis: condition === "recon" ? "estimated" : "entered",
    pitchFamilies: condition === "missing-pitch" ? [] : [{ pitch12: Number(pitch.split("/")[0]), share: 1 }],
    pitchBasis: condition === "missing-pitch" ? null : "entered",
    perimeterFt: null, footprintSqft: null, chimney: null,
    rooftopAcCount: null, shape: null, facetCount: null,
  };
  function selectDesign(design: Design) {
    const url = new URL(window.location.href);
    url.searchParams.set("design", design);
    window.history.replaceState(null, "", url);
  }
  return (
    <main className={`${styles.page} jf-blueprint`}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Codex · Astra / Extra high</span><h1>Roof card comparison</h1></div>
        <a className={styles.back} href="/dashboard/roof-estimator"><ArrowLeft size={16} /> Estimator</a>
      </header>
      <nav className={styles.designs} aria-label="Compare card designs">
        {(Object.keys(CARDS) as Design[]).map((key) => (
          <button key={key} type="button" aria-pressed={selected === key} onClick={() => selectDesign(key)}>
            <span className={styles.letter}>{key.toUpperCase()}</span><span>{LABELS[key]}</span>
          </button>
        ))}
      </nav>
      <details className={styles.takeoff}>
        <summary><span><SlidersHorizontal size={16} /> Shared takeoff</span><span>{validSquares ? squares.toFixed(1) : "—"} sq · {pitch}<span className={styles.edit}>Edit</span></span></summary>
        <div className={styles.controls}>
          <label>Roof squares<input aria-label="Shared roof squares" type="number" min="0" step="0.1" inputMode="decimal" value={squaresText} onChange={(event) => setSquaresText(event.target.value)} /></label>
          <label>Pitch<span className="bp-sel"><select className="bp-sel-in" aria-label="Shared roof pitch" value={pitch} onChange={(event) => setPitch(event.target.value)}>{PITCHES.map((item) => <option key={item}>{item}</option>)}</select></span></label>
          <label>Measurement state<span className="bp-sel"><select className="bp-sel-in" value={condition} onChange={(event) => setCondition(event.target.value as Condition)}><option value="entered">Entered takeoff</option><option value="missing-pitch">Pitch needed</option><option value="empty">No measurement</option><option value="recon">Aerial preview</option></select></span></label>
          <p>Comparison starts with 24 entered squares. Change the takeoff to check another roof.</p>
        </div>
      </details>
      {(Object.keys(CARDS) as Design[]).map((key) => (
        <div key={key} hidden={selected !== key} data-codex-design={key}>
          <CardSession design={key} facts={facts} pitch={pitch} condition={condition} />
        </div>
      ))}
    </main>
  );
}

function CardSession({ design, facts, pitch, condition }: { design: Design; facts: RoofFacts | null; pitch: string; condition: Condition }) {
  const router = useRouter();
  const Card = CARDS[design];
  const outputRef = React.useRef<HTMLDivElement>(null);
  const [buildMode, setBuildMode] = React.useState<BuildMode>("package");
  const [waste, setWaste] = React.useState(12);
  const [enteredPitch, setEnteredPitch] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const roofKey = `${facts?.squares ?? "none"}:${pitch}:${condition}`;
  const [seenRoof, setSeenRoof] = React.useState(roofKey);
  if (seenRoof !== roofKey) {
    setSeenRoof(roofKey);
    setDraft(EMPTY);
    setEnteredPitch(null);
  }
  const isRecon = condition === "recon";
  const actualPitch = condition === "missing-pitch" ? enteredPitch : pitch;
  const actualFacts = facts && actualPitch ? { ...facts, pitchFamilies: [{ pitch12: Number(actualPitch.split("/")[0]), share: 1 }], pitchBasis: "entered" as const } : facts;
  const reason = isRecon ? "Run Instant measure to price this roof." : !facts || facts.squares <= 0 ? "Enter roof squares above zero." : !actualPitch ? "Select a pitch to price this roof." : undefined;
  const disabled = Boolean(reason) || busy || converting;
  const hasEstimate = draft.materials.length + draft.labor.length > 0;
  const total = [...draft.materials, ...draft.labor].reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const scrollToOutput = () => requestAnimationFrame(() => outputRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));

  function applyPackage(pkg: RoofPackage, spec: RoofPackageSpec) {
    const toLine = (line: RoofPackage["materials"][number]): EditableLine => ({ id: nanoid(6), name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, unit: line.unit, basis: line.basis });
    const next: Draft = { title: `${spec.systemName || "Roof"} · Entered takeoff`, materials: pkg.materials.map(toLine), labor: pkg.labor.map(toLine), assumptions: pkg.assumptions };
    setDraft(next);
    return next;
  }

  async function generate() {
    if (disabled || !facts || !actualPitch) return;
    setBusy(true);
    try {
      const result = await estimateRoof({ squares: facts.squares, pitch: actualPitch, pitchSource: "entered", wastePct: waste, measurementNotes: "Contractor-entered takeoff. Ridge, hip, valley and wall lengths are not measured; label estimated allowances in the assumptions." });
      if (!result.ok) { if (reportPlanLimitResult(result)) return; throw new Error(result.error); }
      setDraft({ title: result.data.title, materials: result.data.materials.map((line) => ({ ...line, id: nanoid(6) })), labor: result.data.labor.map((line) => ({ ...line, id: nanoid(6) })), assumptions: result.data.assumptions });
      if (result.disabled) toast.info("Sample estimate loaded", "Estimate generation is not configured.");
      scrollToOutput();
    } catch (error) { toast.error("Estimate failed", error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function convert(input: Draft) {
    if (disabled || input.materials.length + input.labor.length === 0) return;
    if (!(await ensureWithinLimit("proposalsCreated"))) return;
    setConverting(true);
    try {
      const strip = ({ name, quantity, unitPrice, unit }: EditableLine) => ({ name, quantity, unitPrice, unit });
      const result = await convertRoofEstimateToProposal({ title: input.title, scope: input.assumptions.join("\n"), materials: input.materials.map(strip), labor: input.labor.map(strip), assumptions: input.assumptions });
      toast.success("Proposal created");
      router.push(`/dashboard/proposals/${result.id}` as Parameters<typeof router.push>[0]);
    } catch (error) { if (!reportPlanLimit(error)) toast.error("Couldn’t convert", error instanceof Error ? error.message : String(error)); }
    finally { setConverting(false); }
  }

  return <Card isRecon={isRecon} squares={facts?.squares ?? null} manual={condition === "entered" && facts ? { squares: facts.squares, pitchLabel: pitch } : null}
    buildMode={buildMode} onBuildMode={setBuildMode} waste={waste} onWaste={setWaste} wasteOptions={WASTES}
    pitchEntry={condition === "missing-pitch" ? { value: enteredPitch, onChange: setEnteredPitch, options: PITCHES } : null}
    generate={{ busy, disabled, reason, onClick: () => void generate() }} facts={actualFacts} builderDisabled={disabled} converting={converting}
    onBuild={(pkg, spec) => { if (!disabled) { applyPackage(pkg, spec); scrollToOutput(); } }}
    onConvert={(pkg, spec) => { if (!disabled) void convert(applyPackage(pkg, spec)); }} hasEstimate={hasEstimate}
    output={hasEstimate ? <div ref={outputRef} className={styles.output}>
      <h2>Review estimate</h2>
      <EstimateLinesTable title="Materials" rows={draft.materials} disabled={disabled} onChange={(materials) => setDraft((value) => ({ ...value, materials }))} addLabel="Add material" />
      <EstimateLinesTable title="Labor" rows={draft.labor} disabled={disabled} onChange={(labor) => setDraft((value) => ({ ...value, labor }))} addLabel="Add labor" />
      <details className={styles.assumptions}><summary>Assumptions · {draft.assumptions.length}</summary><ul>{draft.assumptions.map((text, index) => <li key={index}>{text}</li>)}</ul></details>
      <div className={styles.result}><div><span>Estimate total</span><strong>{money(total)}</strong></div><button type="button" disabled={disabled} onClick={() => void convert(draft)}>{converting ? "Creating…" : "Convert to proposal"}</button></div>
    </div> : null}
  />;
}
