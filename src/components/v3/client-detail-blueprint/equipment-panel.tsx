"use client";

// EQUIPMENT ON FILE (2026-09-23) — the client page's panel: the units at the
// home, one line each with the age advice, and a form to add one: typed,
// or read off a nameplate photo by the HVAC estimator's reader.

import { useRef, useState, useTransition } from "react";
import { readHvacNameplate } from "@/actions/hvacEstimator";
import { deleteClientEquipment, saveClientEquipment } from "@/actions/equipment";
import { EQUIPMENT_KINDS, equipmentFromNameplate } from "@/lib/equipment";

export type EquipmentRow = { id: string; kind: string; line: string; advice: string | null; filterSize: string | null; location: string | null; serial: string | null; source: string };

const IN: React.CSSProperties = { font: "inherit", fontSize: 13, padding: "6px 8px", border: "1.5px solid var(--ink)", borderRadius: "var(--radius)", background: "#fff", width: "100%" };
const LBL: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 };

export function EquipmentPanel({ clientId, rows }: { clientId: string; rows: EquipmentRow[] }) {
  const [open, setOpen] = useState(rows.length === 0);
  const [read, setRead] = useState<{ kind: string; brand?: string; model?: string; serial?: string; tons?: number; refrigerant?: string; yearMade?: number; notes?: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    setMsg("Reading the plate…");
    const fr = new FileReader();
    fr.onload = () => {
      start(async () => {
        try {
          const res = await readHvacNameplate({ dataUrl: String(fr.result), hint: "outdoor" });
          if (res.ok) {
            setRead(equipmentFromNameplate(res.read));
            setOpen(true);
            setMsg(`Read at ${res.read.confidence} confidence — check the fields, then save.`);
          } else setMsg(res.error);
        } catch (err) {
          setMsg(err instanceof Error ? err.message : "Could not read the plate.");
        }
      });
    };
    fr.readAsDataURL(file);
  };

  return (
    <div data-client-equipment={rows.length} style={{ fontSize: 13, lineHeight: 1.5 }}>
      {rows.length === 0 ? (
        <div style={{ color: "var(--muted)", marginBottom: 8 }}>Nothing on file yet. Type the unit in, or photograph its nameplate — the age and refrigerant decide what to quote next.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <li key={r.id} data-equipment-row style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{r.line}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>
                  {[r.serial ? `S/N ${r.serial}` : null, r.filterSize ? `filter ${r.filterSize}` : null, r.location, r.source === "estimator" ? "from the HVAC estimate" : r.source === "nameplate" ? "from the nameplate" : r.source === "visit" ? "from a visit" : null].filter(Boolean).join(" · ")}
                </div>
                {r.advice && <div style={{ marginTop: 3, color: "var(--warning, #b88420)" }}>{r.advice}</div>}
              </div>
              <form action={deleteClientEquipment.bind(null, r.id)}><button type="submit" className="btn btn-ghost btn--sm" title="Remove">Remove</button></form>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn btn-ghost btn--sm" onClick={() => setOpen((o) => !o)} data-equipment-add>{open ? "Close" : "Add a unit"}</button>
        <button type="button" className="btn btn-primary btn--sm" onClick={() => fileRef.current?.click()} disabled={pending}>{pending ? "Reading…" : "Read a nameplate photo"}</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => onPhoto(e.target.files?.[0])} />
        {msg && <span style={{ fontSize: 12, color: "var(--muted)" }}>{msg}</span>}
      </div>
      {open && (
        <form action={saveClientEquipment} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 12 }} data-equipment-form key={read ? JSON.stringify(read) : "blank"}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="source" value={read ? "nameplate" : "typed"} />
          <label style={{ gridColumn: "1 / -1" }}><span style={LBL}>Kind</span>
            <select name="kind" defaultValue={read?.kind ?? "split-ac-furnace"} style={IN}>{EQUIPMENT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select>
          </label>
          <label><span style={LBL}>Brand</span><input name="brand" defaultValue={read?.brand ?? ""} style={IN} /></label>
          <label><span style={LBL}>Model</span><input name="model" defaultValue={read?.model ?? ""} style={IN} /></label>
          <label><span style={LBL}>Serial</span><input name="serial" defaultValue={read?.serial ?? ""} style={IN} /></label>
          <label><span style={LBL}>Tons</span><input name="tons" type="number" step="0.5" min="0" defaultValue={read?.tons ?? ""} style={IN} /></label>
          <label><span style={LBL}>Refrigerant</span>
            <select name="refrigerant" defaultValue={read?.refrigerant ?? ""} style={IN}><option value="">—</option><option>R-410A</option><option>R-22</option><option>R-454B</option><option>R-32</option><option value="other">other</option></select>
          </label>
          <label><span style={LBL}>Fuel</span>
            <select name="fuel" defaultValue="" style={IN}><option value="">—</option><option value="gas">Gas</option><option value="propane">Propane</option><option value="electric">Electric</option><option value="oil">Oil</option></select>
          </label>
          <label><span style={LBL}>Year made</span><input name="yearMade" type="number" min="1950" max="2100" defaultValue={read?.yearMade ?? ""} style={IN} /></label>
          <label><span style={LBL}>Filter size</span><input name="filterSize" placeholder="16×25×1" style={IN} /></label>
          <label><span style={LBL}>Location</span><input name="location" placeholder="attic, closet, garage…" style={IN} /></label>
          <label style={{ gridColumn: "1 / -1" }}><span style={LBL}>Notes</span><input name="notes" defaultValue={read?.notes ?? ""} style={IN} /></label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primary btn--sm">Save the unit</button>
          </div>
        </form>
      )}
    </div>
  );
}
