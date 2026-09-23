"use client";

// The two "add" forms that live in bottom sheets: a new item and a new
// supplier. The fields and their parsing are the live board's, unchanged; the
// page decides what happens with the values (the same server actions).

import type { BoardSupplier } from "@/lib/inventoryBoard";
import { Field, Icon, Select } from "./mri-parts";

export type NewItem = { name: string; unit: string; onHand: number; reorderPoint: number | null; supplierId: string | null; supplierSku: string | null; lastCost: number | null };
export type NewSupplier = { name: string; email: string; phone: string; website: string };

export function AddItemForm({ suppliers, pending, onSubmit }: { suppliers: readonly BoardSupplier[]; pending: boolean; onSubmit: (v: NewItem) => void }) {
  return (
    <form
      className="mri-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
        const name = g("name").trim();
        if (!name) {
          (f.elements.namedItem("name") as HTMLInputElement).focus();
          return;
        }
        onSubmit({
          name,
          unit: g("unit").trim() || "each",
          onHand: Number(g("onHand")) || 0,
          reorderPoint: g("reorder") === "" ? null : Number(g("reorder")),
          supplierId: g("supplier") || null,
          supplierSku: g("sku").trim() || null,
          lastCost: g("cost") === "" ? null : Number(g("cost")),
        });
      }}
    >
      <div className="mri-form-grid">
        <Field label="Item name" wide>
          <input name="name" className="mri-in" placeholder="Architectural shingle · 30-yr" autoComplete="off" aria-required="true" data-autofocus />
        </Field>
        <Field label="Unit">
          <input name="unit" className="mri-in" placeholder="each" autoComplete="off" />
        </Field>
        <Field label="On hand">
          <input name="onHand" className="mri-in" type="number" step="any" min="0" inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Reorder at">
          <input name="reorder" className="mri-in" type="number" step="any" min="0" inputMode="decimal" placeholder="next job" />
        </Field>
        <Field label="Last cost">
          <input name="cost" className="mri-in" type="number" step="any" min="0" inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field label="Supplier" wide>
          <Select name="supplier" defaultValue="">
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Supplier SKU" wide>
          <input name="sku" className="mri-in" placeholder="optional" autoComplete="off" />
        </Field>
      </div>
      <div className="mri-form-foot">
        <button className="mri-btn mri-btn-p mri-btn-block" type="submit" disabled={pending}>
          <Icon id="i-plus" />
          Add item
        </button>
      </div>
    </form>
  );
}

export function AddSupplierForm({ pending, onSubmit }: { pending: boolean; onSubmit: (v: NewSupplier) => void }) {
  return (
    <form
      className="mri-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
        const name = g("sname").trim();
        if (!name) {
          (f.elements.namedItem("sname") as HTMLInputElement).focus();
          return;
        }
        onSubmit({ name, email: g("semail"), phone: g("sphone"), website: g("sweb") });
      }}
    >
      <div className="mri-form-grid">
        <Field label="Supplier" wide>
          <input name="sname" className="mri-in" placeholder="ABC Supply · Kent" autoComplete="organization" aria-required="true" data-autofocus />
        </Field>
        <Field label="Email for orders" wide>
          <input name="semail" className="mri-in" type="email" inputMode="email" placeholder="orders@…" autoComplete="email" />
        </Field>
        <Field label="Phone" wide>
          <input name="sphone" className="mri-in" type="tel" inputMode="tel" placeholder="(425) …" autoComplete="tel" />
        </Field>
        <Field label="Website" wide>
          <input name="sweb" className="mri-in" inputMode="url" placeholder="ordering page" autoComplete="url" />
        </Field>
      </div>
      <p className="mri-form-note">A supplier with an email is where a purchase order goes.</p>
      <div className="mri-form-foot">
        <button className="mri-btn mri-btn-p mri-btn-block" type="submit" disabled={pending}>
          <Icon id="i-plus" />
          Add supplier
        </button>
      </div>
    </form>
  );
}
