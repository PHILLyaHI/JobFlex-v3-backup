"use client";
import * as React from "react";
import { Textarea } from "@/components/ui/Textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/Card";
import { PreviewTag, PreviewNote } from "./PreviewTag";

const TEMPLATE_TERMS = `1. Payment due as scheduled.
2. Changes to scope handled via written change order.
3. Warranty: workmanship covered for 12 months from completion.`;

// Bucket C — terms text is held locally. Notes already exists on the Proposal
// model but is semantically distinct ("warranty, assumptions, exclusions")
// from a contractual T&C section.
export function TermsBlock() {
  const [terms, setTerms] = React.useState("");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="inline-flex items-center gap-2">
            Terms &amp; Conditions <PreviewTag />
          </CardTitle>
          <CardSubtitle>
            The fine print that follows the line items on the proposal PDF.
          </CardSubtitle>
        </div>
        <button
          type="button"
          onClick={() => setTerms(TEMPLATE_TERMS)}
          className="text-[11.5px] font-medium text-[color:var(--ink-soft)] underline-offset-4 hover:text-[color:var(--ink)] hover:underline focus-ring"
        >
          Insert starter template
        </button>
      </CardHeader>
      <Textarea
        label="Terms"
        rows={8}
        value={terms}
        onChange={(e) => setTerms(e.target.value)}
        placeholder="Payment terms, change-order policy, warranty, dispute resolution…"
      />
      <PreviewNote>
        Persisting Terms needs a `terms` column on the Proposal model — the
        existing `notes` field carries warranty / assumptions / exclusions and
        keeps a separate role.
      </PreviewNote>
    </Card>
  );
}
