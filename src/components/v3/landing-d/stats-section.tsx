import Image from "next/image";
import { Reveal } from "./reveal";

type Card = { src: string; name: string; tag: string; cls?: string };

const ROWS: {
  label: string;
  lede: string;
  sub: string;
  cards: Card[];
}[] = [
  {
    label: "Remodelers",
    lede: "A kitchen is just the start",
    sub: "Run leads to final draw in one place",
    cards: [
      { src: "/landing-d/project-1.jpg", name: "Reyes & Sons", tag: "Remodeling" },
      { src: "/landing-d/project-2.jpg", name: "Golden Hour Kitchens", tag: "Kitchens" },
      { src: "/landing-d/service-remodel.jpg", name: "Hartwell Renovations", tag: "Whole-home" },
      { src: "/landing-d/about.jpg", name: "Casa Verde Builds", tag: "Design-build" },
    ],
  },
  {
    label: "Trade crews",
    lede: "Escape the whiteboard",
    sub: "Your schedule, crew, and cash — owned entirely by you",
    cards: [
      { src: "/landing-d/service-tile.jpg", name: "Meridian Tile & Stone", tag: "Tile" },
      { src: "/landing-d/project-4.jpg", name: "Volt & Vine Electric", tag: "Electrical" },
      { src: "/landing-d/project-6.jpg", name: "Bluewater Plumbing", tag: "Plumbing" },
      { src: "/landing-d/project-2.jpg", name: "Summit Drywall Co.", tag: "Drywall", cls: "grayscale object-top" },
    ],
  },
  {
    label: "Builders",
    lede: "From first walk-through to final invoice",
    sub: "Decks, additions, garages — jobs that run for months",
    cards: [
      { src: "/landing-d/project-3.jpg", name: "Whitfield Outdoor Living", tag: "Decks" },
      { src: "/landing-d/project-5.jpg", name: "North Fork Additions", tag: "Additions" },
      { src: "/landing-d/service-design.jpg", name: "Iron Gate Garage Co.", tag: "Garages" },
      { src: "/landing-d/project-4.jpg", name: "Prairie Wind Homes", tag: "Custom", cls: "grayscale object-bottom" },
    ],
  },
];

export function StatsSection() {
  return (
    <section className="relative overflow-hidden bg-lp-base px-5 py-[7vmin] text-white sm:px-6">
      <div className="mx-auto lp-wrap">
        {/* Big number */}
        <Reveal>
          <div className="flex flex-col items-center pb-[6vmin] pt-[4vmin] text-center">
            <span className="flex h-12 w-16 items-end overflow-hidden rounded-md border border-white/10 px-1.5 pb-1.5">
              <svg viewBox="0 0 56 32" className="w-full" aria-hidden>
                <path
                  d="M2 28 C14 26 18 18 26 16 C36 13 40 6 54 2"
                  fill="none"
                  stroke="#4A9EFF"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="54" cy="2" r="2.5" fill="#4A9EFF" />
              </svg>
            </span>
            <p className="mt-6 text-[20px] font-semibold leading-snug text-slate-300 sm:text-[clamp(20px,2vw,28px)]">
              Companies using JobFlex made
            </p>
            <div className="mt-2 text-[clamp(44px,6vw,76px)] font-bold leading-none tracking-[-0.02em] sm:mt-3">
              $40,000,000+
            </div>
          </div>
        </Reveal>

        {/* Audience rows */}
        <div className="mt-[4vmin] space-y-[7vmin]">
          {ROWS.map((row) => (
            <Reveal key={row.label}>
              <div className="border-t border-white/10 pt-[4vmin]">
                <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.01em]">
                  {row.label}
                </h3>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-7 sm:gap-4 lg:grid-cols-4 lg:gap-5">
                  {row.cards.map((c) => (
                    <figure key={c.name} className="group">
                      <div className="relative overflow-hidden rounded-lg">
                        <Image
                          src={c.src}
                          alt={`${c.name} — ${c.tag}`}
                          width={640}
                          height={420}
                          sizes="(max-width: 1024px) 50vw, 22vw"
                          className={`aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] sm:aspect-[3/2] ${c.cls ?? ""}`}
                        />
                        {/* Mobile attribution overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2 pt-8 sm:hidden">
                          <div className="text-[12.5px] font-bold leading-tight text-white">{c.name}</div>
                          <div className="text-[10px] text-white/70">{c.tag}</div>
                        </div>
                      </div>
                      <figcaption className="mt-2.5 hidden items-baseline justify-between sm:flex">
                        <span className="text-[16px] font-bold">{c.name}</span>
                        <span className="text-[12.5px] text-slate-500">{c.tag}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
