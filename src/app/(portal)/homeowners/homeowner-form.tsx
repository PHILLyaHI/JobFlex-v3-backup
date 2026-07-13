"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { submitHomeownerRequest } from "@/actions/homeowner";

const PROJECT_TYPES = [
  "Roofing",
  "Kitchen remodel",
  "Bathroom remodel",
  "Fencing",
  "Decking",
  "Flooring",
  "Siding",
  "Windows",
  "Painting",
  "Other",
];

const STEPS = ["About you", "The project", "Details"] as const;

export function HomeownerForm() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref") ?? "";
  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [values, setValues] = React.useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    projectType: "",
    description: "",
  });

  const canNext = React.useMemo(() => {
    if (step === 0) return values.name && /\S+@\S+\.\S+/.test(values.email);
    if (step === 1) return values.projectType && values.description.length > 10;
    return true;
  }, [step, values]);

  function update<K extends keyof typeof values>(k: K, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      await submitHomeownerRequest({ ...values, referralCode: referralCode || undefined });
      setDone(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-md mx-auto text-center py-16">
        <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 text-emerald-700 grid place-items-center">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="mt-6 font-display text-[32px] tracking-[-0.02em]">Thanks, {values.name.split(" ")[0] || "there"}.</h2>
        <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">
          We've got your request and a contractor will reach out within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={
                "h-6 w-6 rounded-full grid place-items-center text-[11px] tabular transition-colors " +
                (i <= step
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "bg-transparent text-[color:var(--ink-muted)] hairline")
              }
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={
                "text-[11px] tracking-[0.12em] uppercase " +
                (i === step ? "text-[color:var(--ink)]" : "text-[color:var(--ink-faint)]")
              }
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="w-8 h-px bg-[color:var(--ink-line)] mx-1" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {step === 0 && (
            <>
              <Input label="Your name" value={values.name} onChange={(e) => update("name", e.target.value)} placeholder="Elena Diaz" />
              <Input label="Email" type="email" value={values.email} onChange={(e) => update("email", e.target.value)} placeholder="elena@example.com" />
              <Input label="Phone (optional)" value={values.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(215) 555 - 0100" />
            </>
          )}
          {step === 1 && (
            <>
              <Select label="Project type" value={values.projectType} onChange={(e) => update("projectType", e.target.value)}>
                <option value="">— Select —</option>
                {PROJECT_TYPES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
              <Textarea
                label="Describe what you have in mind"
                rows={5}
                value={values.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Roof is 15 years old, has some missing shingles after the storm…"
                hint="At least a sentence or two — specifics help contractors give a tighter quote."
              />
            </>
          )}
          {step === 2 && (
            <>
              <Input label="Address (optional)" value={values.address} onChange={(e) => update("address", e.target.value)} placeholder="221 Oak St" />
              <div className="grid grid-cols-[1fr_72px_88px] gap-2">
                <Input label="City" value={values.city} onChange={(e) => update("city", e.target.value)} placeholder="Philadelphia" />
                <Input label="State" value={values.state} onChange={(e) => update("state", e.target.value)} placeholder="PA" />
                <Input label="ZIP" value={values.zip} onChange={(e) => update("zip", e.target.value)} placeholder="19103" />
              </div>
              <p className="text-[11px] text-[color:var(--ink-muted)] pt-2">
                By submitting you agree to be contacted about your project. No spam, ever.
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          icon={<ChevronLeft className="h-3 w-3" />}
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            disabled={!canNext}
            onClick={() => setStep((s) => s + 1)}
            icon={<ChevronRight className="h-3 w-3" />}
          >
            Continue
          </Button>
        ) : (
          <Button loading={submitting} onClick={onSubmit}>
            Submit request
          </Button>
        )}
      </div>
    </div>
  );
}
