"use client";
import * as React from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toast";
import { Copy, Check } from "lucide-react";

interface WorkerInviteDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    email: string;
    phone?: string;
    specialties: string[];
    hourlyRate?: number;
  }) => Promise<{ token: string } | null>;
}

const SPECIALTIES = [
  "Roofing",
  "Framing",
  "Electrical",
  "Plumbing",
  "Drywall",
  "Painting",
  "Flooring",
  "Tile",
  "Cabinetry",
  "Fencing",
  "Decking",
  "Landscaping",
];

export function WorkerInviteDrawer({ open, onClose, onSubmit }: WorkerInviteDrawerProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ token: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setRate("");
    setSelected([]);
    setCreated(null);
    setCopied(false);
  }

  const magicLink = created
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/w/${created.token}`
    : "";

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) {
      toast.error("Missing info", "Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await onSubmit({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        specialties: selected,
        hourlyRate: rate ? Number(rate) : undefined,
      });
      if (res) {
        setCreated(res);
        toast.success("Worker invited", "Share the magic link to give them access.");
      }
    } catch (err: any) {
      toast.error("Invite failed", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={created ? "Invite ready" : "Invite worker"}
      description={
        created
          ? "Share this magic link or let them sign in by email once set up."
          : "They'll get a token-based portal — no password needed."
      }
      width="min(480px, 100vw)"
      footer={
        !created ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={busy}>
              Create invite
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        )
      }
    >
      {!created ? (
        <div className="space-y-4">
          <Input
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Casey Stone"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="casey@example.com"
          />
          <Input
            label="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(215) 555-0199"
          />
          <Input
            label="Hourly rate (optional)"
            type="number"
            prefix={<span className="text-[11px]">$</span>}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <div>
            <div className="quiet-caps mb-2">Specialties</div>
            <div className="flex flex-wrap gap-1.5">
              {SPECIALTIES.map((s) => {
                const active = selected.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setSelected((prev) =>
                        active ? prev.filter((x) => x !== s) : [...prev, s],
                      )
                    }
                    className={
                      "rounded-full px-2.5 py-1 text-[11px] hairline transition-colors " +
                      (active
                        ? "bg-[color:var(--accent)] text-[color:var(--paper)] border-transparent"
                        : "bg-transparent text-[color:var(--ink-muted)] hover:bg-black/[0.04]")
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="paper-card p-4">
            <div className="quiet-caps mb-2">Magic link</div>
            <div className="flex items-center gap-2 rounded-[var(--r-sm)] bg-black/[0.03] hairline px-3 py-2">
              <code className="flex-1 text-[11px] font-mono text-[color:var(--ink-soft)] break-all">
                {magicLink}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(magicLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
                aria-label="Copy"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[12px] text-[color:var(--ink-muted)] leading-relaxed">
            Anyone with this link can view and accept jobs assigned to them. Treat it like a
            password — you can revoke access at any time from the worker profile page.
          </p>
        </div>
      )}
    </Sheet>
  );
}
