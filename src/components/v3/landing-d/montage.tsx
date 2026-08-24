import Image from "next/image";
import { MontageColumns } from "./montage-carousel";
import { Reveal } from "./reveal";

function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-slate-100 bg-white px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
      </div>
      {children}
    </div>
  );
}

function Photo({ src, label }: { src: string; label?: string }) {
  return (
    <div className="relative">
      <Image
        src={src}
        alt={label ?? "Job site photo"}
        width={640}
        height={430}
        sizes="(max-width: 640px) 248px, (max-width: 1280px) 33vw, 20vw"
        className="block w-full"
      />
      {label && (
        <span className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-lp-ink">
          {label}
        </span>
      )}
    </div>
  );
}

function DocRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-[7px]">
      {rows.map(([l, r]) => (
        <div key={l} className="flex items-center justify-between text-[10.5px]">
          <span className="text-slate-500">{l}</span>
          <span className="font-semibold text-lp-ink">{r}</span>
        </div>
      ))}
    </div>
  );
}

/* Each tile once; `mobile` marks the subset shown in the phone swipe strip */
const TILES: { key: string; mobile?: boolean; node: React.ReactNode }[] = [
  {
    key: "estimate",
    mobile: true,
    node: (
      <div className="p-4">
        <div className="text-[11px] font-bold text-lp-ink">Estimate #E-2214</div>
        <div className="text-[9.5px] text-slate-400">Ortiz hall bath · Standard tier</div>
        <div className="mt-3">
          <DocRows
            rows={[
              ["Tile, porcelain 12×24", "$1,184"],
              ["Waterproofing kit", "$312"],
              ["Glass door, framed", "$980"],
              ["Vanity + top", "$1,420"],
              ["Labor — demo & set", "$4,300"],
            ]}
          />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
          <span className="text-[10px] text-slate-400">Total</span>
          <span className="text-[13px] font-bold text-lp-ink">$11,400</span>
        </div>
      </div>
    ),
  },
  {
    key: "photo-nguyen",
    mobile: true,
    node: <Photo src="/landing-d/project-1.jpg" label="Nguyen kitchen · day 12" />,
  },
  {
    key: "quote-gold",
    mobile: true,
    node: (
      <div className="bg-lp-gold p-5">
        <div className="font-serif text-[17px] font-bold leading-snug text-lp-ink">
          &ldquo;We quoted the Hendersons&rsquo; kitchen from the truck —
          before the other guy called back.&rdquo;
        </div>
        <div className="mt-3 text-[10.5px] font-semibold text-lp-ink/60">
          Reyes &amp; Sons Remodeling
        </div>
      </div>
    ),
  },
  {
    key: "schedule",
    mobile: true,
    node: (
      <div className="p-4">
        <div className="text-[11px] font-bold text-lp-ink">This week</div>
        <div className="mt-2.5 space-y-[6px]">
          {[
            ["MON", "Demo — Kowalski basement", "bg-sky-100 text-sky-700"],
            ["TUE", "Tile set — Ortiz bath", "bg-amber-100 text-amber-700"],
            ["WED", "Inspection @ 10:30", "bg-rose-100 text-rose-700"],
            ["THU", "Cabinets — Nguyen", "bg-violet-100 text-violet-700"],
            ["FRI", "Punch list + walkthrough", "bg-emerald-100 text-emerald-700"],
          ].map(([d, t, c]) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-7 text-[9px] font-bold text-slate-400">{d}</span>
              <span className={`flex-1 rounded px-2 py-[5px] text-[10px] font-medium ${c}`}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: "portal",
    node: (
      <Chrome>
        <div className="bg-gradient-to-b from-pink-100 to-pink-200 p-4">
          <div className="rounded-lg bg-white p-3.5 shadow-sm">
            <div className="text-[11px] font-bold text-lp-ink">Review &amp; approve</div>
            <div className="mt-1 text-[9.5px] text-slate-400">Deck rebuild — $16,900</div>
            <div className="mt-2.5 h-8 rounded border border-dashed border-slate-300 bg-slate-50" />
            <div className="mt-2 rounded bg-lp-base py-1.5 text-center text-[10px] font-semibold text-white">
              Approve &amp; sign
            </div>
          </div>
        </div>
      </Chrome>
    ),
  },
  {
    key: "photo-tile",
    node: <Photo src="/landing-d/service-tile.jpg" label="Ortiz bath · tile day" />,
  },
  {
    key: "sms",
    mobile: true,
    node: (
      <div className="p-4">
        <div className="text-[11px] font-bold text-lp-ink">Messages · Nguyen</div>
        <div className="mt-2.5 space-y-[6px]">
          <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-700">
            Can the crew start Tuesday instead?
          </div>
          <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-sky-500 px-2.5 py-1.5 text-[10px] text-white">
            Yes — moved. Calendar updated ✓
          </div>
          <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-700">
            Perfect, thank you!
          </div>
        </div>
        <div className="mt-2.5 text-[9px] text-slate-300">via SMS · logged to job</div>
      </div>
    ),
  },
  {
    key: "invoice",
    mobile: true,
    node: (
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold text-lp-ink">Invoice #1042</div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
            PAID
          </span>
        </div>
        <div className="mt-1 text-[9.5px] text-slate-400">Progress draw 2 of 3</div>
        <div className="mt-3 text-[22px] font-bold tracking-tight text-lp-ink">$6,400</div>
        <div className="mt-2 text-[9.5px] text-slate-400">Paid by card · 2 hrs after sending</div>
      </div>
    ),
  },
  {
    key: "photo-deck",
    node: <Photo src="/landing-d/project-3.jpg" label="Hendersons · backsplash set" />,
  },
  {
    key: "quote-dark",
    node: (
      <div className="bg-lp-base p-5">
        <div className="font-serif text-[17px] leading-snug text-white">
          &ldquo;Every receipt, text, and change order — one place. My
          Sunday paperwork night is gone.&rdquo;
        </div>
        <div className="mt-3 text-[10.5px] font-semibold text-white/50">
          Meridian Tile &amp; Stone
        </div>
      </div>
    ),
  },
  {
    key: "receipt",
    mobile: true,
    node: (
      <div className="p-4">
        <div className="text-[11px] font-bold text-lp-ink">Receipt scanned</div>
        <div className="mt-1 text-[9.5px] text-slate-400">Big-box run · 8:12 AM</div>
        <div className="mt-3">
          <DocRows
            rows={[
              ["2×4×8 stud ×24", "$102.72"],
              ["Joint compound ×3", "$51.84"],
              ["Screws, box", "$28.90"],
            ]}
          />
        </div>
        <div className="mt-3 rounded bg-lp-lime/30 px-2 py-1.5 text-[10px] font-semibold text-lp-ink">
          +$183.46 → Kowalski basement
        </div>
      </div>
    ),
  },
  {
    key: "photo-walkthrough",
    node: <Photo src="/landing-d/project-5.jpg" label="Client walkthrough" />,
  },
  {
    key: "change-order",
    mobile: true,
    node: (
      <div className="p-4">
        <div className="text-[11px] font-bold text-lp-ink">Change order #3</div>
        <div className="mt-1 text-[9.5px] text-slate-400">Add recessed lighting ×6</div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13px] font-bold text-lp-ink">+$1,240</span>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold text-sky-700">
            SIGNED
          </span>
        </div>
        <div className="mt-2.5 font-serif text-[15px] italic text-slate-400">M. Nguyen</div>
      </div>
    ),
  },
  {
    key: "crew",
    mobile: true,
    node: (
      <div className="bg-lp-navy p-4">
        <div className="text-[11px] font-bold text-white">Crew — today</div>
        <div className="mt-2.5 space-y-[6px]">
          {[
            ["Demo cabinets, haul out", true],
            ["Rough-in plumbing moves", true],
            ["Hang drywall, north wall", false],
            ["Photos of panel before close", false],
          ].map(([t, done]) => (
            <div key={t as string} className="flex items-center gap-2">
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-bold ${
                  done ? "bg-lp-lime text-lp-base" : "border border-white/20 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className={`text-[10px] ${done ? "text-white/40 line-through" : "text-white/85"}`}>
                {t}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: "photo-design",
    node: <Photo src="/landing-d/service-design.jpg" label="Design sign-off" />,
  },
];

export function Montage() {
  return (
    <section className="bg-white py-[9vmin]">
      <Reveal>
        {/* Mobile: 3 vertical columns, each an infinite top-to-bottom loop
            (GSAP, velocity-reactive) */}
        <div className="sm:hidden">
          <MontageColumns
            columns={(() => {
              const nodes = TILES.filter((t) => t.mobile).map((t) => t.node);
              // round-robin so each column mixes photos, docs, and quotes
              const cols: React.ReactNode[][] = [[], [], []];
              nodes.forEach((n, i) => cols[i % 3].push(n));
              return cols;
            })()}
          />
        </div>

        {/* Desktop: masonry */}
        <div className="mx-auto hidden max-w-[92rem] columns-2 gap-4 px-4 sm:block sm:columns-3 sm:px-6 xl:columns-5 [&>*]:mb-4">
          {TILES.map((t) => (
            <div key={t.key} className="lp-tile">
              {t.node}
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
