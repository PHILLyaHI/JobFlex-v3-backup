"use client";
/**
 * THE ANALYST'S EXPORTS (2026-10-04), in its card's head: the reading as
 * Markdown to the clipboard, the reading with every session behind it as
 * JSON, and the sessions as CSV. The Markdown is the reading on screen; the
 * files ask the server for the sessions (the same ten-minute cache).
 */
import { useState } from "react";
import { Braces, ClipboardCopy, FileSpreadsheet } from "lucide-react";
import { getAnalystExport } from "@/actions/trafficExport";
import type { AnalystResult } from "@/lib/traffic-analyst-read";
import { analystPeriod, analystToMarkdown, downloadText, sessionsToCsv } from "@/lib/traffic-export";
import { toast } from "@/components/ui/toast-store";
import s from "./traffic.module.css";

/** The clipboard, or the old copy command where the page is not allowed it. */
async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); return; } catch { /* not allowed here: the fallback */ }
  const area = document.createElement("textarea");
  area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
  document.body.appendChild(area); area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("The browser refused the clipboard.");
}

export function AnalystExport({ result, timezone }: { result: AnalystResult | null; timezone: string }) {
  const [busy, setBusy] = useState<"" | "json" | "csv">("");
  const ok = result?.status === "ok";

  async function copy() {
    if (!result) return;
    try { await copyText(analystToMarkdown(result, { timezone })); toast.success("Copied as Markdown", `${result.report.findings.length} findings, the funnel, every ad and trade.`); }
    catch (err) { toast.error("Could not copy", err instanceof Error ? err.message : undefined); }
  }
  async function download(kind: "json" | "csv") {
    setBusy(kind);
    try {
      const x = await getAnalystExport({ timezone });
      const name = `jobflex-analyst-${analystPeriod(x.result, timezone)}`;
      if (kind === "json") downloadText(`${name}.json`, JSON.stringify(x, null, 2), "application/json");
      else downloadText(`${name}-sessions.csv`, sessionsToCsv(x.sessions, x.adNames), "text/csv;charset=utf-8;");
      toast.success(kind === "json" ? "JSON downloaded" : "Sessions CSV downloaded", `${x.sessions.length.toLocaleString("en-US")} sessions.`);
    } catch (err) { toast.error("Could not export", err instanceof Error ? err.message : undefined); }
    finally { setBusy(""); }
  }

  return <>
    <button type="button" className={s.button} onClick={() => void copy()} disabled={!result}><ClipboardCopy size={15} aria-hidden="true"/>Copy as Markdown</button>
    <button type="button" className={s.button} onClick={() => void download("json")} disabled={!ok || !!busy} aria-busy={busy === "json"}><Braces size={15} aria-hidden="true"/>{busy === "json" ? "Preparing…" : "Download JSON"}</button>
    <button type="button" className={s.button} onClick={() => void download("csv")} disabled={!ok || !!busy} aria-busy={busy === "csv"}><FileSpreadsheet size={15} aria-hidden="true"/>{busy === "csv" ? "Preparing…" : "Download sessions CSV"}</button>
  </>;
}
