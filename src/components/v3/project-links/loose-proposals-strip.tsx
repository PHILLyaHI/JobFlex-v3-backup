"use client";

// "Dima Petrov has 2 proposals that aren't in a project yet — add them"
// (2026-09-18). Shown on a project whose client has proposals filed nowhere,
// so a project made for a client (or a client picked for it later) gathers
// their work in one tap instead of one attach at a time. Styled from the
// global tokens only, so both the desktop and the handheld project page can
// mount it.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addClientToProject } from "@/actions/projectLinks";
import s from "./loose-proposals-strip.module.css";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function LooseProposalsStrip({
  projectId,
  client,
  loose,
}: {
  projectId: string;
  client: { id: string; name: string } | null | undefined;
  loose: Array<{ id: string; title: string; total: number }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (!client || !loose.length || hidden) return null;

  const total = loose.reduce((n, p) => n + p.total, 0);
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await addClientToProject({ clientId: client.id, projectId, proposalIds: loose.map((p) => p.id) });
      setHidden(true);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add them.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.w}>
      <div className={s.strip} role="status">
        <div className={s.txt}>
          <b>{client.name}</b> has {loose.length} proposal{loose.length === 1 ? "" : "s"} that {loose.length === 1 ? "isn't" : "aren't"} in a
          project yet <span className={s.amt}>· {money(total)}</span>
          <span className={s.names}>{loose.map((p) => p.title).join(" · ")}</span>
          {error ? <span className={s.err}>{error}</span> : null}
        </div>
        <div className={s.acts}>
          <button type="button" className={s.ghost} onClick={() => setHidden(true)} disabled={busy}>
            Not now
          </button>
          <button type="button" className={s.primary} onClick={() => void add()} disabled={busy}>
            {busy ? "Adding…" : loose.length === 1 ? "Add it" : `Add all ${loose.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
