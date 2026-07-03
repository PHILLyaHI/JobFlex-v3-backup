"use client";
import * as React from "react";
import {
  Send,
  CreditCard,
  Wrench,
  UserCog,
  Lightbulb,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { submitSupportTicket } from "@/actions/support";

type Category = "billing" | "technical" | "account" | "feature" | "general";
type Priority = "low" | "normal" | "high";

const CATEGORIES: { key: Category; label: string; icon: React.ElementType }[] = [
  { key: "technical", label: "Technical", icon: Wrench },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "account", label: "Account", icon: UserCog },
  { key: "feature", label: "Feature idea", icon: Lightbulb },
  { key: "general", label: "Something else", icon: MessageCircle },
];

const PRIORITIES: { key: Priority; label: string; help: string }[] = [
  { key: "low", label: "Low", help: "Whenever you can" },
  { key: "normal", label: "Normal", help: "Standard reply" },
  { key: "high", label: "Urgent", help: "Blocking my work" },
];

export function SupportForm() {
  const [category, setCategory] = React.useState<Category>("technical");
  const [priority, setPriority] = React.useState<Priority>("normal");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [errors, setErrors] = React.useState<{ subject?: string; body?: string }>({});
  const [busy, setBusy] = React.useState(false);

  const subjectRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: { subject?: string; body?: string } = {};
    if (!subject.trim()) next.subject = "Add a subject so we know what to look at.";
    if (!body.trim()) next.body = "Tell us what's going on.";
    setErrors(next);
    if (next.subject) {
      subjectRef.current?.focus();
      return;
    }
    if (next.body) {
      bodyRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      await submitSupportTicket({ subject: subject.trim(), body: body.trim(), category, priority });
      toast.success("Message sent", "Our team will follow up by email — usually within a business day.");
      setSubject("");
      setBody("");
      setCategory("technical");
      setPriority("normal");
    } catch (err: unknown) {
      toast.error("Couldn't send", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Bold: real elevation + a full-bleed sage edge instead of the quiet hairline card.
    <div className="paper-card p-0 overflow-hidden !shadow-[var(--shadow-md)]">
      <div className="h-1 bg-[color:var(--accent)]" />
      <form onSubmit={handleSubmit} className="p-6 lg:p-7">
        <h2 className="font-display text-[22px] leading-tight tracking-[-0.015em] text-[color:var(--ink)]">
          Send us a message
        </h2>
        <p className="text-[13px] text-[color:var(--ink-muted)] mt-1">
          The more you tell us, the faster we can help. Replies land in your email.
        </p>

        <div className="mt-6 space-y-5">
          {/* Category — the chip the customer picks is mirrored straight into admin triage. */}
          <div>
            <div id="support-category-label" className="quiet-caps mb-2.5">
              What&apos;s it about?
            </div>
            <div role="group" aria-labelledby="support-category-label" className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-medium transition-all focus-ring",
                      active
                        ? "bg-[color:var(--accent)] text-white shadow-[var(--shadow-sm)]"
                        : "hairline text-[color:var(--ink-soft)] hover:bg-black/[0.04]",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", active ? "opacity-90" : "opacity-70")} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            ref={subjectRef}
            label="Subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              if (errors.subject) setErrors((p) => ({ ...p, subject: undefined }));
            }}
            error={errors.subject}
            required
            aria-invalid={errors.subject ? true : undefined}
            placeholder="Can't send a proposal"
          />

          <Textarea
            ref={bodyRef}
            label="Message"
            rows={6}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (errors.body) setErrors((p) => ({ ...p, body: undefined }));
            }}
            error={errors.body}
            required
            aria-invalid={errors.body ? true : undefined}
            placeholder="Describe what happened, what you expected, and any error you saw."
          />

          {/* Priority — segmented, sage-filled active state mirrors the category chips. */}
          <div>
            <div id="support-priority-label" className="quiet-caps mb-2.5">
              How urgent is it?
            </div>
            <div
              role="group"
              aria-labelledby="support-priority-label"
              className="grid grid-cols-3 gap-2"
            >
              {PRIORITIES.map((p) => {
                const active = priority === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPriority(p.key)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-[var(--r-md)] px-3 py-2.5 text-left transition-all focus-ring",
                      active
                        ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] shadow-[inset_0_0_0_1px_var(--accent)]"
                        : "hairline text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
                    )}
                  >
                    <span className="text-[13px] font-semibold">{p.label}</span>
                    <span
                      className={cn(
                        "text-[10.5px]",
                        active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink-muted)]",
                      )}
                    >
                      {p.help}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[color:var(--ink-muted)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Only you and our team can see this.
            </span>
            <Button type="submit" size="lg" loading={busy} icon={<Send className="h-4 w-4" />}>
              Send message
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
