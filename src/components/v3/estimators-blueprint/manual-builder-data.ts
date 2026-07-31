// Manual builder fixtures — the demo sheet, the price book and the templates.
//
// The data layer is out of scope until the layout is signed off: no Prisma, no
// server action, no network call. Everything here is a plain constant so the
// screen can be reviewed with realistic weight in it — a sheet with one row
// tells you nothing about how the sheet reads when it is full.
//
// "Other" starts empty on purpose, so the section empty state is visible on
// first load rather than something you have to go hunting for.

import type { BookGroup, EstimateHeader, Rates, Section, Template } from "./manual-builder-types";

export const SEED_HEADER: EstimateHeader = {
  client: "Marlow Residence",
  project: "Rear deck rebuild",
  address: "418 Cedar Ln, Ashford",
  number: "EST-1042",
  date: "2026-07-30",
  trade: "Carpentry",
  validDays: 30,
};

export const SEED_SECTIONS: Section[] = [
  {
    id: "sec-materials",
    name: "Materials",
    rows: [
      { id: "seed-1", desc: "2x4 stud · pressure treated", qty: 140, unit: "ea", cost: 4.2 },
      { id: "seed-2", desc: "Deck screws #9 3in", qty: 12, unit: "bx", cost: 18 },
      { id: "seed-3", desc: "Joist hanger 2x8", qty: 48, unit: "ea", cost: 2.35 },
    ],
  },
  {
    id: "sec-labor",
    name: "Labor",
    rows: [
      { id: "seed-4", desc: "Framing crew", qty: 32, unit: "hr", cost: 65 },
      { id: "seed-5", desc: "Demo + haul off", qty: 1, unit: "ls", cost: 850 },
    ],
  },
  {
    id: "sec-equipment",
    name: "Equipment",
    rows: [{ id: "seed-6", desc: "Mini excavator · day rate", qty: 1, unit: "day", cost: 320 }],
  },
  {
    id: "sec-other",
    name: "Other",
    rows: [],
  },
];

export const SEED_RATES: Rates = {
  markupPct: 18,
  taxPct: 8.25,
  contingencyPct: 5,
};

export const PRICE_BOOK: BookGroup[] = [
  {
    id: "grp-framing",
    name: "Framing",
    items: [
      { id: "bk-1", name: "2x4 stud · pressure treated", unit: "ea", cost: 4.2 },
      { id: "bk-2", name: "2x8 joist · 12ft", unit: "ea", cost: 18.4 },
      { id: "bk-3", name: "Joist hanger 2x8", unit: "ea", cost: 2.35 },
      { id: "bk-4", name: "Header 6ft · LVL", unit: "ea", cost: 62 },
      { id: "bk-5", name: "Framing crew", unit: "hr", cost: 65 },
    ],
  },
  {
    id: "grp-roofing",
    name: "Roofing",
    items: [
      { id: "bk-6", name: "Arch shingle · 30yr", unit: "sq", cost: 118 },
      { id: "bk-7", name: "Synthetic underlayment", unit: "rl", cost: 94 },
      { id: "bk-8", name: "Ridge vent · 4ft", unit: "ea", cost: 21.5 },
      { id: "bk-9", name: "Drip edge · 10ft", unit: "ea", cost: 12.8 },
      { id: "bk-10", name: "Tear-off + disposal", unit: "sq", cost: 48 },
    ],
  },
  {
    id: "grp-concrete",
    name: "Concrete",
    items: [
      { id: "bk-11", name: "Ready-mix · 4000psi", unit: "cy", cost: 168 },
      { id: "bk-12", name: "Rebar #4 · 20ft", unit: "ea", cost: 11.2 },
      { id: "bk-13", name: "Form lumber 2x8", unit: "lf", cost: 2.75 },
      { id: "bk-14", name: "Finish + broom", unit: "sf", cost: 1.4 },
    ],
  },
  {
    id: "grp-sitework",
    name: "Sitework",
    items: [
      { id: "bk-15", name: "Mini excavator · day rate", unit: "day", cost: 320 },
      { id: "bk-16", name: "Gravel base · 3/4 clean", unit: "ton", cost: 42 },
      { id: "bk-17", name: "Dumpster · 20yd", unit: "ea", cost: 495 },
      { id: "bk-18", name: "Demo + haul off", unit: "ls", cost: 850 },
    ],
  },
];

export const TEMPLATES: Template[] = [
  {
    id: "tpl-reroof",
    name: "Reroof · 30yr arch",
    section: {
      id: "tpl-sec-reroof",
      name: "Reroof · 30yr arch",
      rows: [
        { id: "tpl-1", desc: "Tear-off + disposal", qty: 24, unit: "sq", cost: 48 },
        { id: "tpl-2", desc: "Synthetic underlayment", qty: 6, unit: "rl", cost: 94 },
        { id: "tpl-3", desc: "Arch shingle · 30yr", qty: 24, unit: "sq", cost: 118 },
        { id: "tpl-4", desc: "Ridge vent · 4ft", qty: 11, unit: "ea", cost: 21.5 },
      ],
    },
  },
  {
    id: "tpl-deck",
    name: "Deck rebuild · 200sf",
    section: {
      id: "tpl-sec-deck",
      name: "Deck rebuild · 200sf",
      rows: [
        { id: "tpl-5", desc: "2x8 joist · 12ft", qty: 22, unit: "ea", cost: 18.4 },
        { id: "tpl-6", desc: "Joist hanger 2x8", qty: 44, unit: "ea", cost: 2.35 },
        { id: "tpl-7", desc: "Framing crew", qty: 26, unit: "hr", cost: 65 },
      ],
    },
  },
  {
    id: "tpl-driveway",
    name: "Driveway pour · 600sf",
    section: {
      id: "tpl-sec-driveway",
      name: "Driveway pour · 600sf",
      rows: [
        { id: "tpl-8", desc: "Gravel base · 3/4 clean", qty: 14, unit: "ton", cost: 42 },
        { id: "tpl-9", desc: "Ready-mix · 4000psi", qty: 11, unit: "cy", cost: 168 },
        { id: "tpl-10", desc: "Rebar #4 · 20ft", qty: 38, unit: "ea", cost: 11.2 },
        { id: "tpl-11", desc: "Finish + broom", qty: 600, unit: "sf", cost: 1.4 },
      ],
    },
  },
];
