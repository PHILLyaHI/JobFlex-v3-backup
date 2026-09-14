"use client";
// The change-order sheet — a crew lead on a phone, plywood found on tear-off
// day, sent to the client in under a minute:
//   1. the type is pre-picked (plywood), the material pre-selected for the
//      roof, the price pre-filled from the company's own last price;
//   2. areas: sheets × 32, length × width, or sq ft straight in — several
//      named areas on one order;
//   3. a reason and photos from the camera;
//   4. one tap: Send. The running total, tax and the client's new contract
//      total sit above the buttons the whole time.
// Mounted as a plain React child on the job pages and as a React island on
// the proposals page (the MaterialsSheet precedent).
import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Plus, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { createChangeOrder, getChangeOrderContext, uploadChangeOrderPhoto, type ChangeOrderContext } from "@/actions/changeOrders";
import { PLYWOOD_TYPE, linesForAreas, totalsForLines, type CoArea, type CoLine, type CoTypeDef, type CoUnit } from "@/lib/changeOrders/types";

const CUSTOM_ITEM = "__custom";
const UNITS: CoUnit[] = ["sq ft", "linear ft", "each", "hour", "lot"];

type AreaMode = "sheets" | "lw" | "sqft";
interface AreaRow extends CoArea {
  mode: AreaMode;
  sheets: string;
  length: string;
  width: string;
  sqft: string;
}
interface FreeLine {
  id: string;
  name: string;
  quantity: string;
  unit: CoUnit;
  unitPrice: string;
  kind: "material" | "labor";
}

const uid = () => Math.random().toString(36).slice(2, 8);
const num = (s: string) => {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

function areaSqft(a: AreaRow, sheetSqft: number): number {
  if (a.mode === "sheets") return r1(num(a.sheets) * sheetSqft);
  if (a.mode === "lw") return r1(num(a.length) * num(a.width));
  return r1(num(a.sqft));
}
function newArea(label = ""): AreaRow {
  return { id: uid(), label, quantity: 0, mode: "sheets", sheets: "", length: "", width: "", sqft: "" };
}

export function ChangeOrderSheet({
  open,
  onClose,
  jobId,
  proposalId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  jobId?: string;
  proposalId?: string;
  /** After a save or send — the page reloads its list. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [ctx, setCtx] = React.useState<ChangeOrderContext | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [type, setType] = React.useState<CoTypeDef>(PLYWOOD_TYPE);
  const [itemKey, setItemKey] = React.useState<string>(PLYWOOD_TYPE.items[0].key);
  const [customName, setCustomName] = React.useState("");
  const [customThickness, setCustomThickness] = React.useState("");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [areas, setAreas] = React.useState<AreaRow[]>([newArea()]);
  const [free, setFree] = React.useState<FreeLine[]>([]);
  const [title, setTitle] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [photos, setPhotos] = React.useState<Array<{ id: string; url: string }>>([]);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState<"draft" | "send" | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Context on open: the parent, tax, the roof family, the company's prices.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null);
  const key = `${jobId ?? ""}|${proposalId ?? ""}`;
  React.useEffect(() => {
    if (!open || openedFor === key) return;
    let cancelled = false;
    getChangeOrderContext({ jobId, proposalId })
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        setOpenedFor(key);
        setLoadErr(null);
        const plywood = c.types.find((t) => t.key === PLYWOOD_TYPE.key) ?? c.types[0];
        setType(plywood);
        const fam = c.roofFamily;
        const smart = plywood.smartDefault ? (fam ? plywood.smartDefault.byRoofFamily[fam] : undefined) ?? plywood.smartDefault.fallback : plywood.items[0]?.key ?? CUSTOM_ITEM;
        setItemKey(smart);
        const pref = c.prefs[`${plywood.key}:${smart}`];
        const item = plywood.items.find((i) => i.key === smart);
        setUnitPrice(String(pref?.unitPrice ?? item?.suggestedUnitPrice ?? ""));
        setTitle(plywood.key === PLYWOOD_TYPE.key ? "Plywood replacement" : plywood.label);
        setAreas([{ ...newArea(), sheets: pref?.lastQuantity ? String(Math.round(pref.lastQuantity / (plywood.helpers.sheetSqft ?? 32))) : "" }]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadErr(err instanceof Error ? err.message : "Couldn't load");
      });
    return () => {
      cancelled = true;
    };
  }, [open, key, jobId, proposalId, openedFor]);

  function pickType(t: CoTypeDef) {
    setType(t);
    setTitle(t.key === PLYWOOD_TYPE.key ? "Plywood replacement" : t.key === "custom" ? "" : t.label);
    const first = t.items[0]?.key ?? CUSTOM_ITEM;
    pickItem(first, t);
    if (!t.areas && free.length === 0) setFree([{ id: uid(), name: "", quantity: "1", unit: t.unit, unitPrice: "", kind: "material" }]);
  }
  function pickItem(k: string, t: CoTypeDef = type) {
    setItemKey(k);
    if (k === CUSTOM_ITEM) {
      setUnitPrice(String(ctx?.prefs[`${t.key}:custom`]?.unitPrice ?? ""));
      return;
    }
    const item = t.items.find((i) => i.key === k);
    const pref = ctx?.prefs[`${t.key}:${k}`];
    setUnitPrice(String(pref?.unitPrice ?? item?.suggestedUnitPrice ?? ""));
  }

  const item = type.items.find((i) => i.key === itemKey) ?? null;
  const itemLabel = itemKey === CUSTOM_ITEM ? customName.trim() || "Custom material" : item?.label ?? "";
  const itemThickness = itemKey === CUSTOM_ITEM ? customThickness.trim() || undefined : item?.thickness;
  const sheetSqft = type.helpers.sheetSqft ?? 32;

  const lines: CoLine[] = React.useMemo(() => {
    if (type.areas) {
      return linesForAreas({
        itemLabel,
        itemKey: itemKey === CUSTOM_ITEM ? "custom" : itemKey,
        thickness: itemThickness,
        unit: type.unit,
        unitPrice: num(unitPrice),
        areas: areas.map((a) => ({ id: a.id, label: a.label, quantity: areaSqft(a, sheetSqft) })),
      });
    }
    return free
      .filter((l) => l.name.trim() && num(l.quantity) > 0)
      .map((l) => ({ key: "custom", name: l.name.trim(), quantity: num(l.quantity), unit: l.unit, unitPrice: num(l.unitPrice), kind: l.kind }));
  }, [type, itemLabel, itemKey, itemThickness, unitPrice, areas, sheetSqft, free]);

  const totals = totalsForLines(lines, ctx?.taxRate ?? 0, true);
  const totalSqft = type.areas ? areas.reduce((s, a) => s + areaSqft(a, sheetSqft), 0) : 0;
  const newContract = ctx?.contractBefore != null ? Math.round((ctx.contractBefore + totals.total) * 100) / 100 : null;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 6)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("Couldn't read the photo"));
          r.readAsDataURL(f);
        });
        const up = await uploadChangeOrderPhoto(dataUrl, f.name);
        setPhotos((p) => [...p, up]);
      }
    } catch (err) {
      toast.error("Photo not added", err instanceof Error ? err.message : undefined);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function reset() {
    setAreas([newArea()]);
    setFree([]);
    setReason("");
    setPhotos([]);
    setCustomName("");
    setCustomThickness("");
    setOpenedFor(null);
  }

  async function submit(send: boolean) {
    if (!ctx) return;
    if (!title.trim()) {
      toast.error("Give the change a title");
      return;
    }
    if (lines.length === 0) {
      toast.error(type.areas ? "Enter at least one area" : "Add at least one line");
      return;
    }
    if (send && !ctx.clientEmail && !ctx.clientPhone) {
      toast.error("No email or phone on the client", "Add one to the client first, or save as a draft and copy the link.");
      return;
    }
    setBusy(send ? "send" : "draft");
    try {
      const rememberKey = itemKey === CUSTOM_ITEM ? "custom" : itemKey;
      const res = await createChangeOrder({
        ...(jobId ? { jobId } : {}),
        ...(proposalId ? { proposalId } : {}),
        kind: type.key,
        title: title.trim(),
        reason: reason.trim() || null,
        lines,
        photos,
        taxable: true,
        send,
        remember: type.areas ? [{ itemKey: rememberKey, unitPrice: num(unitPrice), lastQuantity: totalSqft }] : [],
      });
      if (send) {
        const s = res.sent;
        const how = [s?.email === "sent" ? "email" : null, s?.sms === "sent" ? "text" : null].filter(Boolean).join(" + ");
        toast.success(`Change order #${res.number} sent${how ? ` by ${how}` : ""}`, `${money(res.total)} — the client approves from the link.`);
      } else {
        toast.success(`Change order #${res.number} saved as a draft`);
      }
      reset();
      onClose();
      onDone?.();
      router.refresh();
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const canSend = Boolean(ctx && (ctx.clientEmail || ctx.clientPhone));

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Change order"
      description={ctx ? `${ctx.contextTitle} · #${ctx.nextNumber}` : undefined}
      width="min(560px, 100vw)"
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-[12px] text-[color:var(--ink-muted)]">
            <span>
              {money(totals.subtotal)}
              {totals.taxTotal > 0 ? ` + ${money(totals.taxTotal)} tax` : ""}
              {newContract != null ? ` · contract becomes ${money(newContract)}` : ""}
            </span>
            <span className="font-display text-[20px] text-[color:var(--ink)] tabular">{money(totals.total)}</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="outline" loading={busy === "draft"} disabled={!ctx || busy != null} onClick={() => submit(false)}>
              Save draft
            </Button>
            <Button loading={busy === "send"} disabled={!ctx || busy != null || !canSend} onClick={() => submit(true)} title={canSend ? undefined : "The client has no email or phone"}>
              Send to client
            </Button>
          </div>
        </div>
      }
    >
      {loadErr ? (
        <p className="text-[13px] text-rose-700">{loadErr}</p>
      ) : !ctx ? (
        <p className="text-[13px] text-[color:var(--ink-muted)]">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Type */}
          {ctx.types.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {ctx.types.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickType(t)}
                  className={cn(
                    "h-9 px-3 rounded-full text-[12px] font-semibold hairline transition-colors",
                    type.key === t.key ? "bg-[color:var(--ink)] text-white" : "bg-white/60 text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {type.intro && <p className="text-[12px] text-[color:var(--ink-muted)] -mt-2">{type.intro}</p>}

          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type.key === "custom" ? "Fascia repair, west side" : undefined} />

          {type.areas ? (
            <>
              {/* Material */}
              <div>
                <div className="quiet-caps mb-1.5">Material</div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="h-10 rounded-[var(--r-md)] hairline bg-white/70 px-3 text-[14px]"
                    value={itemKey}
                    onChange={(e) => pickItem(e.target.value)}
                  >
                    {type.items.map((i) => (
                      <option key={i.key} value={i.key}>{i.label}</option>
                    ))}
                    {type.allowCustomItem && <option value={CUSTOM_ITEM}>Custom…</option>}
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    prefix={<span className="text-[11px]">$</span>}
                    suffix={<span className="text-[11px]">/{type.unit}</span>}
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder={item ? String(item.suggestedUnitPrice) : "0.00"}
                  />
                </div>
                {itemKey === CUSTOM_ITEM && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Material name" />
                    <Input value={customThickness} onChange={(e) => setCustomThickness(e.target.value)} placeholder="Thickness (5/8 in)" />
                  </div>
                )}
                <p className="text-[11px] text-[color:var(--ink-muted)] mt-1.5">
                  {ctx.prefs[`${type.key}:${itemKey === CUSTOM_ITEM ? "custom" : itemKey}`]
                    ? "Your own price — installed, material + labor. Change it and it is remembered."
                    : "Suggested price, installed (material + labor). Set your own and it is remembered."}
                </p>
              </div>

              {/* Areas */}
              <div>
                <div className="quiet-caps mb-1.5">Areas to replace</div>
                <div className="space-y-2">
                  {areas.map((a, i) => (
                    <div key={a.id} className="hairline rounded-[var(--r-md)] p-2.5 bg-white/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input value={a.label} onChange={(e) => setAreas((rows) => rows.map((r) => (r.id === a.id ? { ...r, label: e.target.value } : r)))} placeholder={i === 0 ? "North slope" : "Around chimney"} />
                        <div className="inline-flex rounded-[var(--r-sm)] hairline p-0.5 bg-white/60 shrink-0">
                          {(["sheets", "lw", "sqft"] as AreaMode[]).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setAreas((rows) => rows.map((r) => (r.id === a.id ? { ...r, mode: m } : r)))}
                              className={cn("h-8 px-2 rounded-[var(--r-sm)] text-[11px] font-semibold", a.mode === m ? "bg-[color:var(--ink)] text-white" : "text-[color:var(--ink-muted)]")}
                            >
                              {m === "sheets" ? "Sheets" : m === "lw" ? "L × W" : "Sq ft"}
                            </button>
                          ))}
                        </div>
                        {areas.length > 1 && (
                          <button type="button" className="h-8 w-8 grid place-items-center text-[color:var(--ink-muted)] hover:text-rose-700" aria-label="Remove area" onClick={() => setAreas((rows) => rows.filter((r) => r.id !== a.id))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {a.mode === "sheets" && (
                          <Input type="number" inputMode="numeric" value={a.sheets} onChange={(e) => setAreas((rows) => rows.map((r) => (r.id === a.id ? { ...r, sheets: e.target.value } : r)))} placeholder="3" suffix={<span className="text-[11px]">sheets 4×8</span>} />
                        )}
                        {a.mode === "lw" && (
                          <>
                            <Input type="number" inputMode="decimal" value={a.length} onChange={(e) => setAreas((rows) => rows.map((r) => (r.id === a.id ? { ...r, length: e.target.value } : r)))} placeholder="12" suffix={<span className="text-[11px]">ft</span>} />
                            <span className="text-[color:var(--ink-muted)]">×</span>
                            <Input type="number" inputMode="decimal" value={a.width} onChange={(e) => setAreas((rows) => rows.map((r) => (r.id === a.id ? { ...r, width: e.target.value } : r)))} placeholder="8" suffix={<span className="text-[11px]">ft</span>} />
                          </>
                        )}
                        {a.mode === "sqft" && (
                          <Input type="number" inputMode="decimal" value={a.sqft} onChange={(e) => setAreas((rows) => rows.map((r) => (r.id === a.id ? { ...r, sqft: e.target.value } : r)))} placeholder="96" suffix={<span className="text-[11px]">sq ft</span>} />
                        )}
                        <span className="text-[12px] tabular text-[color:var(--ink-soft)] shrink-0 w-[132px] text-right">
                          {areaSqft(a, sheetSqft)} {type.unit} · {money(Math.round(areaSqft(a, sheetSqft) * num(unitPrice) * 100) / 100)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} className="mt-2" onClick={() => setAreas((rows) => [...rows, newArea()])}>
                  Another area
                </Button>
                {totalSqft > 0 && (
                  <div className="text-[12px] text-[color:var(--ink-muted)] mt-1">
                    {totalSqft} {type.unit} total · about {Math.ceil(totalSqft / sheetSqft)} sheet{Math.ceil(totalSqft / sheetSqft) === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <div className="quiet-caps mb-1.5">Lines</div>
              <div className="space-y-2">
                {free.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_72px_88px_84px_32px] gap-1.5 items-center">
                    <Input value={l.name} onChange={(e) => setFree((rows) => rows.map((r) => (r.id === l.id ? { ...r, name: e.target.value } : r)))} placeholder="Item" />
                    <Input type="number" inputMode="decimal" value={l.quantity} onChange={(e) => setFree((rows) => rows.map((r) => (r.id === l.id ? { ...r, quantity: e.target.value } : r)))} placeholder="1" />
                    <select className="h-10 rounded-[var(--r-md)] hairline bg-white/70 px-2 text-[13px]" value={l.unit} onChange={(e) => setFree((rows) => rows.map((r) => (r.id === l.id ? { ...r, unit: e.target.value as CoUnit } : r)))}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <Input type="number" inputMode="decimal" value={l.unitPrice} onChange={(e) => setFree((rows) => rows.map((r) => (r.id === l.id ? { ...r, unitPrice: e.target.value } : r)))} placeholder="$" />
                    <button type="button" className="h-8 w-8 grid place-items-center text-[color:var(--ink-muted)] hover:text-rose-700" aria-label="Remove line" onClick={() => setFree((rows) => rows.filter((r) => r.id !== l.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} className="mt-2" onClick={() => setFree((rows) => [...rows, { id: uid(), name: "", quantity: "1", unit: type.unit, unitPrice: "", kind: "material" }])}>
                Add line
              </Button>
              <p className="text-[11px] text-[color:var(--ink-muted)] mt-1.5">A negative price is a credit to the client.</p>
            </div>
          )}

          {type.reason && (
            <Textarea label="Why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type.reasonPlaceholder} />
          )}

          {type.photos && (
            <div>
              <div className="quiet-caps mb-1.5">Photos of the damage</div>
              <div className="flex flex-wrap gap-2">
                {photos.map((ph) => (
                  <div key={ph.id} className="relative h-20 w-20 rounded-[var(--r-md)] overflow-hidden hairline">
                    {/* eslint-disable-next-line @next/next/no-img-element -- just uploaded to Blob */}
                    <img src={ph.url} alt="" className="h-full w-full object-cover" />
                    <button type="button" className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((x) => x.id !== ph.id))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="h-20 w-20 rounded-[var(--r-md)] hairline grid place-items-center text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] bg-white/50"
                  aria-label="Add photo"
                >
                  <Camera className="h-5 w-5" />
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
              </div>
              <p className="text-[11px] text-[color:var(--ink-muted)] mt-1.5">{uploading ? "Uploading…" : "JPEG, PNG or WebP, 5 MB each. The client sees them on the approval page."}</p>
            </div>
          )}

          {type.pricingNote && <p className="text-[11px] text-[color:var(--ink-muted)]">{type.pricingNote}</p>}
        </div>
      )}
    </Sheet>
  );
}
