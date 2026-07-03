// Starter email templates. Designed copy with {{variable}} slots so a user can
// see how a follow-up will read, then edit the text. Rendered through the same
// wrapEmail() shell as real sends, so the preview is faithful.
export interface EmailPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  subject: string;
  body: string;
}

export const EMAIL_PRESETS: EmailPreset[] = [
  {
    id: "gentle-nudge",
    name: "Gentle nudge",
    description: "Warm, low-pressure circle-back a day or two after sending.",
    category: "reminder",
    subject: "Any questions about your {{title}} quote?",
    body: `Hi {{client_name}},

Just circling back on the {{title}} proposal I sent over. Happy to walk you through anything or tweak the scope — no pressure either way.

Whenever you're ready, you can review and accept it here:
{{link}}

Thanks,
{{org}}`,
  },
  {
    id: "second-reminder",
    name: "Second reminder",
    description: "A firmer, value-forward follow-up for quotes going quiet.",
    category: "reminder",
    subject: "Still holding your spot — {{title}}",
    body: `Hi {{client_name}},

Wanted to make sure the {{title}} proposal didn't get buried. Your total comes to {{total}}, and everything's ready whenever you are.

Review & accept:
{{link}}

— {{org}}`,
  },
  {
    id: "final-notice",
    name: "Last call",
    description: "Time-sensitive nudge before the quote expires.",
    category: "reminder",
    subject: "Last call on your {{title}} quote",
    body: `Hi {{client_name}},

Quick heads-up: the {{title}} proposal ({{total}}) is about to expire. If you'd still like to move forward, you can lock it in here:
{{link}}

And if now isn't the right time, no worries at all — just let me know.

— {{org}}`,
  },
  {
    id: "thanks-for-viewing",
    name: "Thanks for looking",
    description: "Sent after a client opens the proposal — nudges the accept.",
    category: "thank-you",
    subject: "Thanks for taking a look, {{client_name}}",
    body: `Hi {{client_name}},

Thanks for reviewing the {{title}} proposal! If it looks good, you can accept it in a couple of taps:
{{link}}

And if you'd like any changes, just reply to this email and I'll sort it out.

— {{org}}`,
  },
];

// Realistic filler data so previews read like a real email, not placeholders.
export const PRESET_PREVIEW_VARS: Record<string, string> = {
  client_name: "Jordan Rivera",
  org: "Cedar & Oak Builders",
  title: "Backyard cedar fence",
  total: "$4,820",
  link: "https://app.jobflex.example/portal/q/demo",
};
