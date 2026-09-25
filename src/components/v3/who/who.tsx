// The member's mark as a React element — see lib/team/who for the rule and
// who.css for the look. Import the css once per shell (the dashboard shell
// and the handheld layout do).
import { roleLabel, whoColor, whoInitials, type WhoLike } from "@/lib/team/who";
import "./who.css";

export function Who({ who, compact = false, by = false, className }: { who: WhoLike | null | undefined; compact?: boolean; by?: boolean; className?: string }) {
  const w = who && (who.id || who.name) ? who : { id: null, name: "System", role: null };
  const name = w.name?.trim() || "Someone";
  const role = w.id ? roleLabel(w.role) : "";
  return (
    <span className={`who${compact ? " who--compact" : ""}${w.id ? "" : " who--system"}${className ? ` ${className}` : ""}`} style={{ ["--who" as string]: whoColor(w.id) }} data-who={w.id ?? ""} title={name + (role ? ` · ${role}` : "")}>
      <i className="who-dot" aria-hidden="true">{whoInitials(name)}</i>
      {by ? <span className="who-by">by </span> : null}
      <b className="who-name">{name}</b>
      {role && !compact ? <em className="who-role">{role}</em> : null}
    </span>
  );
}
