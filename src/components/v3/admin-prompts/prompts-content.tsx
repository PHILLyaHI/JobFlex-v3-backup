"use client";

// ADMIN · SMART PROPOSAL PROMPTS — /admin/prompts, blueprint.
//
// Every box shows the CURRENT text the estimate prompt carries — the saved
// change when there is one, the code default otherwise — with a chip saying
// which. Save stores an override (an empty box or the default text clears
// it), Reset deletes it, Discard drops the unsaved typing. The specialty
// card swaps its two boxes through getSpecialtyPromptDetail; the preview
// composes the exact prompt a brief would send, with every override
// applied, through composePromptPreview.
//
// Renders ONLY the shell's `.content` children, as a fragment, so the reveal
// cascade walks `.content > *`.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import {
  composePromptPreview,
  getSpecialtyPromptDetail,
  resetPromptOverride,
  savePromptOverride,
} from "@/actions/adminPrompts";
import { OVERRIDE_KEYS } from "@/lib/estimate/promptKeys";
import type { PromptPreview, PromptTextState, RemodelPartState, SpecialtyPromptDetail, SpecialtyRow } from "@/lib/estimate/promptAdmin";
import { Ic } from "@/components/v3/admin-overview/admin-ui";
import { useAdminMotion } from "@/components/v3/admin-overview/admin-motion";
import { kx } from "@/components/v3/admin-users/admin-kit";
import s from "@/components/v3/admin-overview/admin-shared.module.css";
import p from "./prompts.module.css";

function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** The chip every box wears: the default, or a saved change and when. */
function StateChip({ savedAt }: { savedAt: string | null }) {
  return savedAt ? (
    <span className={p.headRow}>
      <span className="chip ok">Customized</span>
      <span className={p.stamp}>saved {stamp(savedAt)}</span>
    </span>
  ) : (
    <span className={`chip ${s.chipMuted}`}>Default</span>
  );
}

/**
 * One editable text: the current value in a textarea, the state chip, the
 * character count, Discard / Show default / Reset / Save. Owns its own
 * state; a parent remounts it (key) when the text it edits changes.
 */
function TextBlock({
  block,
  title,
  sub,
  keyName,
  state,
  tall,
  legend,
  onChanged,
}: {
  block: string;
  title: string;
  sub: React.ReactNode;
  keyName: string;
  state: PromptTextState;
  tall?: boolean;
  legend?: React.ReactNode;
  /** After a save or a reset landed — the parent refreshes what it derives from the row. */
  onChanged?: () => void;
}) {
  const [saved, setSaved] = useState(state);
  const [text, setText] = useState(state.value);
  const [showDefault, setShowDefault] = useState(false);
  const [pending, start] = useTransition();
  const dirty = text.trim() !== saved.value.trim();
  const customized = saved.savedAt !== null;

  const save = () =>
    start(async () => {
      const res = await savePromptOverride({ key: keyName, body: text });
      if (!res.ok) {
        toast.error("Not saved", res.error);
        return;
      }
      const next: PromptTextState = res.customized
        ? { def: saved.def, value: text.trim(), savedAt: res.savedAt }
        : { def: saved.def, value: saved.def, savedAt: null };
      setSaved(next);
      setText(next.value);
      toast.success(res.customized ? "Saved" : "Back to the default", res.customized ? `${title} now runs on your text.` : `${title} matches the default, so it runs on the code.`);
      onChanged?.();
    });
  const reset = () =>
    start(async () => {
      const res = await resetPromptOverride(keyName);
      if (!res.ok) {
        toast.error("Not reset", res.error);
        return;
      }
      setSaved({ def: saved.def, value: saved.def, savedAt: null });
      setText(saved.def);
      setShowDefault(false);
      toast.success("Back to the default", `${title} runs on the code default.`);
      onChanged?.();
    });

  return (
    <div className="card" data-block={block} data-state={customized ? "customized" : "default"}>
      <div className="card-head">
        <div className="card-titles">
          <div className={`card-title ${p.headRow}`}>
            {title}
            <StateChip savedAt={saved.savedAt} />
          </div>
          <div className="card-sub">{sub}</div>
        </div>
      </div>
      <hr className="card-rule" />
      <div className={p.body}>
        {legend ? <div className={p.legend}>{legend}</div> : null}
        <textarea
          id={`p-${block}`}
          className={`${kx("in", "ta")} ${p.ta}${tall ? ` ${p.tall}` : ""}`}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          aria-label={title}
        />
        <div className={p.foot}>
          <span className={`${p.count}${dirty ? ` ${p.dirty}` : ""}`} data-count>
            {text.length.toLocaleString()} characters{dirty ? " · unsaved" : ""}
          </span>
          <span className={p.grow} />
          {customized ? (
            <button type="button" className="btn btn-sm btn-quiet" data-act="default" onClick={() => setShowDefault((v) => !v)}>
              {showDefault ? "Hide default" : "Show default"}
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-ghost" data-act="discard" disabled={!dirty || pending} onClick={() => setText(saved.value)}>
            Discard
          </button>
          {customized ? (
            <button type="button" className="btn btn-sm btn-ghost" data-act="reset" disabled={pending} onClick={reset}>
              <Ic id="i-undo" />
              Reset to default
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-primary" data-act="save" disabled={!dirty || pending} onClick={save}>
            <Ic id="i-check" />
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
        {showDefault ? (
          <pre className={`${p.pre} ${p.short}`} data-default>
            {saved.def}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function SpecialtyPicker({
  groups,
  rows,
  current,
  onPick,
  busy,
}: {
  groups: { id: string; label: string }[];
  rows: SpecialtyRow[];
  current: string;
  onPick: (id: string) => void;
  busy: boolean;
}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const shown = useMemo(
    () => rows.filter((r) => r.id === current || !q || r.name.toLowerCase().includes(q) || r.id.includes(q)),
    [rows, q, current],
  );
  const edited = rows.filter((r) => r.customized).length;
  return (
    <div className={p.pick}>
      <input
        id="p-filter"
        className={kx("in")}
        placeholder="Find a specialty…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Find a specialty"
      />
      <span className="bp-sel bp-sel--admin">
        <select id="p-specialty" className="bp-sel-in" value={current} disabled={busy} onChange={(e) => onPick(e.target.value)} aria-label="Specialty">
          {groups.map((g) => {
            const items = shown.filter((r) => r.group === g.id);
            return items.length ? (
              <optgroup key={g.id} label={g.label}>
                {items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.customized ? " · edited" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </span>
      <div className={p.desc} data-picker-note>
        {shown.length} of {rows.length} specialties{edited ? ` · ${edited} edited` : ""}
      </div>
    </div>
  );
}

export function AdminPromptsContent({
  master,
  system,
  rules,
  remodel,
  groups,
  specialties,
  initialDetail,
  initialPreview,
  sample,
  overrideCount,
}: {
  master: PromptTextState;
  system: PromptTextState;
  rules: PromptTextState;
  remodel: RemodelPartState[];
  groups: { id: string; label: string }[];
  specialties: SpecialtyRow[];
  initialDetail: SpecialtyPromptDetail;
  initialPreview: PromptPreview;
  sample: { description: string; location: string };
  overrideCount: number;
}) {
  useAdminMotion();
  const router = useRouter();

  const [detail, setDetail] = useState(initialDetail);
  const [loadingDetail, startDetail] = useTransition();
  const pick = (id: string) =>
    startDetail(async () => {
      const d = await getSpecialtyPromptDetail(id);
      if (d) setDetail(d);
      else toast.error("Not found", `No specialty "${id}".`);
    });
  // A saved or reset row changes the header count and the "· edited" marks
  // (server props — refresh re-reads them, state stays); a specialty row also
  // changes the block as sent, re-read through the detail.
  const changed = () => router.refresh();
  const [remodelKey, setRemodelKey] = useState<RemodelPartState["key"]>("read");
  const remodelPart = remodel.find((r) => r.key === remodelKey) ?? remodel[0];
  const specialtyChanged = () => {
    router.refresh();
    pick(detail.id);
  };

  const [desc, setDesc] = useState(sample.description);
  const [loc, setLoc] = useState(sample.location);
  const [spec, setSpec] = useState("");
  const [preview, setPreview] = useState(initialPreview);
  const [composing, startCompose] = useTransition();
  const compose = () =>
    startCompose(async () => {
      const res = await composePromptPreview({ description: desc, location: loc, specialtyId: spec || null });
      if (!res.ok) {
        toast.error("Couldn't compose", res.error);
        return;
      }
      setPreview(res.data);
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview.prompt);
      toast.success("Copied", `${preview.prompt.length.toLocaleString()} characters on the clipboard.`);
    } catch {
      toast.error("Couldn't copy", "Select the text and copy it by hand.");
    }
  };

  const unitList = detail.units.join(", ");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Operate · Smart Proposal</div>
          <h1 className="page-title">Prompts</h1>
        </div>
        <div className="page-actions">
          <span className={overrideCount ? "chip ok" : `chip ${s.chipMuted}`} data-override-count>
            {overrideCount ? `${overrideCount} change${overrideCount === 1 ? "" : "s"} saved` : "All defaults"}
          </span>
          <a className="btn btn-ghost" href="#preview">
            <Ic id="i-search" />
            Preview a prompt
          </a>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">How the prompt is built</div>
            <div className="card-sub">
              One model call prices a brief. The user message is assembled in this order; the parts marked <em>edit here</em> are the boxes below. The rest is code.
              Prices come from the master prompt&apos;s guidelines, the price book and material profile of the previous JobFlex (material only), the trade
              profile&apos;s anchors and the method&apos;s sanity ranges. The old tax block is not sent: the proposal taxes the subtotal at the job&apos;s state rate.
            </div>
          </div>
        </div>
        <hr className="card-rule" />
        <ol className={p.slots}>
          <li className={p.slot}><span><b>System message</b> — who the model is and that it answers in JSON.</span><em className={p.here}>edit here</em></li>
          <li className={p.slot}><span><b>Master prompt</b> — the estimator&apos;s method: photos and blueprints first, room naming, waste, units, pricing rules.</span><em className={p.here}>edit here</em></li>
          <li className={p.slot}><span><b>Specialty preamble</b> — one paragraph for the detected specialty (229 specialties in 14 groups).</span><em className={p.here}>edit here</em></li>
          <li className={p.slot}><span><b>Material profile and price book</b> — the previous JobFlex&apos;s curated products for the specialty and its trade-filtered material prices, as a check on the material side of the lines.</span><em>code</em></li>
          <li className={p.slot}><span><b>Procedure</b> — the lines a professional estimate itemizes for the specialty, in order, each with its unit, plus the line-item rules. A brief that names part of a room (a sink, a toilet, a tub-to-shower) gets the steps as a menu, never a line quota.</span><em className={p.here}>edit here</em></li>
          <li className={p.slot}><span><b>Remodel method</b> — for kitchen, bath and interior briefs: how to read the brief, what it implies (only the rooms its words reach), hidden-work chains, code triggers, what is never forgotten, when to ask, what never to write, sanity ranges, worked examples; a whole remodel of a known kind also gets its price range for the place.</span><em className={p.here}>edit here</em></li>
          <li className={p.slot}><span><b>Trade profile</b> — phases, checklist and price anchors for the 20 deep trades (sent to gpt-4o-class models; gpt-5-class models get the prompt without it).</span><em>code</em></li>
          <li className={p.slot}><span><b>Output rules</b> — the proposal template, the JSON shape, project-type detection, the brief with its binding numbers, the key questions.</span><em>code</em></li>
          <li className={p.slot}><span><b>The check after the reply</b> — a whole job far short of its procedure&apos;s steps, or a whole remodel under its range, is asked once more with the reasons named; the fuller answer is kept.</span><em>code</em></li>
        </ol>
      </div>

      <TextBlock
        block="system"
        title="System message"
        sub="The one-line system turn every estimate call opens with."
        keyName={OVERRIDE_KEYS.system}
        state={system}
        onChanged={changed}
      />

      <TextBlock
        block="master"
        title="Master prompt"
        sub="The estimator's method — the top of every Smart Proposal prompt. Markdown headings are fine; the model reads them as sections."
        keyName={OVERRIDE_KEYS.master}
        state={master}
        tall
        onChanged={changed}
      />

      <TextBlock
        block="rules"
        title="Line-item rules"
        sub="The paragraph that closes every procedure block: itemize every step, real quantities in the step's unit, both cost halves, no padding."
        keyName={OVERRIDE_KEYS.procedureRules}
        state={rules}
        onChanged={specialtyChanged}
      />

      <div className="card" data-remodel-card>
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Remodel method</div>
            <div className="card-sub">
              Rides with kitchen, bathroom and interior briefs. Every brief gets the three core parts; the room parts ride only when the brief&apos;s words reach that room.
              Pick a part to see and change it.
            </div>
          </div>
        </div>
        <hr className="card-rule" />
        <div className={p.pick}>
          <span className="bp-sel bp-sel--admin">
            <select id="p-remodel-part" className="bp-sel-in" value={remodelKey} onChange={(e) => setRemodelKey(e.target.value as RemodelPartState["key"])} aria-label="Remodel method part">
              {remodel.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                  {r.savedAt ? " · edited" : ""}
                </option>
              ))}
            </select>
          </span>
          <div className={p.desc} data-remodel-covers>
            {remodelPart.covers}
          </div>
        </div>
      </div>

      <TextBlock
        key={`remodel:${remodelPart.key}`}
        block="remodel"
        title={`Remodel method — ${remodelPart.label}`}
        sub="Markdown headings keep their section numbers; the other parts refer to them. The worked examples of a room part start at a ### 9. heading."
        keyName={OVERRIDE_KEYS.remodel(remodelPart.key)}
        state={remodelPart}
        tall
        onChanged={changed}
      />

      <div className="card" data-specialty-card>
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Specialty</div>
            <div className="card-sub">Pick a specialty to see and change its preamble and its procedure. The detector picks one from the brief; the preview below shows which.</div>
          </div>
        </div>
        <hr className="card-rule" />
        <SpecialtyPicker groups={groups} rows={specialties} current={detail.id} onPick={pick} busy={loadingDetail} />
      </div>

      <div className="card" data-specialty-head={detail.id} aria-busy={loadingDetail}>
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">{detail.name}</div>
            <div className="card-sub">
              {detail.group} · <code>{detail.id}</code>
            </div>
          </div>
        </div>
        <hr className="card-rule" />
        <div className={p.body}>
          <div className={p.desc}>{detail.description}</div>
          {detail.keyQuestions.length ? (
            <>
              <div className={p.stamp}>Key planning questions the prompt lists</div>
              <ul className={p.qs}>
                {detail.keyQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      <TextBlock
        key={`${detail.id}:preamble`}
        block="preamble"
        title={`${detail.name} — preamble`}
        sub="The paragraph that follows the master prompt for this specialty."
        keyName={OVERRIDE_KEYS.preamble(detail.id)}
        state={detail.preamble}
        onChanged={specialtyChanged}
      />

      <TextBlock
        key={`${detail.id}:procedure`}
        block="procedure"
        title={`${detail.name} — procedure`}
        sub="The lines a professional estimate itemizes for this specialty, in build order, each with the unit it is measured and sold in."
        keyName={OVERRIDE_KEYS.procedure(detail.id)}
        state={detail.procedure}
        tall
        onChanged={specialtyChanged}
        legend={
          <>
            One step per line: <code>- what is done, how, with what | unit | condition</code>. The condition is optional — a step without one is on every job. Units:{" "}
            <code>{unitList}</code>. Then <code>basis:</code> (how the trade measures the work), <code>avoid:</code> lines (one per line: a line never to write) and <code>note:</code> lines
            (one per line: an assumption to state). Save runs the same checks the code defaults pass: 3 to 40 steps, at least 4 without a condition, no bare one-word lines.
          </>
        }
      />

      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">As the prompt carries it</div>
            <div className="card-sub">The procedure block exactly as it is sent for {detail.name}, with your line-item rules under it.</div>
          </div>
        </div>
        <hr className="card-rule" />
        <div className={p.body}>
          {detail.block ? (
            <details className={p.asSent} data-block-as-sent>
              <summary>Show the block</summary>
              <pre className={p.pre}>{detail.block}</pre>
            </details>
          ) : (
            <div className="empty">No procedure is written for this specialty yet — add one above and it is sent from the next estimate on.</div>
          )}
        </div>
      </div>

      <div className="card" id="preview" data-preview>
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Preview the exact prompt</div>
            <div className="card-sub">Type a brief the way a contractor would. The preview composes the prompt the estimate would send right now — every saved change applied — and names the specialty the detector picked.</div>
          </div>
        </div>
        <hr className="card-rule" />
        <div className={p.form}>
          <div className={`${kx("fld")} ${p.wide}`}>
            <label className={kx("fld-lbl")} htmlFor="pv-desc">
              Brief
            </label>
            <textarea id="pv-desc" className={`${kx("in", "ta")} ${p.ta}`} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className={kx("fld")}>
            <label className={kx("fld-lbl")} htmlFor="pv-loc">
              Location
            </label>
            <input id="pv-loc" className={kx("in")} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="City, ST" />
          </div>
          <div className={kx("fld")}>
            <label className={kx("fld-lbl")} htmlFor="pv-spec">
              Specialty
            </label>
            <span className="bp-sel bp-sel--admin">
              <select id="pv-spec" className="bp-sel-in" value={spec} onChange={(e) => setSpec(e.target.value)} aria-label="Specialty for the preview">
                <option value="">Detect from the brief</option>
                {specialties.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <button type="button" id="pv-go" className="btn btn-primary btn-field" disabled={composing} onClick={compose}>
            <Ic id="i-search" />
            {composing ? "Composing…" : "Compose"}
          </button>
        </div>
        <div className={p.body}>
          <div className={p.chips} data-preview-chips>
            <span className="chip ok" data-preview-specialty={preview.specialtyId}>
              {preview.specialtyName}
            </span>
            <span className={`chip ${s.chipMuted}`}>{preview.detected ? "detected from the brief" : "chosen"}</span>
            <span className={`chip ${s.chipMuted}`}>{preview.model}</span>
            <span className={preview.procedure ? "chip ok" : `chip ${s.chipMuted}`} data-preview-procedure={preview.procedure ? "yes" : "no"}>
              {preview.procedure ? "procedure block sent" : "no procedure block"}
            </span>
            <span className={`chip ${s.chipMuted}`}>{preview.tradeRules ? "trade profile sent" : "trade profile skipped"}</span>
            <span className={preview.remodelDomains.length ? "chip ok" : `chip ${s.chipMuted}`} data-preview-method={preview.remodelDomains.join("+") || "none"}>
              {preview.remodelDomains.length ? `remodel method: ${preview.remodelDomains.join(", ")}` : "no remodel method"}
            </span>
            <span className={`chip ${s.chipMuted}`} data-preview-scope={preview.scope}>
              {preview.scope === "partial" ? "part of a room: steps as a menu" : "whole job"}
            </span>
            {preview.range ? (
              <span className="chip ok" data-preview-range={`${preview.range.low}-${preview.range.high}`}>
                range ${preview.range.low.toLocaleString("en-US")}-${preview.range.high.toLocaleString("en-US")} ({preview.range.place})
              </span>
            ) : null}
            <span className={p.count} data-preview-count>
              {preview.prompt.length.toLocaleString()} characters
            </span>
            <span className={p.grow} />
            <button type="button" id="pv-copy" className="btn btn-sm btn-ghost" onClick={copy}>
              <Ic id="i-dup" />
              Copy
            </button>
          </div>
          <div className={p.sys}>
            <b>System:</b> {preview.system}
          </div>
          <pre id="pv-out" className={p.pre}>
            {preview.prompt}
          </pre>
        </div>
      </div>
    </>
  );
}
