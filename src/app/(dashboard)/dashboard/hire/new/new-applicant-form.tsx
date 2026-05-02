"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { createApplicant } from "@/actions/applicants";

export function NewApplicantForm() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState("");
  const [source, setSource] = React.useState<string>("Indeed");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!fullName.trim() || !email.trim() || !role.trim()) {
      toast.error("Fill name, email, and role");
      return;
    }
    setBusy(true);
    try {
      const res = await createApplicant({
        fullName,
        email,
        phone: phone || null,
        role,
        source,
        notes: notes || null,
      });
      toast.success("Added");
      router.push(`/dashboard/hire/${res.id}` as any);
    } catch (err: any) {
      toast.error("Couldn't add", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Applicant</CardTitle>
          <CardSubtitle>You can refine notes and status from the detail page.</CardSubtitle>
        </div>
      </CardHeader>
      <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <Input
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Roofer, Estimator, Foreman…"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Select label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option>Indeed</option>
          <option>Referral</option>
          <option>Walk-in</option>
          <option>LinkedIn</option>
          <option>Job fair</option>
          <option>Other</option>
        </Select>
        <Textarea
          label="Notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Years of experience, specialties, schedule constraints…"
        />
      </div>
      <div className="mt-5 flex gap-2">
        <Button loading={busy} onClick={save} icon={<Save className="h-3.5 w-3.5" />}>
          Add applicant
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
