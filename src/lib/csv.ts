export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const body = rows
    .map((r) => columns.map((c) => encodeCell(r[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

function encodeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);

  // CSV formula-injection defense: a cell that a spreadsheet would parse as a
  // formula (leading = + - @, or a leading tab/CR that some parsers strip) is
  // prefixed with a single quote so Excel/Sheets treat it as literal text. These
  // cells contain attacker-influenceable free text (lead/client names submitted
  // via the public homeowner form), so neutralize before the quoting below.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;

  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
