// THE QUICK LINKS BESIDE AN API (2026-09-24). Owner: "add quick links from
// the admin to the API website, in case we need to change the plan or add
// more credits." Two or three doors per service (lib/integrationLinks), each
// a new tab; nothing for a service with no console. `compact` keeps the
// first two, for the health card's narrow rows.

import { integrationLinks } from "@/lib/integrationLinks";
import { Ic } from "@/components/v3/admin-overview/admin-ui";
import s from "./integration-links.module.css";

export function IntegrationLinks({ id, compact = false }: { id: string; compact?: boolean }) {
  const links = integrationLinks(id);
  if (!links.length) return null;
  return (
    <span className={`${s.quick}${compact ? ` ${s.compact}` : ""}`} data-api-links={id}>
      {(compact ? links.slice(0, 2) : links).map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" title={`${l.label} — opens in a new tab`}>
          {l.label}
          <Ic id="i-ext" />
        </a>
      ))}
    </span>
  );
}
