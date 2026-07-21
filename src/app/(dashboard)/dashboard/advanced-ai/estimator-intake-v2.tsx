"use client";
import * as React from "react";
import { Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { StyledSelect, type StyledSelectOption } from "@/components/ui/StyledSelect";
import { ProjectTypePicker, type ProjectType } from "@/components/estimator/ProjectTypePicker";
import { PlacesAutocomplete } from "@/components/estimator/roof/PlacesAutocomplete";
import { US_STATES, parseCityState, formatCityState } from "@/lib/usStates";

// State code as the compact primary label (matches the closed field's narrow
// width) with the full name as the searchable sublabel.
const STATE_OPTIONS: StyledSelectOption[] = US_STATES.map((s) => ({
  id: s.code,
  label: s.code,
  sublabel: s.name,
}));

// Clickable example briefs. Content (not chrome) — left verbatim so the AI gets a
// realistic, specific prompt when one is tapped.
const SAMPLE_PROMPTS = [
  "Replace 2400 sqft architectural shingle roof — tear-off, ridge vents, ice & water shield. Philadelphia, PA.",
  "Install 180 linear ft cedar privacy fence, 7ft tall, one gate, sloped yard.",
  "Full kitchen remodel — shaker cabs, quartz counters, island, mid-tier appliances.",
  "Replace 14 double-hung windows on a 2-story colonial. Energy Star rated.",
];

interface EstimatorIntakeV2Props {
  disabledBanner: boolean;
  projectType: ProjectType | null;
  onProjectType: (t: ProjectType) => void;
  location: string;
  onLocation: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  analyzing: boolean;
  generating: boolean;
  onGenerate: () => void;
}

/**
 * Estimator intake, v2 — the "Estimate Console".
 *
 * v1 stacked two flat editorial cards, which read as blended and ordinary. This
 * is one elevated panel with a confident Pressed-Sage masthead, a numbered
 * intake rail, and a grounded action bar. Bolder and more memorable, but built
 * entirely from frozen tokens (accent / accent-ink / ink ramp / paper-deep /
 * --shadow-md) so it still reads as the same shop. No "approximate size" field.
 */
export function EstimatorIntakeV2({
  disabledBanner,
  projectType,
  onProjectType,
  location,
  onLocation,
  description,
  onDescription,
  analyzing,
  generating,
  onGenerate,
}: EstimatorIntakeV2Props) {
  const canGenerate = !!projectType && !!description.trim() && !generating;

  // The location step feeds one free-text string upstream (`location`) that the AI
  // reads for regional pricing. Two inputs compose it: a free address/city field
  // and a State picker. When the address field resolves to a full picked address
  // it already carries the state, so we emit it verbatim; otherwise we stitch
  // "City, ST" from the two fields.
  const [locText, setLocText] = React.useState(() => parseCityState(location).city);
  const [stateCode, setStateCode] = React.useState(() => parseCityState(location).state);
  const resolvedRef = React.useRef(false); // locText is a complete picked address
  const lastEmitted = React.useRef(location);

  // Re-sync from outside (e.g. the AI's typo-corrected location) without
  // clobbering what the user is mid-typing.
  React.useEffect(() => {
    if (location !== lastEmitted.current) {
      const parsed = parseCityState(location);
      setLocText(parsed.city);
      setStateCode(parsed.state);
      resolvedRef.current = false;
      lastEmitted.current = location;
    }
  }, [location]);

  function emit(text: string, state: string, resolved: boolean) {
    const combined = resolved ? text : formatCityState(text, state);
    lastEmitted.current = combined;
    onLocation(combined);
  }

  return (
    <div className="max-w-3xl mx-auto">
      {disabledBanner && (
        <div className="paper-card p-4 mb-5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
          <div className="text-[12px] leading-relaxed">
            <div className="font-medium text-[color:var(--ink)]">OpenAI isn&apos;t configured.</div>
            <div className="text-[color:var(--ink-muted)] mt-0.5">
              Add <code className="font-mono text-[11px]">OPENAI_API_KEY</code> to your{" "}
              <code className="font-mono text-[11px]">.env.local</code>. You&apos;ll still get a
              realistic sample estimate to tune.
            </div>
          </div>
        </div>
      )}

      <div className="paper-card overflow-hidden !shadow-[var(--shadow-md)]">
        {/* Masthead — the pop. A confident accent block, not another pale card. */}
        <div className="bg-[color:var(--accent)] px-6 py-6 text-white sm:px-8">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--r-md)] bg-[color:var(--accent-ink)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                Smart estimate · AI
              </div>
              <h2 className="font-display text-[22px] leading-[1.1] tracking-[-0.015em] sm:text-[26px]">
                Describe the job. We price the rest.
              </h2>
            </div>
          </div>
        </div>

        {/* Numbered intake rail */}
        <div className="space-y-7 p-6 sm:p-8">
          <Step n={1} title="Project type" hint="Shapes the pricing model.">
            <ProjectTypePicker value={projectType} onChange={onProjectType} />
          </Step>

          <Step n={2} title="Location" hint="Regional pricing. City typos auto-correct before we price.">
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <PlacesAutocomplete
                  value={locText}
                  placeholder="Search address or city…"
                  // Softer than the default 3px sage ring — this field is the step's
                  // focal point and the standard ring read too loud on it.
                  inputWrapperClassName="focus-within:shadow-[0_0_0_2px_rgba(31,122,82,0.10)]"
                  onTextChange={(v) => {
                    resolvedRef.current = false;
                    setLocText(v);
                    emit(v, stateCode, false);
                  }}
                  onPick={(a) => {
                    // Picking a real address fills the field and auto-applies its
                    // state to the State picker beside it.
                    const nextText = a.formatted || a.city || locText;
                    const nextState = a.state || stateCode;
                    resolvedRef.current = Boolean(a.formatted);
                    setLocText(nextText);
                    setStateCode(nextState);
                    emit(nextText, nextState, resolvedRef.current);
                  }}
                />
              </div>
              <div className="w-32 shrink-0">
                <StyledSelect
                  align="right"
                  options={STATE_OPTIONS}
                  value={stateCode}
                  onChange={(v) => {
                    setStateCode(v);
                    // A resolved full address already carries its own state, so keep
                    // emitting it verbatim; otherwise recompose "City, ST".
                    if (!resolvedRef.current) emit(locText, v, false);
                  }}
                  placeholder="State"
                  searchPlaceholder="Find a state…"
                  noneLabel="Any state"
                />
              </div>
            </div>
          </Step>

          <Step n={3} title="The brief" hint="The more specific, the tighter the estimate.">
            <Textarea
              rows={7}
              placeholder="Materials, finishes, conditions, access, square footage if you have it…"
              value={description}
              onChange={(e) => onDescription(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onDescription(p)}
                  className="rounded-full px-3 py-1 text-[11px] hairline text-[color:var(--ink-muted)] transition-colors hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--accent-ink)]"
                >
                  {p.slice(0, 52)}…
                </button>
              ))}
            </div>
          </Step>
        </div>

        {/* Action bar — tinted and grounded, with a large primary CTA. */}
        <div className="flex items-center justify-between gap-4 border-t border-[color:var(--ink-line)] bg-[color:var(--paper-deep)] px-6 py-4 sm:px-8">
          <p className="hidden text-[11px] leading-relaxed text-[color:var(--ink-muted)] sm:block">
            AI reads your brief, prices live materials and labor, and shows the math.
          </p>
          <Button
            size="lg"
            loading={analyzing}
            disabled={!canGenerate}
            icon={<Sparkles className="h-4 w-4" />}
            onClick={onGenerate}
          >
            {analyzing ? "Reading your brief…" : "Generate estimate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// One step on the intake rail: an accent numeral, a heading, and indented content
// that lines up under the heading so the numerals read as a guided column.
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] font-display text-[12px] font-bold tabular text-[color:var(--accent-ink)]">
          {n}
        </span>
        <div>
          <h3 className="font-display text-[15px] tracking-[-0.01em] text-[color:var(--ink)]">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-[color:var(--ink-muted)]">{hint}</p>}
        </div>
      </div>
      <div className="pl-9">{children}</div>
    </section>
  );
}
