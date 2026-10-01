// The example house's nameplate photos (2026-10-01): three plates drawn as
// SVG — the outdoor unit's rating plate, the furnace's, the panel door open —
// as data URLs, so the intake step shows a thumbnail the way a photographed
// plate does, with no image file and no vendor's plate copied.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function plate(title: string, rows: Array<[string, string]>, opts: { tone: string; w?: number; h?: number; stamp?: string }): string {
  const w = opts.w ?? 480;
  const h = opts.h ?? 320;
  const lines = rows
    .map(([k, v], i) => `<text x="36" y="${118 + i * 30}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="13" fill="#222" letter-spacing="1.5">${esc(k.toUpperCase())}</text><text x="${w - 36}" y="${118 + i * 30}" text-anchor="end" font-family="JetBrains Mono, ui-monospace, monospace" font-size="15" font-weight="700" fill="#111">${esc(v)}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="${opts.tone}"/>
<rect x="18" y="18" width="${w - 36}" height="${h - 36}" rx="6" fill="#e9e6df" stroke="#8a8780" stroke-width="2"/>
<rect x="18" y="18" width="${w - 36}" height="${h - 36}" rx="6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1" transform="translate(2 2)"/>
<circle cx="40" cy="40" r="5" fill="#7a7770"/><circle cx="${w - 40}" cy="40" r="5" fill="#7a7770"/><circle cx="40" cy="${h - 40}" r="5" fill="#7a7770"/><circle cx="${w - 40}" cy="${h - 40}" r="5" fill="#7a7770"/>
<text x="36" y="78" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="900" fill="#111" letter-spacing="2">${esc(title)}</text>
<line x1="36" y1="90" x2="${w - 36}" y2="90" stroke="#8a8780" stroke-width="1.5"/>
${lines}
${opts.stamp ? `<text x="${w - 36}" y="${h - 46}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#8a2a1c" letter-spacing="2">${esc(opts.stamp)}</text>` : ""}
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

export const PLATE_OUTDOOR = plate(
  "CONDENSING UNIT",
  [["Model", "AC13-036"], ["Serial", "0912A4471"], ["Nominal", "3 TON · 36,000 BTU/H"], ["Refrigerant", "R-410A · 7 lb 4 oz"], ["Volts · MCA", "208/230 · 22.5 A"], ["Mfd", "2009"]],
  { tone: "#5b6b63", stamp: "EXAMPLE PLATE" },
);

export const PLATE_INDOOR = plate(
  "GAS FURNACE",
  [["Model", "G80-080"], ["Serial", "0309K1127"], ["Input", "80,000 BTU/H"], ["Output", "64,000 BTU/H · 80% AFUE"], ["Gas", "NATURAL · 3.5 in wc"], ["Mfd", "2003"]],
  { tone: "#6a6560", stamp: "EXAMPLE PLATE" },
);

function panel(): string {
  const w = 480;
  const h = 320;
  const breakers = Array.from({ length: 16 }, (_, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 150 + col * 100;
    const y = 112 + row * 22;
    const free = i >= 12;
    return `<rect x="${x}" y="${y}" width="80" height="16" rx="2" fill="${free ? "#3b3b3b" : "#1a1a1a"}" stroke="#555"/><rect x="${x + (col ? 56 : 8)}" y="${y + 3}" width="16" height="10" rx="1" fill="${free ? "#777" : "#d8d4cc"}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<rect width="${w}" height="${h}" fill="#8f8a82"/>
<rect x="110" y="28" width="260" height="270" rx="4" fill="#b9b5ad" stroke="#4a4845" stroke-width="3"/>
<rect x="150" y="48" width="180" height="40" rx="3" fill="#1a1a1a"/>
<rect x="222" y="54" width="36" height="28" rx="2" fill="#d8d4cc"/>
<text x="240" y="100" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-size="12" font-weight="700" fill="#111" letter-spacing="2">MAIN 200 A</text>
${breakers}
<text x="240" y="290" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="#8a2a1c" letter-spacing="2">EXAMPLE PANEL · 4 FREE</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

export const PLATE_PANEL = panel();
