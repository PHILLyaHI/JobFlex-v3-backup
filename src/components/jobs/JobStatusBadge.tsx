import { Badge } from "@/components/ui/Badge";

const map: Record<string, { tone: "accent" | "warn" | "success" | "danger" | "neutral"; label: string }> = {
  SCHEDULED: { tone: "accent", label: "Scheduled" },
  IN_PROGRESS: { tone: "warn", label: "In progress" },
  COMPLETED: { tone: "success", label: "Completed" },
  CANCELED: { tone: "danger", label: "Canceled" },
};

export function JobStatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  const m = map[status] ?? { tone: "neutral" as const, label: status };
  return (
    <Badge tone={m.tone} dot={dot}>
      {m.label}
    </Badge>
  );
}

export function statusAccent(status: string) {
  // For 3px left accent bars on event chips
  switch (status) {
    case "SCHEDULED":
      return "var(--accent)";
    case "IN_PROGRESS":
      return "#D97706"; // amber-600
    case "COMPLETED":
      return "#059669";
    case "CANCELED":
      return "#E11D48";
    default:
      return "var(--ink-muted)";
  }
}
