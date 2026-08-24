"use client";

import { useEffect, useState } from "react";
import { EstimatorsMobile } from "./estimators-mobile";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

type Store = "Home Depot" | "Lowe's" | "Amazon";

const STORE_COLOR: Record<Store, string> = {
  "Home Depot": "text-orange-600",
  "Lowe's": "text-sky-600",
  Amazon: "text-amber-600",
};

const SLIDE_MS = 8400;
const VARIANT_MS = 2600;

/* ---------------- shared mock pieces (white / black) ---------------- */

function TypedField({ text }: { text: string }) {
  return (
    <div className="mt-5">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
        Project
      </div>
      <div className="mt-2 flex h-10 items-center rounded-md border border-slate-200 bg-lp-paper px-3.5 text-[13.5px] text-lp-ink">
        <span className="truncate">{text}</span>
        <span
          className="ml-[1px] inline-block h-[15px] w-[1.5px] shrink-0 bg-lp-ink"
          style={{ animation: "caret 1s step-end infinite" }}
        />
      </div>
    </div>
  );
}

function Segmented({
  label,
  options,
  active,
  onPick,
}: {
  label: string;
  options: readonly string[];
  active: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="mt-5">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 grid grid-cols-3 rounded-md bg-slate-100 p-[3px] text-center text-[12.5px] font-semibold">
        {options.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(i)}
            className={`rounded-[5px] py-2 transition-all duration-300 ${
              i === active ? "bg-white text-lp-ink shadow-sm" : "text-slate-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chips({ label, chips }: { label: string; chips: [string, boolean?][] }) {
  return (
    <div className="mt-5 space-y-2">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([c, hot]) => (
          <span
            key={c}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
              hot ? "bg-lp-paper text-lp-ink ring-1 ring-slate-300" : "bg-slate-100 text-slate-600"
            }`}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function LaborRow({ value, note }: { value: string; note?: string }) {
  return (
    <div className="mt-5 flex items-center justify-between rounded-md border border-slate-200 px-3.5 py-3">
      <span className="text-[12.5px] font-medium text-slate-500">Local labor</span>
      <span className="text-[13.5px] font-bold text-lp-ink">
        {value}{" "}
        {note ? (
          <span key={note} className="text-[10.5px] font-bold text-amber-600" style={{ animation: "toast-in .35s" }}>
            {note}
          </span>
        ) : (
          <span className="font-medium text-slate-400">est.</span>
        )}
      </span>
    </div>
  );
}

function TotalRow({ total }: { total: string }) {
  return (
    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-5">
      <div>
        <div className="text-[11.5px] text-slate-400">Estimate total</div>
        <div
          key={total}
          className="text-[24px] font-bold tracking-tight text-lp-ink"
          style={{ animation: "toast-in .4s cubic-bezier(.2,.6,.2,1)" }}
        >
          {total}
        </div>
      </div>
      <span className="lp-btn-dark cursor-default">Send as proposal</span>
    </div>
  );
}

function StaticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-5 flex items-center justify-between rounded-md border border-slate-200 px-3.5 py-3">
      <span className="text-[12.5px] font-medium text-slate-500">{label}</span>
      <span className="text-[13.5px] font-bold text-lp-ink">{value}</span>
    </div>
  );
}

function MaterialRow({ name, qty, price, store }: { name: string; qty: string; price: string; store: Store }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md bg-lp-paper px-3.5 py-2.5 ring-1 ring-slate-100"
      style={{ animation: "toast-in .45s cubic-bezier(.2,.6,.2,1)" }}
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-lp-ink">{name}</div>
        <div className="text-[11px] text-slate-400">Needs {qty}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13.5px] font-bold text-lp-ink">{price}</div>
        <a href="#" className={`text-[11px] font-semibold hover:underline ${STORE_COLOR[store]}`}>
          Buy at {store} ↗
        </a>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-lp-card ring-1 ring-slate-200">
      {children}
    </div>
  );
}

function SetupCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="relative z-10 rounded-xl bg-white p-6 shadow-lp-card ring-1 ring-slate-200 sm:-mr-3 sm:mt-8">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-lp-ink">{title}</span>
        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
      </div>
      {children}
    </div>
  );
}

/* ---------------- slide 1 · kitchen ---------------- */

const KITCHEN_TIERS = ["Budget", "Standard", "Luxury"] as const;

const KITCHEN = [
  {
    labor: "$6,400",
    total: "$18,240",
    materials: [
      { name: "Stock oak cabinets", qty: "14 ln ft", price: "$3,180", store: "Home Depot" as Store },
      { name: "Laminate countertop", qty: "42 sf", price: "$588", store: "Lowe's" as Store },
      { name: "LVP flooring", qty: "128 sf + 10%", price: "$370", store: "Home Depot" as Store },
      { name: "Single-bowl sink & faucet", qty: "×1", price: "$148", store: "Amazon" as Store },
    ],
  },
  {
    labor: "$8,200",
    total: "$27,860",
    materials: [
      { name: "Semi-custom maple shaker", qty: "14 ln ft", price: "$8,400", store: "Lowe's" as Store },
      { name: "Quartz countertop", qty: "42 sf", price: "$2,436", store: "Home Depot" as Store },
      { name: "Engineered oak floor", qty: "128 sf + 10%", price: "$691", store: "Lowe's" as Store },
      { name: "Undermount sink & faucet", qty: "×1", price: "$412", store: "Amazon" as Store },
    ],
  },
  {
    labor: "$11,900",
    total: "$52,410",
    materials: [
      { name: "Custom inset walnut", qty: "14 ln ft", price: "$19,600", store: "Lowe's" as Store },
      { name: "Marble countertop", qty: "42 sf", price: "$5,082", store: "Home Depot" as Store },
      { name: "Wide-plank white oak", qty: "128 sf + 10%", price: "$1,434", store: "Lowe's" as Store },
      { name: "Workstation sink & pot filler", qty: "×1", price: "$1,240", store: "Amazon" as Store },
    ],
  },
];

function KitchenMock({ typed, variant, onPick }: { typed: string; variant: number; onPick: (i: number) => void }) {
  const d = KITCHEN[variant];
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
      <SetupCard title="New estimate">
        <TypedField text={typed} />
        <Segmented label="Quality tier" options={KITCHEN_TIERS} active={variant} onPick={onPick} />
        <Chips label="Waste factors" chips={[["Drywall & tile +10%"], ["Lumber +15%"], ["Round to pack size"]]} />
        <LaborRow value={d.labor} />
        <TotalRow total={d.total} />
      </SetupCard>

      <Panel>
        <div className="flex items-baseline justify-between border-b border-slate-100 px-6 py-4">
          <span className="text-[14px] font-bold text-lp-ink">Live material list</span>
          <span className="text-[11.5px] text-slate-400">Updated 2 min ago</span>
        </div>
        <div className="space-y-2 p-6 pt-5">
          {d.materials.map((row) => (
            <MaterialRow key={row.name} {...row} />
          ))}
          <div className="pt-2 text-[11px] text-slate-400">
            Priced live via Google Shopping — Home Depot, Lowe&rsquo;s &amp; Amazon
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- slide 2 · roof ---------------- */

const PITCHES = ["4/12", "8/12", "12/12"] as const;

const ROOF = [
  { labor: "$5,900", note: undefined, total: "$12,480", deposit: "$3,744", balance: "$8,736", rise: 24 },
  { labor: "$6,610", note: "+12% pitch", total: "$13,190", deposit: "$3,957", balance: "$9,233", rise: 46 },
  { labor: "$7,550", note: "+28% steep", total: "$14,130", deposit: "$4,239", balance: "$9,891", rise: 62 },
];

function RoofMock({ typed, variant, onPick }: { typed: string; variant: number; onPick: (i: number) => void }) {
  const d = ROOF[variant];
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
      <SetupCard title="New estimate — roof">
        <TypedField text={typed} />
        <StaticRow label="Roof size" value="17.6 squares · 1,760 sq ft" />
        <Segmented label="Pitch" options={PITCHES} active={variant} onPick={onPick} />
        <Chips label="Adjustments" chips={[["Shingles +10% waste"], ["Round to bundles"], ["EagleView geometry ✓", true]]} />
        <LaborRow value={d.labor} note={d.note} />
        <TotalRow total={d.total} />
      </SetupCard>

      <Panel>
        {/* Pitch visualizer */}
        <div className="relative border-b border-slate-100 bg-lp-paper px-6 pb-2 pt-4">
          <svg viewBox="0 0 240 104" className="w-full" aria-hidden>
            <rect x="66" y="72" width="108" height="26" rx="2" fill="#0f172a" fillOpacity="0.04" stroke="#0f172a" strokeOpacity="0.14" />
            <line x1="30" y1="98" x2="210" y2="98" stroke="#0f172a" strokeOpacity="0.14" />
            {ROOF.map((r, i) => (
              <g
                key={PITCHES[i]}
                style={{ opacity: variant === i ? 1 : 0, transition: "opacity .5s cubic-bezier(.2,.6,.2,1)" }}
              >
                <path d={`M46 72 L120 ${72 - r.rise} L194 72`} fill="#635bff" fillOpacity="0.08" />
                <path
                  d={`M46 72 L120 ${72 - r.rise} L194 72`}
                  fill="none"
                  stroke="#635bff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
          </svg>
          <div className="absolute right-7 top-4 text-right">
            <div key={PITCHES[variant]} className="text-[20px] font-bold text-lp-ink" style={{ animation: "toast-in .4s" }}>
              {PITCHES[variant]}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">pitch</div>
          </div>
        </div>

        <div className="p-6 pt-5">
          <div className="text-[14px] font-bold text-lp-ink">Priced for your zip code</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
            Labor climbs with the pitch. Materials round up for waste.
          </p>
          <div className="mt-4 space-y-2">
            <MaterialRow name="Architectural shingles" qty="56 bundles (incl. waste)" price="$2,970" store="Home Depot" />
            <MaterialRow name="Synthetic underlayment" qty="×4 rolls" price="$356" store="Lowe's" />
          </div>
          {/* One-click proposal payment schedule */}
          <div className="mt-4 rounded-md bg-lp-paper p-3.5 ring-1 ring-slate-100">
            <div className="text-[10px] font-bold uppercase tracking-[1px] text-slate-400">
              One-click proposal · payment schedule
            </div>
            <div className="mt-2.5 flex h-2 overflow-hidden rounded-full">
              <span className="w-[30%] bg-[#635bff]" />
              <span className="flex-1 bg-slate-200" />
            </div>
            <div className="mt-2 flex items-baseline justify-between text-[11.5px]">
              <span className="font-semibold text-[#635bff]">
                30% deposit ·{" "}
                <span key={d.deposit} style={{ animation: "toast-in .4s" }}>{d.deposit}</span>
              </span>
              <span className="text-slate-500">70% on completion · {d.balance}</span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- slide 3 · fence ---------------- */

const FENCE_MATS = ["Cedar", "Vinyl", "Chainlink"] as const;

const FENCE = [
  {
    labor: "$2,900",
    total: "$6,540",
    materials: [
      { name: "Cedar pickets", qty: "×264 (incl. 10%)", price: "$1,850", store: "Home Depot" as Store },
      { name: "Cedar posts 4×4×8", qty: "×16", price: "$704", store: "Lowe's" as Store },
      { name: "Concrete 50 lb", qty: "×32 bags", price: "$218", store: "Home Depot" as Store },
      { name: "Gate hardware kit", qty: "×2", price: "$148", store: "Amazon" as Store },
    ],
  },
  {
    labor: "$2,600",
    total: "$7,910",
    materials: [
      { name: "Vinyl panels 6×8", qty: "×15", price: "$2,890", store: "Lowe's" as Store },
      { name: "Steel-core posts", qty: "×16", price: "$1,120", store: "Home Depot" as Store },
      { name: "Concrete 50 lb", qty: "×32 bags", price: "$218", store: "Home Depot" as Store },
      { name: "Gate kit, self-closing", qty: "×2", price: "$196", store: "Amazon" as Store },
    ],
  },
  {
    labor: "$2,100",
    total: "$4,310",
    materials: [
      { name: "Chainlink mesh, 6 ft", qty: "120 lf", price: "$860", store: "Home Depot" as Store },
      { name: "Galv. posts & top rail", qty: "×1 kit", price: "$740", store: "Lowe's" as Store },
      { name: "Concrete 50 lb", qty: "×28 bags", price: "$190", store: "Home Depot" as Store },
      { name: "Gate hardware kit", qty: "×2", price: "$122", store: "Amazon" as Store },
    ],
  },
];

function FenceArt({ variant }: { variant: number }) {
  const POSTS = [28, 90, 152, 214];
  return (
    <svg viewBox="0 0 240 104" className="w-full" aria-hidden>
      <defs>
        <pattern id="mesh-d" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 5 L5 0 L10 5 L5 10 Z" fill="none" stroke="#94a3b8" strokeWidth="1" />
        </pattern>
      </defs>
      <ellipse cx="120" cy="97" rx="104" ry="5" fill="#0f172a" fillOpacity="0.06" />
      {/* cedar */}
      <g style={{ opacity: variant === 0 ? 1 : 0, transition: "opacity .5s cubic-bezier(.2,.6,.2,1)" }}>
        {POSTS.map((x) => (
          <rect key={x} x={x - 4} y="24" width="8" height="72" rx="1.5" fill="#92400e" />
        ))}
        {[0, 1, 2].map((seg) =>
          [0, 1, 2, 3, 4].map((p) => (
            <rect
              key={`${seg}-${p}`}
              x={POSTS[seg] + 8 + p * 11}
              y="32"
              width="8"
              height="62"
              rx="1"
              fill={p % 2 ? "#b45309" : "#d97706"}
            />
          ))
        )}
        <line x1="24" y1="36" x2="218" y2="36" stroke="#78350f" strokeWidth="3" />
      </g>
      {/* vinyl */}
      <g style={{ opacity: variant === 1 ? 1 : 0, transition: "opacity .5s cubic-bezier(.2,.6,.2,1)" }}>
        {POSTS.map((x) => (
          <rect key={x} x={x - 5} y="22" width="10" height="74" rx="2" fill="#cbd5e1" />
        ))}
        {[0, 1, 2].map((seg) => (
          <g key={seg}>
            <rect x={POSTS[seg] + 6} y="30" width={POSTS[seg + 1] - POSTS[seg] - 12} height="62" rx="2" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />
            <line x1={POSTS[seg] + 8} y1="51" x2={POSTS[seg + 1] - 8} y2="51" stroke="#cbd5e1" strokeWidth="1.5" />
            <line x1={POSTS[seg] + 8} y1="72" x2={POSTS[seg + 1] - 8} y2="72" stroke="#cbd5e1" strokeWidth="1.5" />
          </g>
        ))}
      </g>
      {/* chainlink */}
      <g style={{ opacity: variant === 2 ? 1 : 0, transition: "opacity .5s cubic-bezier(.2,.6,.2,1)" }}>
        {POSTS.map((x) => (
          <rect key={x} x={x - 2.5} y="26" width="5" height="70" rx="2" fill="#94a3b8" />
        ))}
        <line x1="26" y1="30" x2="216" y2="30" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
        <rect x="28" y="34" width="184" height="60" fill="url(#mesh-d)" opacity="0.8" />
      </g>
    </svg>
  );
}

function FenceMock({ typed, variant, onPick }: { typed: string; variant: number; onPick: (i: number) => void }) {
  const d = FENCE[variant];
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
      <SetupCard title="New estimate — fence">
        <TypedField text={typed} />
        <StaticRow label="Layout" value="120 linear ft · 6 ft tall" />
        <Segmented label="Material" options={FENCE_MATS} active={variant} onPick={onPick} />
        <Chips label="Site details" chips={[["Gates × 2 + hardware"], ["Sloped yard — stepped panels", true]]} />
        <LaborRow value={d.labor} />
        <TotalRow total={d.total} />
      </SetupCard>

      <Panel>
        {/* 3D preview */}
        <div className="relative border-b border-slate-100 bg-lp-paper px-6 pb-2 pt-4">
          <FenceArt variant={variant} />
          <span className="absolute right-7 top-4 flex items-center gap-1.5 rounded-full bg-lp-ink px-2.5 py-1 text-[10px] font-bold text-white shadow-lp-card">
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
              <rect x="1.5" y="4.5" width="13" height="9" rx="2" fill="currentColor" />
              <path d="M5.5 4.5L7 2.5h2l1.5 2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="9" r="2.4" fill="#15171a" />
            </svg>
            PNG attached ✓
          </span>
        </div>

        <div className="p-6 pt-5">
          <div className="text-[14px] font-bold text-lp-ink">See the fence before the first post</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
            A 3D snapshot rides along with the proposal.
          </p>
          <div className="mt-4 space-y-2">
            {d.materials.map((row) => (
              <MaterialRow key={row.name} {...row} />
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- section ---------------- */

const SLIDES = [
  {
    key: "kitchen",
    label: "Kitchen estimator",
    typed: "Remodel a 10×10 kitchen",
    example: "remodel a 10×10 kitchen",
    detail:
      "Pick a quality tier and JobFlex applies trade waste factors and rounds to pack sizes.",
  },
  {
    key: "roof",
    label: "Roof estimator",
    typed: "Reroof a 1,600 sq ft ranch",
    example: "reroof a 1,600 sq ft ranch",
    detail:
      "Set the pitch and JobFlex raises labor for steep slopes, reading geometry from an EagleView report.",
  },
  {
    key: "fence",
    label: "Fence estimator",
    typed: "Build 120 lf of cedar privacy fence",
    example: "run 120 feet of privacy fence",
    detail:
      "Choose the material and JobFlex counts pickets, posts, concrete, and gates — with a 3D preview.",
  },
];

export function EstimatorSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const [slide, setSlide] = useState(0);
  const [run, setRun] = useState(0); // bumps to restart the progress animation
  const [variant, setVariant] = useState(0); // tier / pitch / material per slide
  const [typed, setTyped] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const s = SLIDES[slide];

  const goTo = (n: number) => {
    setSlide(((n % SLIDES.length) + SLIDES.length) % SLIDES.length);
    setVariant(0);
    setTyped(0);
    setRun((r) => r + 1);
  };

  // Type the project description once visible
  useEffect(() => {
    if (!inView || reduced) return;
    if (typed >= s.typed.length) return;
    const t = setTimeout(() => setTyped((n) => n + 1), 42 + Math.random() * 55);
    return () => clearTimeout(t);
  }, [inView, typed, s.typed.length, reduced, slide]);

  useEffect(() => {
    if (!reduced) return;
    const id = requestAnimationFrame(() => setTyped(s.typed.length));
    return () => cancelAnimationFrame(id);
  }, [reduced, s.typed.length]);

  // Cycle the slide's variant (tier / pitch / material) after typing completes
  useEffect(() => {
    if (!inView || paused || reduced) return;
    if (typed < s.typed.length) return;
    const t = setInterval(() => setVariant((n) => (n + 1) % 3), VARIANT_MS);
    return () => clearInterval(t);
  }, [inView, paused, reduced, typed, s.typed.length, slide]);

  const typedText = s.typed.slice(0, typed);

  return (
    <>
    <div className="sm:hidden">
      <EstimatorsMobile />
    </div>
    <section className="relative hidden overflow-hidden bg-lp-navy px-5 py-[9vmin] sm:block sm:px-6">
      <div className="mx-auto lp-wrap">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          {/* Text column */}
          <Reveal>
            <h2 className="lp-eyebrow text-slate-400">AI estimating</h2>
            <p className="mt-5 text-[clamp(34px,3.4vw,52px)] font-bold leading-[1.06] tracking-[-0.015em] text-white">
              Estimates for every job.
            </p>
            <div className="mt-7 max-w-md space-y-5 text-[18px] leading-[1.55] text-slate-200">
              <p>
                Describe the job —{" "}
                <span
                  key={s.key}
                  className="font-semibold text-white"
                  style={{ animation: "toast-in .5s cubic-bezier(.2,.6,.2,1)" }}
                >
                  &ldquo;{s.example}&rdquo;
                </span>{" "}
                — and JobFlex plans the materials, prices them at live retail,
                and adds labor for your market.
              </p>
              <p key={`detail-${s.key}`} style={{ animation: "toast-in .5s cubic-bezier(.2,.6,.2,1)" }}>
                {s.detail}
              </p>
            </div>
            <a
              href="#"
              className="mt-9 inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-[15px] font-semibold text-lp-base transition-colors duration-200 hover:bg-slate-100"
            >
              Create Estimate
            </a>
          </Reveal>

          {/* Mock column (slideshow) */}
          <div
            ref={ref}
            className="relative"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
          >
            <Reveal delay={120}>
              <div key={s.key} style={{ animation: "toast-in .5s cubic-bezier(.2,.6,.2,1)" }}>
                {slide === 0 && <KitchenMock typed={typedText} variant={variant} onPick={setVariant} />}
                {slide === 1 && <RoofMock typed={typedText} variant={variant} onPick={setVariant} />}
                {slide === 2 && <FenceMock typed={typedText} variant={variant} onPick={setVariant} />}
              </div>
            </Reveal>
          </div>
        </div>

        {/* Slideshow controls */}
        <Reveal delay={160}>
          <div className="mt-14 flex items-center justify-center gap-6">
            <button
              type="button"
              aria-label="Previous estimator"
              onClick={() => goTo(slide - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:border-white/40 hover:text-white"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path d="M10 2.5L4.5 8 10 13.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="flex items-center gap-2.5">
              {SLIDES.map((sl, i) => (
                <button
                  key={sl.key}
                  type="button"
                  aria-label={sl.label}
                  onClick={() => goTo(i)}
                  className="group relative h-[14px] w-12 cursor-pointer"
                >
                  <span className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-white/15 transition-colors group-hover:bg-white/25">
                    {i === slide && (
                      <span
                        key={`${slide}-${run}`}
                        onAnimationEnd={() => goTo(slide + 1)}
                        className="absolute inset-y-0 left-0 rounded-full bg-white"
                        style={
                          reduced
                            ? { width: "100%" }
                            : {
                                animation: `slide-fill ${SLIDE_MS}ms linear forwards`,
                                animationPlayState: inView && !paused ? "running" : "paused",
                              }
                        }
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              aria-label="Next estimator"
              onClick={() => goTo(slide + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:border-white/40 hover:text-white"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path d="M6 2.5L11.5 8 6 13.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <span className="hidden w-32 text-[12px] font-semibold text-white/40 sm:block">
              {s.label}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
    </>
  );
}
