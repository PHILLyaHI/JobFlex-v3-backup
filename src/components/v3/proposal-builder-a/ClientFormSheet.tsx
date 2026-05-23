"use client";
import * as React from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import {
  createClient,
  updateClient,
  type ClientRecord,
} from "@/actions/clients";

interface ClientFormSheetProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initial?: ClientRecord | null;
  /** Pre-fill the name field when entering from free-text mode. */
  initialName?: string;
  onSaved: (client: ClientRecord) => void;
}

// Inline create / edit form for clients. Posts to createClient / updateClient
// server actions — same data layer as the live builder, just exposed inline so
// the contractor never has to leave the proposal page.
export function ClientFormSheet({
  open,
  onClose,
  mode,
  initial,
  initialName,
  onSaved,
}: ClientFormSheetProps) {
  const [saving, setSaving] = React.useState(false);
  const blank = React.useMemo(
    () => ({
      name: initialName ?? initial?.name ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      address: initial?.address ?? "",
      city: initial?.city ?? "",
      state: initial?.state ?? "",
      zip: initial?.zip ?? "",
    }),
    [initial, initialName],
  );
  const [form, setForm] = React.useState(blank);

  // Re-initialise the form whenever the sheet opens, so a Create→Edit flip
  // doesn't leak previous values. Cannot live in useState's initializer because
  // this component persists across open/close transitions (the Sheet animates
  // exit before unmounting).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setForm(blank);
  }, [open, blank]);

  function patch<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error("Name required", "Every client needs a name.");
      return;
    }
    setSaving(true);
    try {
      const saved =
        mode === "create"
          ? await createClient(form)
          : await updateClient(initial!.id, form);
      toast.success(
        mode === "create" ? "Client created" : "Client updated",
        mode === "create"
          ? `${saved.name} is now in your client list.`
          : "Changes saved.",
      );
      onSaved(saved);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Please try again.";
      toast.error("Couldn't save client", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New client" : "Edit client"}
      description={
        mode === "create"
          ? "Saved straight into your client list — you'll see them in the picker."
          : "Edits apply to this client everywhere they appear."
      }
      width="min(520px, 100vw)"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {mode === "create" ? "Create client" : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => patch("name", e.target.value)}
          placeholder="Full name or business name"
          autoFocus
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => patch("email", e.target.value)}
            placeholder="name@example.com"
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => patch("phone", e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
        <Input
          label="Address"
          value={form.address}
          onChange={(e) => patch("address", e.target.value)}
          placeholder="Street address"
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_120px_120px]">
          <Input
            label="City"
            value={form.city}
            onChange={(e) => patch("city", e.target.value)}
          />
          <Input
            label="State"
            value={form.state}
            onChange={(e) => patch("state", e.target.value)}
          />
          <Input
            label="ZIP"
            value={form.zip}
            onChange={(e) => patch("zip", e.target.value)}
          />
        </div>
      </div>
    </Sheet>
  );
}
