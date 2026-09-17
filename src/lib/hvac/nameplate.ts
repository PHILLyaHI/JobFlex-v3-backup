// Nameplate decoding — the rules part. A model number carries the capacity in
// plain sight once you know the convention (a "036" is three tons, a "080"
// furnace takes 80,000 BTU/h in); the vision model reads the plate and this
// module checks its arithmetic and fills what it left blank. Confidence is
// honest: a two-digit code that could be a tonnage or a series number is
// "low", and the screen shows it that way.

export interface ModelDecode {
  tons?: number;
  btuInput?: number;
  kindHint?: "cooling" | "furnace";
  refrigerantHint?: "R-410A" | "R-454B" | "R-32" | "R-22";
  confidence: "high" | "medium" | "low";
  notes: string[];
}

const TON_CODES: Record<string, number> = { "018": 1.5, "024": 2, "030": 2.5, "036": 3, "042": 3.5, "048": 4, "060": 5 };
const FURNACE_CODES = new Set(["040", "045", "050", "060", "070", "075", "080", "090", "100", "110", "115", "120", "125", "140"]);

export function decodeModelNumber(model: string | undefined, hint?: "cooling" | "furnace"): ModelDecode {
  const out: ModelDecode = { confidence: "low", notes: [] };
  const raw = (model ?? "").toUpperCase().replace(/\s+/g, "");
  if (!raw) return out;
  if (/R?410A?/.test(raw)) out.refrigerantHint = "R-410A";
  else if (/454B/.test(raw)) out.refrigerantHint = "R-454B";
  else if (/R32\b|R-32/.test(raw)) out.refrigerantHint = "R-32";
  else if (/R22\b|R-22/.test(raw)) out.refrigerantHint = "R-22";

  // Furnace series prefixes (Carrier 58/59, Lennox ML/EL/SLP, Trane S8/S9/TUD/TUH,
  // Goodman GM/GC, Rheem R8/R9, Amana AM, Ruud/others FG/OG). A plain "G" or
  // "XC" is a heat pump or a coil as often as a furnace, so they are not here.
  const furnaceLike = hint === "furnace" || (hint !== "cooling" && /^(58|59|ML|EL|SLP|TUD|TUH|S8|S9|GM|GC|R8|R9|AM|FG|OG)/.test(raw));
  const isLetterOrSep = (ch: string | undefined) => ch === undefined || /[A-Z\-]/.test(ch);
  if (furnaceLike) {
    for (let i = 0; i + 3 <= raw.length; i++) {
      const code = raw.slice(i, i + 3);
      if (FURNACE_CODES.has(code)) {
        out.btuInput = Number(code) * 1000;
        out.kindHint = "furnace";
        out.confidence = isLetterOrSep(raw[i + 3]) ? "medium" : "low";
        out.notes.push(`"${code}" read as ${Number(code)},000 BTU/h input.`);
        return out;
      }
    }
  }
  // Cooling sizes. Makers put the tonnage code mid-string after a series
  // number ("24ACC6 36 A", "4TTR30 36 H", "GSZ14 036 1"); the leading digits
  // are the series, never the size. Preference order: a two-digit code that is
  // not at the start and is followed by a letter; any three-digit code; a
  // two-digit code not at the start; a two-digit code at the start (low).
  const twos: Array<{ i: number; code: string; strong: boolean }> = [];
  for (let i = 0; i + 2 <= raw.length; i++) {
    const code = raw.slice(i, i + 2);
    if (TON_CODES["0" + code] === undefined) continue;
    // "…6 36 A": a size code sits after the series and before a letter.
    twos.push({ i, code, strong: i > 0 && isLetterOrSep(raw[i + 2]) });
  }
  const threes: Array<{ i: number; code: string }> = [];
  for (let i = 0; i + 3 <= raw.length; i++) {
    const code = raw.slice(i, i + 3);
    if (TON_CODES[code] !== undefined) threes.push({ i, code });
  }
  const strong = twos.find((t) => t.strong);
  const pick = strong
    ? { tons: TON_CODES["0" + strong.code], code: strong.code, confidence: "medium" as const }
    : threes.length
      ? { tons: TON_CODES[threes[0].code], code: threes[0].code, confidence: "medium" as const }
      : twos.find((t) => t.i > 0)
        ? { tons: TON_CODES["0" + twos.find((t) => t.i > 0)!.code], code: twos.find((t) => t.i > 0)!.code, confidence: "low" as const }
        : twos.length
          ? { tons: TON_CODES["0" + twos[0].code], code: twos[0].code, confidence: "low" as const }
          : null;
  if (pick) {
    out.tons = pick.tons;
    out.kindHint = "cooling";
    out.confidence = pick.confidence;
    out.notes.push(
      pick.confidence === "medium"
        ? `"${pick.code}" read as ${pick.tons} tons.`
        : `"${pick.code}" may be a ${pick.tons}-ton code — confirm against the plate's BTU rating.`,
    );
  }
  return out;
}

/** Manufacture year from a serial number, for the makers whose format is
 *  stable. Anything else stays undefined; the vision model may still read a
 *  printed date. */
export function decodeSerialYear(brand: string | undefined, serial: string | undefined): { year?: number; confidence: "medium" | "low"; note?: string } {
  const b = (brand ?? "").toLowerCase();
  const s = (serial ?? "").toUpperCase().replace(/\s+/g, "");
  if (!s) return { confidence: "low" };
  // Carrier / Bryant / Payne: WWYY then a letter — week and two-digit year.
  if (/carrier|bryant|payne/.test(b) && /^\d{4}[A-Z]/.test(s)) {
    const yy = Number(s.slice(2, 4));
    return { year: 2000 + yy, confidence: "medium", note: "Carrier-style serial: digits 3–4 are the year." };
  }
  // Lennox: plant(2) + year(2) + letter + sequence — "5806K12345" → 2006.
  if (/lennox/.test(b) && /^\d{4}[A-Z]\d{5}/.test(s)) {
    const yy = Number(s.slice(2, 4));
    return { year: 2000 + yy, confidence: "medium", note: "Lennox-style serial: digits 3–4 are the year." };
  }
  // Goodman / Amana: YYMM then digits — "1904123456" → 2019.
  if (/goodman|amana|daikin/.test(b) && /^\d{10}$/.test(s)) {
    const yy = Number(s.slice(0, 2));
    return { year: 2000 + yy, confidence: "medium", note: "Goodman-style serial: first two digits are the year." };
  }
  // Rheem / Ruud: letter + W + WW + YY … — "W301912345" style; year at 5–6.
  if (/rheem|ruud/.test(b) && /^[A-Z]?W\d{4}/.test(s)) {
    const yy = Number(s.replace(/^[A-Z]?W/, "").slice(2, 4));
    return { year: 2000 + yy, confidence: "low", note: "Rheem-style serial: year read from the week-year block." };
  }
  return { confidence: "low" };
}
