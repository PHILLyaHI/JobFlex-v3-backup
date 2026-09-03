export type MaterialVendor = {
  id: string;
  name: string;
  website?: string;
  states?: string[];
  regions?: string[];
  phone?: string;
  leadTime?: string;
  address?: string;
  primarySpecialtyKey?: string;
};

export type MaterialProduct = {
  id: string;
  name: string;
  description: string;
  unit: string;
  coverageSqFt?: number;
  category: "core" | "consumable" | "optional" | "equipment";
  priceRange?: [number, number];
  vendorIds: string[];
  notes?: string;
};

export type SpecialtyMaterialProfile = {
  specialtyId: string;
  products: MaterialProduct[];
  vendors: MaterialVendor[];
};

export type LocaleInfo = {
  state?: string;
  county?: string;
  city?: string;
};

export type MaterialRecommendation = {
  id: string;
  name: string;
  description: string;
  unit: string;
  category: "core" | "consumable" | "optional" | "equipment";
  vendor: MaterialVendor;
  vendorOptions: MaterialVendor[];
  priceRange?: [number, number];
  quantity?: number;
  coverageSqFt?: number;
  totalEstimatedCost?: number;
  notes?: string;
};

const MATERIAL_PROFILES: SpecialtyMaterialProfile[] = [
  {
    specialtyId: "epoxy-flooring",
    vendors: [
      {
        id: "sherwin-pro-ind",
        name: "Sherwin-Williams Industrial Coatings",
        website: "https://www.sherwin-williams.com/our-company/contact-us/commercial",
        states: [
          "AL","AZ","CA","CO","FL","GA","IL","NC","NJ","NY","OH","PA","TN","TX","WA"
        ],
        leadTime: "Local branch pickup typically within 1 business day",
        primarySpecialtyKey: "epoxy-flooring",
      },
      {
        id: "elite-crete",
        name: "Elite Crete Systems",
        website: "https://www.elitecrete.com/distributor-locator/",
        regions: ["Midwest","South","West"],
        leadTime: "Ships in 2-4 business days depending on region",
        primarySpecialtyKey: "epoxy-flooring",
      },
      {
        id: "johnsonite",
        name: "Jon-Don",
        website: "https://www.jondon.com/",
        regions: ["National"],
        leadTime: "1-2 day shipping from nearest warehouse",
        primarySpecialtyKey: "epoxy-flooring",
      },
    ],
    products: [
      {
        id: "epoxy-primer-moisture",
        name: "100% Solids Epoxy Moisture Mitigation Primer",
        description:
          "Two-component moisture vapor barrier primer to lock down high RH slabs and enhance adhesion.",
        unit: "3 gal kit",
        coverageSqFt: 300,
        category: "core",
        priceRange: [165, 210],
        vendorIds: ["sherwin-pro-ind", "elite-crete"],
      },
      {
        id: "epoxy-broadcast-resin",
        name: "High Build Broadcast Epoxy Resin",
        description:
          "Body coat epoxy for full broadcast flake systems; low odor, self-leveling with 45 minute pot life.",
        unit: "3 gal kit",
        coverageSqFt: 200,
        category: "core",
        priceRange: [185, 235],
        vendorIds: ["elite-crete", "johnsonite"],
      },
      {
        id: "polyaspartic-topcoat",
        name: "Polyaspartic UV Stable Topcoat",
        description:
          "Fast return-to-service topcoat, UV stable for interior/exterior slabs, satin sheen.",
        unit: "2 gal kit",
        coverageSqFt: 350,
        category: "core",
        priceRange: [210, 265],
        vendorIds: ["sherwin-pro-ind", "elite-crete"],
      },
      {
        id: "decorative-flake",
        name: "Decorative Vinyl Color Flake",
        description: "1/4\" broadcast blend, abrasion resistant, pre-blended neutral gray mix.",
        unit: "55 lb box",
        coverageSqFt: 400,
        category: "consumable",
        priceRange: [115, 150],
        vendorIds: ["johnsonite"],
      },
      {
        id: "crack-repair-gel",
        name: "Polyurea Crack & Joint Gel",
        description: "Rapid-set crack filler for chasing joints and small divots prior to coating.",
        unit: "22 oz dual cartridge",
        coverageSqFt: 60,
        category: "consumable",
        priceRange: [32, 42],
        vendorIds: ["johnsonite", "sherwin-pro-ind"],
      },
      {
        id: "diameter-grinder-rental",
        name: "Planetary Grinder Rental",
        description:
          "3-head 20\" planetary grinder rental including PCD and 30/40 grit metals for surface prep.",
        unit: "per day",
        category: "equipment",
        priceRange: [280, 360],
        vendorIds: ["johnsonite"],
        notes: "Reserve 7-10 days in advance during peak season.",
      },
    ],
  },
  {
    specialtyId: "concrete-resurfacing",
    vendors: [
      {
        id: "ardex-supply",
        name: "ARDEX Distribution Partners",
        website: "https://www.ardexamericas.com/contact-us/find-us/",
        regions: ["National"],
        leadTime: "2-4 days LTL shipment or local warehouse pickup",
        primarySpecialtyKey: "concrete-resurfacing",
      },
      {
        id: "butterfield-color",
        name: "Butterfield Color Distributors",
        website: "https://www.butterfieldcolor.com/distributor-locator/",
        regions: ["National"],
        leadTime: "Ships within 3 business days",
        primarySpecialtyKey: "concrete-resurfacing",
      },
    ],
    products: [
      {
        id: "microtopping-kit",
        name: "Polymer Micro-Topping Overlay",
        description: "Two-component cementitious micro-topping for decorative resurfacing up to 1/8\".",
        unit: "kit",
        coverageSqFt: 300,
        category: "core",
        priceRange: [165, 215],
        vendorIds: ["ardex-supply", "butterfield-color"],
      },
      {
        id: "resurfacing-primer",
        name: "Concrete Resurfacing Primer",
        description: "Acrylic bonding primer to promote adhesion on smooth or power-troweled slabs.",
        unit: "5 gal",
        coverageSqFt: 800,
        category: "core",
        priceRange: [140, 185],
        vendorIds: ["ardex-supply"],
      },
      {
        id: "decorative-sealer",
        name: "Decorative Concrete Sealer",
        description: "UV-stable, slip-resistant sealer for stamped or stained resurfaced concrete.",
        unit: "5 gal",
        coverageSqFt: 1500,
        category: "optional",
        priceRange: [155, 210],
        vendorIds: ["butterfield-color"],
      },
    ],
  },
  {
    specialtyId: "appliance-repair",
    vendors: [
      {
        id: "parts-town",
        name: "Parts Town",
        website: "https://www.partstown.com/",
        regions: ["National"],
        leadTime: "Same-day shipping for most OEM parts",
        primarySpecialtyKey: "appliance-repair",
      },
      {
        id: "repair-clinic",
        name: "RepairClinic Pro Supply",
        website: "https://www.repairclinic.com/Shop-For-Parts",
        regions: ["National"],
        leadTime: "1-3 days ground shipping",
        primarySpecialtyKey: "appliance-repair",
      },
    ],
    products: [
      {
        id: "diagnostic-kit",
        name: "Appliance Diagnostic Toolkit",
        description: "Multimeter, clamp meter, refrigerant gauges, and specialty tools for diagnostics.",
        unit: "kit",
        category: "equipment",
        priceRange: [285, 360],
        vendorIds: ["parts-town"],
      },
      {
        id: "oem-repair-parts",
        name: "OEM Appliance Repair Parts Allowance",
        description: "Allowance for common control boards, heating elements, and pumps.",
        unit: "allowance",
        category: "core",
        priceRange: [150, 250],
        vendorIds: ["parts-town", "repair-clinic"],
      },
      {
        id: "protective-consumables",
        name: "Protective Consumables Pack",
        description: "Gloves, HVAC tape, wire nuts, zip ties, and drip pans for appliance repair.",
        unit: "pack",
        category: "consumable",
        priceRange: [45, 70],
        vendorIds: ["repair-clinic"],
      },
    ],
  },
  {
    specialtyId: "painting",
    vendors: [
      {
        id: "sherwin-pro",
        name: "Sherwin-Williams Pro Store",
        website: "https://www.sherwin-williams.com/store-locator",
        regions: ["National"],
        leadTime: "Same-day pickup or next-day delivery",
        primarySpecialtyKey: "painting",
      },
      {
        id: "benjamin-moore",
        name: "Benjamin Moore Retailer",
        website: "https://www.benjaminmoore.com/en-us/store-locator",
        regions: ["National"],
        leadTime: "1-2 days for contractor delivery",
        primarySpecialtyKey: "painting",
      },
      {
        id: "ppg-pro",
        name: "PPG Paints Professional",
        website: "https://www.ppgpaints.com/store-locator",
        regions: ["National"],
        leadTime: "Same week delivery",
        primarySpecialtyKey: "painting",
      },
    ],
    products: [
      {
        id: "interior-primer",
        name: "High-Hiding Interior Primer",
        description: "Stain blocking acrylic primer for patched drywall and mixed substrates.",
        unit: "5 gal",
        coverageSqFt: 1600,
        category: "core",
        priceRange: [95, 125],
        vendorIds: ["sherwin-pro", "benjamin-moore"],
      },
      {
        id: "interior-finish",
        name: "Zero-VOC Acrylic Finish Paint",
        description: "Washable eggshell finish for walls and ceilings with low odor application.",
        unit: "5 gal",
        coverageSqFt: 1700,
        category: "core",
        priceRange: [145, 190],
        vendorIds: ["sherwin-pro", "ppg-pro"],
      },
      {
        id: "trim-enamel",
        name: "Waterborne Alkyd Trim Enamel",
        description: "Door and trim enamel with self-leveling technology for sprayed/brushed applications.",
        unit: "1 gal",
        coverageSqFt: 350,
        category: "optional",
        priceRange: [65, 80],
        vendorIds: ["benjamin-moore", "sherwin-pro"],
      },
      {
        id: "masking-kit",
        name: "Masking & Protection Kit",
        description: "9' masking plastic, tape, drop cloths, zip poles for protecting surfaces.",
        unit: "kit",
        category: "consumable",
        priceRange: [55, 85],
        vendorIds: ["sherwin-pro"],
      },
      {
        id: "sprayer-rental",
        name: "Airless Sprayer Rental",
        description: "0.017\" tip class sprayer for interior latex coatings.",
        unit: "per day",
        category: "equipment",
        priceRange: [95, 140],
        vendorIds: ["sherwin-pro"],
      },
    ],
  },
  {
    specialtyId: "roofing",
    vendors: [
      {
        id: "abc-supply",
        name: "ABC Supply Co. Inc.",
        website: "https://www.abcsupply.com/locations",
        regions: ["National"],
        leadTime: "Same or next day rooftop delivery",
        primarySpecialtyKey: "roofing",
      },
      {
        id: "beacon-building",
        name: "Beacon Building Products",
        website: "https://locations.becn.com/",
        regions: ["National"],
        leadTime: "1-3 days",
        primarySpecialtyKey: "roofing",
      },
    ],
    products: [
      {
        id: "architectural-shingles",
        name: "Architectural Asphalt Shingles",
        description: "Class A laminated shingles with 130MPH wind rating and limited lifetime warranty.",
        unit: "square",
        coverageSqFt: 100,
        category: "core",
        priceRange: [110, 155],
        vendorIds: ["abc-supply", "beacon-building"],
      },
      {
        id: "synthetic-underlayment",
        name: "Synthetic Roofing Underlayment",
        description: "High traction synthetic underlayment rated for 180-day UV exposure.",
        unit: "10 sq roll",
        coverageSqFt: 1000,
        category: "core",
        priceRange: [90, 125],
        vendorIds: ["abc-supply", "beacon-building"],
      },
      {
        id: "ice-water-shield",
        name: "Ice & Water Shield",
        description: "Self-adhered membrane for eaves, valleys, and penetrations.",
        unit: "1.95 sq roll",
        coverageSqFt: 195,
        category: "core",
        priceRange: [115, 140],
        vendorIds: ["abc-supply"],
      },
      {
        id: "ridge-vent",
        name: "Shingle-over Ridge Vent",
        description: "Net free airflow 18 sq in per foot, designed for architectural shingles.",
        unit: "4 ft section",
        category: "optional",
        priceRange: [12, 16],
        vendorIds: ["beacon-building"],
      },
      {
        id: "coil-nails",
        name: "1-1/4\" Electro-Galvanized Coil Roofing Nails",
        description: "3/4\" head, 120 coil count, for use in coil nailers.",
        unit: "7200 count",
        category: "consumable",
        priceRange: [58, 72],
        vendorIds: ["abc-supply"],
      },
    ],
  },
  {
    specialtyId: "decking",
    vendors: [
      {
        id: "trexpro-dealer",
        name: "TrexPro Dealer Network",
        website: "https://www.trex.com/find-a-retailer/",
        regions: ["National"],
        leadTime: "2-4 weeks for composite decking orders",
        primarySpecialtyKey: "decking",
      },
      {
        id: "decksdirect",
        name: "DecksDirect",
        website: "https://www.decksdirect.com/contact-us",
        regions: ["National"],
        leadTime: "Ships within 48 hours on stocked items",
        primarySpecialtyKey: "decking",
      },
    ],
    products: [
      {
        id: "composite-decking",
        name: "Composite Decking Boards",
        description: "Grooved capped-composite boards sized to deck layout.",
        unit: "board",
        category: "core",
        priceRange: [32, 48],
        vendorIds: ["trexpro-dealer", "decksdirect"],
      },
      {
        id: "deck-frame-pack",
        name: "Deck Framing Hardware Pack",
        description: "Joist hangers, ledger fasteners, post bases, blocking, and hardware.",
        unit: "pack",
        category: "core",
        priceRange: [185, 265],
        vendorIds: ["decksdirect"],
      },
      {
        id: "deck-lighting",
        name: "Deck Railing & Lighting Kit",
        description: "Composite railing system with LED post cap lights and transformer.",
        unit: "kit",
        category: "optional",
        priceRange: [420, 680],
        vendorIds: ["trexpro-dealer"],
      },
    ],
  },
  {
    specialtyId: "masonry",
    vendors: [
      {
        id: "belden-brick",
        name: "Belden Brick & Supply",
        website: "https://www.beldenbrick.com/locations",
        regions: ["Midwest","Midatlantic"],
        leadTime: "2-3 weeks typical brick delivery",
        primarySpecialtyKey: "masonry",
      },
      {
        id: "white-cap-masonry",
        name: "White Cap Masonry Supply",
        website: "https://www.whitecap.com/locations",
        regions: ["National"],
        leadTime: "1-2 weeks",
        primarySpecialtyKey: "masonry",
      },
    ],
    products: [
      {
        id: "brick-block-pack",
        name: "Brick/Block Material Pack",
        description: "Face brick or CMU block allowance including delivery and boom.",
        unit: "allowance",
        category: "core",
        priceRange: [1200, 2600],
        vendorIds: ["belden-brick", "white-cap-masonry"],
      },
      {
        id: "mortar-grout",
        name: "Mortar & Grout Materials",
        description: "Type S/T masonry cement, sand, bonding admixture, color packs.",
        unit: "pallet",
        category: "consumable",
        priceRange: [215, 360],
        vendorIds: ["white-cap-masonry"],
      },
      {
        id: "masonry-accessories",
        name: "Masonry Accessory Pack",
        description: "Lath, ties, control joints, flashing, and weeps for masonry walls.",
        unit: "pack",
        category: "optional",
        priceRange: [145, 220],
        vendorIds: ["white-cap-masonry"],
      },
    ],
  },
  {
    specialtyId: "pool-spa",
    vendors: [
      {
        id: "scp-distributors",
        name: "SCP Distributors",
        website: "https://www.scppool.com/locations",
        regions: ["National"],
        leadTime: "Varies (most items 1-2 weeks)",
        primarySpecialtyKey: "pool-spa",
      },
      {
        id: "leslies-pro",
        name: "Leslie's Pro Commercial",
        website: "https://www.lesliespool.com/stores/",
        regions: ["National"],
        leadTime: "1-3 days on stocked equipment",
        primarySpecialtyKey: "pool-spa",
      },
    ],
    products: [
      {
        id: "pool-equipment-pack",
        name: "Pool Equipment Pack",
        description: "Pump, filter, heater, automation, and electrical subpanel allowance.",
        unit: "pack",
        category: "core",
        priceRange: [4200, 6200],
        vendorIds: ["scp-distributors"],
      },
      {
        id: "finish-materials",
        name: "Pool Finish Materials",
        description: "Pebble/plaster mix, tile, coping, and deck drains for pool interior.",
        unit: "allowance",
        category: "core",
        priceRange: [3800, 5600],
        vendorIds: ["scp-distributors"],
      },
      {
        id: "pool-chemicals",
        name: "Start-Up Chemicals & Test Kit",
        description: "Start-up chemicals, test kits, and maintenance tools.",
        unit: "kit",
        category: "consumable",
        priceRange: [280, 410],
        vendorIds: ["leslies-pro"],
      },
    ],
  },
  {
    specialtyId: "pest-control",
    vendors: [
      {
        id: "target-specialty",
        name: "Target Specialty Products",
        website: "https://www.target-specialty.com/locations",
        regions: ["National"],
        leadTime: "1-3 days ground shipping",
        primarySpecialtyKey: "pest-control",
      },
      {
        id: "veseris",
        name: "Veseris (Univar)",
        website: "https://www.veseris.com/locations",
        regions: ["National"],
        leadTime: "Same-week delivery",
        primarySpecialtyKey: "pest-control",
      },
    ],
    products: [
      {
        id: "chemical-and-bait-kit",
        name: "Chemical & Bait Kit",
        description: "Termiticides, general insecticides, baits, and IGRs for treatment plan.",
        unit: "kit",
        category: "core",
        priceRange: [320, 560],
        vendorIds: ["target-specialty", "veseris"],
      },
      {
        id: "ppe-and-safety",
        name: "PPE & Safety Pack",
        description: "Respirators, coveralls, gloves, eyewear, signage, and spill kits.",
        unit: "pack",
        category: "consumable",
        priceRange: [165, 240],
        vendorIds: ["target-specialty"],
      },
      {
        id: "monitoring-equipment",
        name: "Monitoring & Exclusion Equipment",
        description: "Electronic monitoring, traps, exclusion materials for pests.",
        unit: "set",
        category: "optional",
        priceRange: [280, 420],
        vendorIds: ["veseris"],
      },
    ],
  },
  {
    specialtyId: "restoration",
    vendors: [
      {
        id: "jon-don-restoration",
        name: "Jon-Don Restoration Supply",
        website: "https://www.jondon.com/locations/",
        regions: ["National"],
        leadTime: "Ships same day on stocked equipment",
        primarySpecialtyKey: "restoration",
      },
      {
        id: "aramsco",
        name: "Aramsco",
        website: "https://www.aramsco.com/store-locator",
        regions: ["National"],
        leadTime: "1-3 days",
        primarySpecialtyKey: "restoration",
      },
    ],
    products: [
      {
        id: "water-loss-equipment",
        name: "Water Loss Equipment Pack",
        description: "Air movers, LGR dehumidifiers, HEPA scrubbers for mitigation.",
        unit: "pack",
        category: "equipment",
        priceRange: [3500, 5200],
        vendorIds: ["jon-don-restoration", "aramsco"],
      },
      {
        id: "containment-materials",
        name: "Containment & PPE Materials",
        description: "Zipwall, poly, tape, PPE, HEPA vac filters for remediation.",
        unit: "pack",
        category: "consumable",
        priceRange: [275, 425],
        vendorIds: ["aramsco"],
      },
      {
        id: "antimicrobial-chemicals",
        name: "Antimicrobial & Cleaning Chemicals",
        description: "EPA-registered disinfectants, cleaners, deodorization agents.",
        unit: "case",
        category: "core",
        priceRange: [160, 240],
        vendorIds: ["jon-don-restoration"],
      },
    ],
  },
  {
    specialtyId: "security-lowvoltage",
    vendors: [
      {
        id: "adi-global",
        name: "ADI Global Distribution",
        website: "https://www.adiglobaldistribution.us/locations",
        regions: ["National"],
        leadTime: "1-2 days ground shipping",
        primarySpecialtyKey: "security-lowvoltage",
      },
      {
        id: "anixter",
        name: "Anixter/Wesco",
        website: "https://www.anixter.com/en_us/resources/where-to-buy.html",
        regions: ["National"],
        leadTime: "Same-week fulfillment",
        primarySpecialtyKey: "security-lowvoltage",
      },
    ],
    products: [
      {
        id: "camera-package",
        name: "IP Camera & NVR Package",
        description: "Commercial grade cameras, NVR, PoE switches, and storage.",
        unit: "kit",
        category: "core",
        priceRange: [1650, 2800],
        vendorIds: ["adi-global", "anixter"],
      },
      {
        id: "access-control-kit",
        name: "Access Control Kit",
        description: "Door controllers, readers, credentials, door hardware for 2-4 openings.",
        unit: "kit",
        category: "core",
        priceRange: [1850, 3100],
        vendorIds: ["adi-global"],
      },
      {
        id: "low-voltage-cabling",
        name: "Low-Voltage Cabling & Termination Pack",
        description: "Cat6/Cat6A, coax, connectors, patch panels, labeling, enclosures.",
        unit: "pack",
        category: "consumable",
        priceRange: [380, 620],
        vendorIds: ["anixter"],
      },
    ],
  },
  {
    specialtyId: "snow-removal",
    vendors: [
      {
        id: "snowex",
        name: "SnowEx Equipment Dealers",
        website: "https://www.snowexproducts.com/dealer-locator",
        regions: ["National"],
        leadTime: "Pre-season order recommended (4-6 weeks)",
        primarySpecialtyKey: "snow-removal",
      },
      {
        id: "buyers-saltdogg",
        name: "Buyers Products - SaltDogg",
        website: "https://www.buyersproducts.com/dealer-locator",
        regions: ["National"],
        leadTime: "Ships within 5 business days on stocked models",
        primarySpecialtyKey: "snow-removal",
      },
    ],
    products: [
      {
        id: "plow-assembly",
        name: "Truck Plow Assembly",
        description: "7.5'-8.5' snow plow, mount kit, wiring harness for light-duty truck.",
        unit: "assembly",
        category: "equipment",
        priceRange: [4200, 5600],
        vendorIds: ["snowex", "buyers-saltdogg"],
      },
      {
        id: "salt-spreader",
        name: "Tailgate Salt Spreader",
        description: "Poly tailgate spreader with controller and wiring, includes vibrator.",
        unit: "unit",
        category: "equipment",
        priceRange: [1650, 2450],
        vendorIds: ["buyers-saltdogg"],
      },
      {
        id: "de-icing-material",
        name: "Bulk De-icing Material Allowance",
        description: "Bulk salt, treated salt, or calcium chloride for season startup.",
        unit: "ton",
        category: "consumable",
        priceRange: [110, 185],
        vendorIds: ["snowex"],
      },
    ],
  },
  {
    specialtyId: "landscaping",
    vendors: [
      {
        id: "siteone",
        name: "SiteOne Landscape Supply",
        website: "https://www.siteone.com/locations",
        regions: ["National"],
        leadTime: "2-4 days delivery",
        primarySpecialtyKey: "landscaping",
      },
      {
        id: "horizon-dispersal",
        name: "Horizon Distributors",
        website: "https://www.horizononline.com/store-locations/",
        regions: ["West","South","Southeast"],
        leadTime: "1-3 days",
        primarySpecialtyKey: "landscaping",
      },
    ],
    products: [
      {
        id: "irrigation-kit",
        name: "Irrigation Zone Kit",
        description: "PVC pipe, valves, rotors/drip, controller, and wiring for a standard zone.",
        unit: "zone kit",
        category: "core",
        priceRange: [320, 460],
        vendorIds: ["siteone"],
      },
      {
        id: "hardscape-base",
        name: "Hardscape Base Material Allowance",
        description: "Crushed stone, sand, geotextile fabric for patios or walkways.",
        unit: "yard",
        category: "core",
        priceRange: [60, 85],
        vendorIds: ["siteone", "horizon-dispersal"],
      },
      {
        id: "planting-pack",
        name: "Planting & Mulch Pack",
        description: "Tree/shrub allowance, soil amendments, mulches, plant stakes.",
        unit: "allowance",
        category: "optional",
        priceRange: [450, 700],
        vendorIds: ["horizon-dispersal"],
      },
    ],
  },
  {
    specialtyId: "solar",
    vendors: [
      {
        id: "ced-greentech",
        name: "CED Greentech",
        website: "https://cedgreentech.com/locations",
        regions: ["National"],
        leadTime: "Ships within 2 business days",
        primarySpecialtyKey: "solar",
      },
      {
        id: "civicsolar",
        name: "CivicSolar",
        website: "https://www.civicsolar.com/company/contact",
        regions: ["National"],
        leadTime: "2-5 days depending on warehouse",
        primarySpecialtyKey: "solar",
      },
    ],
    products: [
      {
        id: "pv-module-pack",
        name: "Tier-1 PV Module Pack",
        description: "High-efficiency modules sized to project array, 25-year warranty.",
        unit: "module",
        category: "core",
        priceRange: [235, 325],
        vendorIds: ["ced-greentech", "civicsolar"],
      },
      {
        id: "inverter-kit",
        name: "Inverter & Racking Kit",
        description: "String inverter or microinverters, racking hardware, MLPE devices.",
        unit: "kit",
        category: "core",
        priceRange: [950, 1650],
        vendorIds: ["ced-greentech"],
      },
      {
        id: "solar-balance-system",
        name: "Balance of System Components",
        description: "Wire management, combiner boxes, disconnects, grounding hardware.",
        unit: "pack",
        category: "consumable",
        priceRange: [280, 420],
        vendorIds: ["civicsolar"],
      },
    ],
  },
  {
    specialtyId: "general-contracting",
    vendors: [
      {
        id: "white-cap",
        name: "White Cap",
        website: "https://www.whitecap.com/locations",
        regions: ["National"],
        leadTime: "1-3 days delivery",
        primarySpecialtyKey: "general-contracting",
      },
      {
        id: "hd-supply-pro",
        name: "HD Supply Pro",
        website: "https://hdsupplysolutions.com/storelocator",
        regions: ["National"],
        leadTime: "Same-week fulfillment",
        primarySpecialtyKey: "general-contracting",
      },
    ],
    products: [
      {
        id: "temporary-protection",
        name: "Temporary Protection Pack",
        description: "Ram board, poly sheeting, caution tape, and zipwall system.",
        unit: "pack",
        category: "consumable",
        priceRange: [165, 220],
        vendorIds: ["white-cap"],
      },
      {
        id: "fastener-bulk",
        name: "Bulk Fastener & Hardware Pack",
        description: "Concrete anchors, screws, nails, and Simpson connectors.",
        unit: "bulk pack",
        category: "consumable",
        priceRange: [210, 320],
        vendorIds: ["white-cap", "hd-supply-pro"],
      },
      {
        id: "equipment-rental-allowance",
        name: "Small Equipment Rental Allowance",
        description: "Allowance for compactors, lifts, or concrete saw rental.",
        unit: "allowance",
        category: "equipment",
        priceRange: [350, 550],
        vendorIds: ["hd-supply-pro"],
      },
    ],
  },
  {
    specialtyId: "drywall",
    vendors: [
      {
        id: "gms-supply",
        name: "GMS Distribution",
        website: "https://www.gms.com/locations/",
        regions: ["National"],
        leadTime: "1-3 days boom delivery",
        primarySpecialtyKey: "drywall",
      },
      {
        id: "lw-supply",
        name: "L&W Supply",
        website: "https://www.lwsupply.com/locations/",
        regions: ["National"],
        leadTime: "Same-week drop",
        primarySpecialtyKey: "drywall",
      },
    ],
    products: [
      {
        id: "sheetrock-bundle",
        name: "Drywall Board Bundle",
        description: "1/2\" or 5/8\" gypsum boards delivered to floors.",
        unit: "bundle",
        category: "core",
        priceRange: [380, 520],
        vendorIds: ["gms-supply", "lw-supply"],
      },
      {
        id: "mud-tape-pack",
        name: "Joint Compound & Tape Pack",
        description: "All-purpose mud, topping mud, mesh/paper tape, corner beads.",
        unit: "pack",
        category: "consumable",
        priceRange: [145, 210],
        vendorIds: ["gms-supply"],
      },
      {
        id: "finishing-tools",
        name: "Drywall Finishing Tool Set",
        description: "Automatic taper, boxes, sanders, and mixing tools allowance.",
        unit: "allowance",
        category: "equipment",
        priceRange: [450, 650],
        vendorIds: ["lw-supply"],
      },
    ],
  },
  {
    specialtyId: "kitchen-remodel",
    vendors: [
      {
        id: "prosource",
        name: "ProSource Wholesale",
        website: "https://www.prosourcewholesale.com/showrooms",
        regions: ["National"],
        leadTime: "Varies by cabinet line (4-6 weeks typical)",
        primarySpecialtyKey: "kitchen-remodel",
      },
      {
        id: "ferguson-bath-kitchen",
        name: "Ferguson Bath, Kitchen & Lighting Gallery",
        website: "https://www.fergusonshowrooms.com/locator/",
        regions: ["National"],
        leadTime: "Fixture delivery within 1-3 weeks",
        primarySpecialtyKey: "kitchen-remodel",
      },
    ],
    products: [
      {
        id: "cabinet-package",
        name: "Cabinet Package Allowance",
        description: "Base and wall cabinets, hardware, and trims sized to layout.",
        unit: "allowance",
        category: "core",
        priceRange: [6500, 12000],
        vendorIds: ["prosource"],
      },
      {
        id: "countertop-slab",
        name: "Quartz Countertop Slab",
        description: "Quartz or solid-surface slab fabrication with undermount sink cuts.",
        unit: "slab",
        category: "core",
        priceRange: [1800, 3200],
        vendorIds: ["prosource"],
      },
      {
        id: "kitchen-fixture-pack",
        name: "Kitchen Fixture & Appliance Rough-In Pack",
        description: "Sink, faucet, disposal, vent hood, and appliance electrical kit.",
        unit: "pack",
        category: "consumable",
        priceRange: [1150, 1850],
        vendorIds: ["ferguson-bath-kitchen"],
      },
    ],
  },
  {
    specialtyId: "bathroom-remodel",
    vendors: [
      {
        id: "ferguson-bath",
        name: "Ferguson Bath & Lighting",
        website: "https://www.fergusonshowrooms.com/locator/",
        regions: ["National"],
        leadTime: "1-3 weeks typical for fixtures",
        primarySpecialtyKey: "bathroom-remodel",
      },
      {
        id: "plumbmaster",
        name: "PlumbMaster",
        website: "https://www.plumbmaster.com/customer-service/contact-us",
        regions: ["National"],
        leadTime: "Ships within 2 business days",
        primarySpecialtyKey: "bathroom-remodel",
      },
    ],
    products: [
      {
        id: "bath-fixture-pack",
        name: "Bathroom Fixture Pack",
        description: "Shower valve/trim, tub filler, lav fixtures, accessories in matched finish.",
        unit: "pack",
        category: "core",
        priceRange: [1650, 2650],
        vendorIds: ["ferguson-bath"],
      },
      {
        id: "waterproofing-system",
        name: "Shower Waterproofing System",
        description: "Sheet membrane, preformed corners, drain assembly, and mortar.",
        unit: "kit",
        category: "core",
        priceRange: [520, 780],
        vendorIds: ["plumbmaster"],
      },
      {
        id: "vanity-package",
        name: "Vanity & Top Package",
        description: "Vanity cabinet, stone top, sinks, mirrors for typical bath remodel.",
        unit: "package",
        category: "optional",
        priceRange: [1250, 1950],
        vendorIds: ["ferguson-bath"],
      },
    ],
  },
  {
    specialtyId: "hvac",
    vendors: [
      {
        id: "ferguson-hvac",
        name: "Ferguson HVAC",
        website: "https://www.fergusonhvac.com/locations/",
        regions: ["National"],
        leadTime: "Same or next day from local branch",
        primarySpecialtyKey: "hvac",
      },
      {
        id: "johnstone-supply",
        name: "Johnstone Supply",
        website: "https://www.johnstonesupply.com/storelocatorbranchlocator.html",
        regions: ["National"],
        leadTime: "1-3 days depending on inventory",
        primarySpecialtyKey: "hvac",
      },
    ],
    products: [
      {
        id: "heat-pump-system",
        name: "Heat Pump System Package",
        description: "2-3 ton heat pump, air handler, thermostat, and line set kit.",
        unit: "system",
        category: "core",
        priceRange: [2850, 3850],
        vendorIds: ["ferguson-hvac", "johnstone-supply"],
      },
      {
        id: "ductwork-kit",
        name: "Sheet Metal Ductwork & Fittings",
        description: "Main trunk, takeoffs, flex duct, and dampers for retrofit projects.",
        unit: "kit",
        category: "core",
        priceRange: [680, 1020],
        vendorIds: ["ferguson-hvac"],
      },
      {
        id: "hvac-sealant-pack",
        name: "HVAC Sealant & Accessory Pack",
        description: "Mastic, foil tape, hangers, insulation, and fasteners for install.",
        unit: "pack",
        category: "consumable",
        priceRange: [145, 195],
        vendorIds: ["johnstone-supply"],
      },
    ],
  },
  {
    specialtyId: "electrical",
    vendors: [
      {
        id: "graybar",
        name: "Graybar Electric",
        website: "https://www.graybar.com/store/en/gb/store-locator",
        regions: ["National"],
        leadTime: "1-3 days delivery",
        primarySpecialtyKey: "electrical",
      },
      {
        id: "rexel",
        name: "Rexel USA",
        website: "https://www.rexelusa.com/locations",
        regions: ["National"],
        leadTime: "1-2 days from local counter",
        primarySpecialtyKey: "electrical",
      },
    ],
    products: [
      {
        id: "panel-upgrade-kit",
        name: "Panel Upgrade Kit",
        description: "200A load center, breakers, meter combo, grounding kit for service upgrades.",
        unit: "kit",
        category: "core",
        priceRange: [650, 925],
        vendorIds: ["graybar", "rexel"],
      },
      {
        id: "branch-circuit-materials",
        name: "Branch Circuit Wiring Pack",
        description: "MC cable, NM-B, conduit fittings, boxes, and connectors for rewiring.",
        unit: "pack",
        category: "core",
        priceRange: [280, 420],
        vendorIds: ["graybar"],
      },
      {
        id: "lighting-fixture-allowance",
        name: "Lighting Fixture Allowance",
        description: "Allowance for LED recessed cans, undercabinet, or accent fixtures.",
        unit: "allowance",
        category: "optional",
        priceRange: [350, 600],
        vendorIds: ["rexel"],
      },
    ],
  },
  {
    specialtyId: "plumbing",
    vendors: [
      {
        id: "ferguson-plumbing",
        name: "Ferguson Plumbing Supply",
        website: "https://www.ferguson.com/branchFinder",
        regions: ["National"],
        leadTime: "Same-week delivery",
        primarySpecialtyKey: "plumbing",
      },
      {
        id: "winsupply",
        name: "Winsupply",
        website: "https://www.winsupplyinc.com/locations",
        regions: ["National"],
        leadTime: "2-3 days",
        primarySpecialtyKey: "plumbing",
      },
    ],
    products: [
      {
        id: "pex-rough-in",
        name: "PEX Rough-In Manifold Kit",
        description: "ProPEX manifold, tubing, valves, and fittings for whole-house rough-in.",
        unit: "kit",
        category: "core",
        priceRange: [480, 720],
        vendorIds: ["ferguson-plumbing", "winsupply"],
      },
      {
        id: "fixture-pack",
        name: "Bathroom Fixture Pack",
        description: "Valve bodies, trims, drains, and supply stops for a standard bath remodel.",
        unit: "pack",
        category: "core",
        priceRange: [560, 920],
        vendorIds: ["ferguson-plumbing"],
      },
      {
        id: "plumbing-consumables",
        name: "Plumbing Consumables Pack",
        description: "PVC cement, pipe insulation, test plugs, solder, and expansion foam.",
        unit: "pack",
        category: "consumable",
        priceRange: [95, 135],
        vendorIds: ["winsupply"],
      },
    ],
  },
  {
    specialtyId: "siding-installation",
    vendors: [
      {
        id: "abc-supply-siding",
        name: "ABC Supply Co. Inc.",
        website: "https://www.abcsupply.com/locations",
        regions: ["National"],
        leadTime: "1-3 days delivery or rooftop boom drop",
        primarySpecialtyKey: "siding-installation",
      },
      {
        id: "beacon-building-siding",
        name: "Beacon Building Products",
        website: "https://locations.becn.com/",
        regions: ["National"],
        leadTime: "2-4 days",
        primarySpecialtyKey: "siding-installation",
      },
      {
        id: "lp-building",
        name: "LP Building Solutions Distributors",
        website: "https://lpcorp.com/where-to-buy",
        regions: ["National"],
        leadTime: "Varies by distribution yard (call ahead)",
        primarySpecialtyKey: "siding-installation",
      },
    ],
    products: [
      {
        id: "fiber-cement-panels",
        name: "Fiber Cement Siding Panels",
        description: "Factory-primed lap siding panels with staggered or straight butts for exterior cladding.",
        unit: "square",
        coverageSqFt: 100,
        category: "core",
        priceRange: [180, 240],
        vendorIds: ["abc-supply-siding", "beacon-building-siding"],
      },
      {
        id: "weather-resistive-barrier",
        name: "Weather Resistive Barrier",
        description: "High-perm, tear-resistant house wrap for walls prior to siding installation.",
        unit: "9' x 150' roll",
        coverageSqFt: 1350,
        category: "core",
        priceRange: [125, 165],
        vendorIds: ["abc-supply-siding", "lp-building"],
      },
      {
        id: "siding-fastener-kit",
        name: "Siding Fastener Kit",
        description: "Corrosion-resistant ring shank nails and starter strips rated for siding systems.",
        unit: "kit",
        category: "consumable",
        priceRange: [75, 110],
        vendorIds: ["abc-supply-siding"],
      },
      {
        id: "siding-trim-boards",
        name: "Exterior Trim & Accessory Boards",
        description: "Pre-finished trim boards, J-channels, and soffit accessories matched to siding system.",
        unit: "set",
        category: "optional",
        priceRange: [160, 220],
        vendorIds: ["beacon-building-siding", "lp-building"],
      },
    ],
  },
  {
    specialtyId: "gutter-installation",
    vendors: [
      {
        id: "gutter-supply",
        name: "GutterSupply.com",
        website: "https://www.guttersupply.com/",
        regions: ["National"],
        leadTime: "Ships within 2 business days",
        primarySpecialtyKey: "gutter-installation",
      },
      {
        id: "abc-supply-gutters",
        name: "ABC Supply Seamless Gutters",
        website: "https://www.abcsupply.com/locations",
        regions: ["National"],
        leadTime: "Same or next-day truck delivery",
        primarySpecialtyKey: "gutter-installation",
      },
    ],
    products: [
      {
        id: "seamless-gutter-coil",
        name: "0.027\" Aluminum Gutter Coil",
        description: "K-style gutter coil in contractor lengths for seamless gutter fabrication.",
        unit: "500 ft coil",
        category: "core",
        priceRange: [340, 420],
        vendorIds: ["gutter-supply", "abc-supply-gutters"],
      },
      {
        id: "hanger-fastener-pack",
        name: "Hidden Hanger & Fastener Pack",
        description: "Screw-in hangers, ferrules, and stainless fasteners for gutter installs.",
        unit: "box",
        category: "consumable",
        priceRange: [75, 110],
        vendorIds: ["gutter-supply"],
      },
      {
        id: "downspout-kit",
        name: "Downspout & Outlet Fitting Kit",
        description: "Downspout pipe, elbows, outlets, and splash blocks for a standard install.",
        unit: "kit",
        category: "core",
        priceRange: [145, 210],
        vendorIds: ["abc-supply-gutters"],
      },
    ],
  },
  {
    specialtyId: "fencing",
    vendors: [
      {
        id: "master-halco",
        name: "Master Halco",
        website: "https://www.masterhalco.com/store-locator",
        regions: ["National"],
        leadTime: "2-5 days truck delivery",
        primarySpecialtyKey: "fencing",
      },
      {
        id: "ameristar",
        name: "Ameristar Fence Products",
        website: "https://www.ameristarfence.com/en/resources/where-to-buy/",
        regions: ["National"],
        leadTime: "Varies by fabricator (call 3-5 days ahead)",
        primarySpecialtyKey: "fencing",
      },
    ],
    products: [
      {
        id: "fence-posts",
        name: "Pressure-Treated Fence Posts",
        description: "4x4 or 6x6 posts treated for ground contact for wood fence systems.",
        unit: "each",
        category: "core",
        priceRange: [22, 38],
        vendorIds: ["master-halco"],
      },
      {
        id: "panel-kits",
        name: "Fence Panel & Rail Kit",
        description: "Pre-fabricated panels or rails matched to fence style (wood, vinyl, metal).",
        unit: "panel",
        category: "core",
        priceRange: [95, 160],
        vendorIds: ["master-halco", "ameristar"],
      },
      {
        id: "hardware-pack",
        name: "Gate & Hardware Pack",
        description: "Hinges, latches, screws, and metal brackets for gate installs.",
        unit: "pack",
        category: "consumable",
        priceRange: [45, 70],
        vendorIds: ["ameristar"],
      },
    ],
  },
  {
    specialtyId: "insulation-weatherization",
    vendors: [
      {
        id: "service-partners",
        name: "Service Partners",
        website: "https://www.service-partners.com/locations/",
        regions: ["National"],
        leadTime: "Next-day delivery from local branch",
        primarySpecialtyKey: "insulation-weatherization",
      },
      {
        id: "idi-distributors",
        name: "IDI Distributors",
        website: "https://www.idi-insulation.com/locations/",
        regions: ["National"],
        leadTime: "1-2 days for most insulation materials",
        primarySpecialtyKey: "insulation-weatherization",
      },
    ],
    products: [
      {
        id: "blown-in-cellulose",
        name: "Blown-In Cellulose Insulation",
        description: "Loose-fill cellulose for attics with R-value 3.6 per inch.",
        unit: "bag",
        category: "core",
        priceRange: [14, 19],
        vendorIds: ["service-partners", "idi-distributors"],
      },
      {
        id: "spray-foam-kit",
        name: "Closed-Cell Spray Foam Kit",
        description: "Portable spray foam kit for rim joists, crawlspaces, and air sealing.",
        unit: "kit",
        coverageSqFt: 600,
        category: "core",
        priceRange: [310, 410],
        vendorIds: ["idi-distributors"],
      },
      {
        id: "weatherization-sealant",
        name: "Air Sealing & Weatherization Pack",
        description: "Caulk, flashing tape, foam, and gaskets for sealing penetrations.",
        unit: "pack",
        category: "consumable",
        priceRange: [65, 95],
        vendorIds: ["service-partners"],
      },
    ],
  },
  {
    specialtyId: "flooring-installation",
    vendors: [
      {
        id: "floor-decor-pro",
        name: "Floor & Decor Pro Services",
        website: "https://www.flooranddecor.com/store-locator",
        regions: ["National"],
        leadTime: "Same-day pickup at store",
        primarySpecialtyKey: "flooring-installation",
      },
      {
        id: "ll-flooring",
        name: "LL Flooring Commercial",
        website: "https://www.llflooring.com/c/commercial",
        regions: ["National"],
        leadTime: "2-5 days depending on stock",
        primarySpecialtyKey: "flooring-installation",
      },
    ],
    products: [
      {
        id: "underlayment-roll",
        name: "Floor Underlayment Roll",
        description: "Acoustic underlayment suitable for laminate/LVP installs.",
        unit: "roll",
        coverageSqFt: 400,
        category: "core",
        priceRange: [55, 85],
        vendorIds: ["floor-decor-pro"],
      },
      {
        id: "flooring-adhesive",
        name: "Premium Flooring Adhesive",
        description: "Low-VOC trowel adhesive for engineered wood or LVP.",
        unit: "4 gal",
        coverageSqFt: 500,
        category: "consumable",
        priceRange: [120, 165],
        vendorIds: ["ll-flooring"],
      },
      {
        id: "transition-kit",
        name: "Floor Transition & Trim Kit",
        description: "Reducers, thresholds, and stair nosing matched to flooring selection.",
        unit: "kit",
        category: "optional",
        priceRange: [95, 140],
        vendorIds: ["floor-decor-pro", "ll-flooring"],
      },
    ],
  },
];

type SpecialtyCategoryId = "interior" | "exterior" | "mechanical" | "general" | "specialty";

const CATEGORY_FALLBACKS: Record<SpecialtyCategoryId, { vendors: MaterialVendor[]; products: MaterialProduct[] }> = {
  interior: {
    vendors: [
      {
        id: "national-paint-pro",
        name: "National Paint Supply",
        website: "https://www.sherwin-williams.com/store-locator",
        regions: ["National"],
        leadTime: "Same-week contractor delivery",
        primarySpecialtyKey: "interior",
      },
    ],
    products: [
      {
        id: "interior-latex",
        name: "Professional Latex Finish Paint",
        description: "Washable low-VOC wall paint suitable for residential and light commercial interiors.",
        unit: "5 gal",
        coverageSqFt: 1600,
        category: "core",
        priceRange: [120, 185],
        vendorIds: ["national-paint-pro"],
      },
      {
        id: "interior-primer-generic",
        name: "High-build acrylic primer",
        description: "All-purpose primer for patchy drywall and mixed substrates before finish coats.",
        unit: "5 gal",
        coverageSqFt: 1500,
        category: "consumable",
        priceRange: [90, 125],
        vendorIds: ["national-paint-pro"],
      },
    ],
  },
  exterior: {
    vendors: [
      {
        id: "national-exterior-supply",
        name: "Contractor Exterior Supply",
        website: "https://www.abcsupply.com/locations",
        regions: ["National"],
        leadTime: "1-3 days",
        primarySpecialtyKey: "exterior",
      },
    ],
    products: [
      {
        id: "exterior-sealant",
        name: "Polyurethane joint sealant",
        description: "Weatherproof sealant for exterior transitions and penetrations.",
        unit: "case",
        category: "consumable",
        priceRange: [140, 190],
        vendorIds: ["national-exterior-supply"],
      },
      {
        id: "exterior-fasteners",
        name: "Exterior-rated fasteners",
        description: "Corrosion resistant fasteners suitable for exterior cladding and trim systems.",
        unit: "box",
        category: "consumable",
        priceRange: [45, 75],
        vendorIds: ["national-exterior-supply"],
      },
    ],
  },
  mechanical: {
    vendors: [
      {
        id: "mech-distributor",
        name: "Mechanical Supply Distribution",
        website: "https://www.ferguson.com/locations",
        regions: ["National"],
        leadTime: "2-4 days",
        primarySpecialtyKey: "mechanical",
      },
    ],
    products: [
      {
        id: "mech-fasteners",
        name: "HVAC Hanger & Fastener Pack",
        description: "Threaded rod, anchors, and vibration isolation hardware for equipment installs.",
        unit: "kit",
        category: "consumable",
        priceRange: [95, 140],
        vendorIds: ["mech-distributor"],
      },
      {
        id: "mech-sealant",
        name: "Mechanical sealant & tape kit",
        description: "High-temp duct sealant and foil tape pack for mechanical connections.",
        unit: "kit",
        category: "consumable",
        priceRange: [60, 95],
        vendorIds: ["mech-distributor"],
      },
    ],
  },
  general: {
    vendors: [
      {
        id: "builder-supply",
        name: "Builder Supply Co.",
        website: "https://www.hdsupply.com/locations",
        regions: ["National"],
        leadTime: "2-5 days",
        primarySpecialtyKey: "general",
      },
    ],
    products: [
      {
        id: "general-protection",
        name: "Surface protection kit",
        description: "Protective board, poly sheeting, and tapes for general construction phases.",
        unit: "kit",
        category: "consumable",
        priceRange: [110, 160],
        vendorIds: ["builder-supply"],
      },
      {
        id: "general-ppe",
        name: "Jobsite PPE bundle",
        description: "Safety glasses, gloves, respirators, and hearing protection set for crew.",
        unit: "bundle",
        category: "consumable",
        priceRange: [75, 110],
        vendorIds: ["builder-supply"],
      },
    ],
  },
  specialty: {
    vendors: [
      {
        id: "specialty-supply",
        name: "Specialty Trades Supply",
        website: "https://www.grainger.com/branchFinder",
        regions: ["National"],
        leadTime: "2-3 days",
        primarySpecialtyKey: "specialty",
      },
    ],
    products: [
      {
        id: "specialty-cleaner",
        name: "Industrial surface prep cleaner",
        description: "Heavy duty cleaner/degreaser for specialty installation prep.",
        unit: "case",
        category: "consumable",
        priceRange: [55, 85],
        vendorIds: ["specialty-supply"],
      },
      {
        id: "specialty-tool-rental",
        name: "Specialty tool rental",
        description: "Allowance for renting specialty tools required for this trade scope.",
        unit: "per day",
        category: "equipment",
        priceRange: [140, 220],
        vendorIds: ["specialty-supply"],
      },
    ],
  },
};

function pickVendorsByLocation(
  vendors: MaterialVendor[],
  locale: LocaleInfo,
): MaterialVendor[] {
  if (!vendors.length) return vendors;
  const state = locale.state?.toUpperCase();
  if (!state) return vendors;

  const matchingState = vendors.filter((vendor) =>
    vendor.states?.some((s) => s.toUpperCase() === state),
  );
  if (matchingState.length) return matchingState;

  if (locale.state) {
    const regionMatches = vendors.filter((vendor) =>
      vendor.regions?.some((region) => regionMatchesState(region, locale.state!)),
    );
    if (regionMatches.length) return regionMatches;
  }

  return vendors;
}

function regionMatchesState(region: string, state: string): boolean {
  const normalizedRegion = region.toLowerCase();
  const normalizedState = state.toLowerCase();
  const regionMap: Record<string, string[]> = {
    northeast: ["me","nh","vt","ma","ri","ct","ny","nj","pa"],
    midatlantic: ["ny","nj","pa","de","md","va"],
    southeast: ["fl","ga","sc","nc","al","ms","tn"],
    south: ["tx","ok","ar","la","ms","al","tn","ky","fl","ga"],
    midwest: ["oh","mi","in","il","wi","mn","ia","mo"],
    west: ["ca","or","wa","nv","az","ut","id"],
    mountain: ["co","ut","wy","mt","id","nm","az"],
    national: [],
  };

  if (normalizedRegion === "national") return true;
  const states = regionMap[normalizedRegion];
  if (!states) return false;
  return states.includes(normalizedState);
}

function vendorScore(vendor: MaterialVendor, specialtyId: string | undefined, category: SpecialtyCategoryId): number {
  let score = 0;
  if (vendor.primarySpecialtyKey && specialtyId && vendor.primarySpecialtyKey === specialtyId) {
    score += 5;
  }
  if (vendor.primarySpecialtyKey && vendor.primarySpecialtyKey === category) {
    score += 3;
  }
  return score;
}

function rankVendorsForLocale(
  vendors: MaterialVendor[]
, locale: LocaleInfo
, specialtyId: string | undefined,
  category: SpecialtyCategoryId,
): MaterialVendor[] {
  if (!vendors.length) return [];
  const state = locale.state?.toLowerCase();
  const stateMatches: MaterialVendor[] = [];
  const regionMatches: MaterialVendor[] = [];
  const national: MaterialVendor[] = [];
  const others: MaterialVendor[] = [];

  vendors.forEach((vendor) => {
    const baseScore = vendorScore(vendor, specialtyId, category);
    if (vendor.states && state) {
      const match = vendor.states.some((s) => s.toLowerCase() === state);
      if (match) {
        stateMatches.push({ ...vendor, _score: baseScore + 4 } as MaterialVendor & { _score: number });
        return;
      }
    }

    if (vendor.regions && vendor.regions.some((region) => regionMatchesState(region, locale.state ?? ""))) {
      regionMatches.push({ ...vendor, _score: baseScore + 2 } as MaterialVendor & { _score: number });
      return;
    }

    if (vendor.regions?.some((region) => region.toLowerCase() === "national")) {
      national.push({ ...vendor, _score: baseScore + 1 } as MaterialVendor & { _score: number });
      return;
    }

    others.push({ ...vendor, _score: baseScore } as MaterialVendor & { _score: number });
  });

  const combined = [...stateMatches, ...regionMatches, ...national, ...others];
  const sorted = combined.sort((a, b) => (b as any)._score - (a as any)._score);
  const seen = new Set<string>();
  return sorted
    .map((vendor) => {
      const { _score, ...rest } = vendor as any;
      return rest as MaterialVendor;
    })
    .filter((vendor) => {
      if (seen.has(vendor.id)) return false;
      seen.add(vendor.id);
      return true;
    });
}

export function getMaterialProfile(specialtyId: string | null | undefined) {
  if (!specialtyId) return null;
  return MATERIAL_PROFILES.find((profile) => profile.specialtyId === specialtyId) ?? null;
}

export function buildMaterialRecommendations(options: {
  specialtyId: string | null | undefined;
  specialtyCategory?: SpecialtyCategoryId;
  locale: LocaleInfo;
  projectSqFt?: number;
  customProducts?: MaterialProduct[];
  customVendors?: MaterialVendor[];
}): MaterialRecommendation[] {
  const profile = getMaterialProfile(options.specialtyId);
  const mergedProducts: MaterialProduct[] = [];
  const mergedVendors: MaterialVendor[] = [];

  if (profile) {
    mergedProducts.push(...profile.products);
    mergedVendors.push(...profile.vendors);
  }
  if (options.customProducts?.length) {
    mergedProducts.push(...options.customProducts);
  }
  if (options.customVendors?.length) {
    mergedVendors.push(...options.customVendors);
  }

  const category = options.specialtyCategory ?? "general";
  const categoryFallback = CATEGORY_FALLBACKS[category];
  if (categoryFallback) {
    if (!mergedProducts.length) {
      mergedProducts.push(...categoryFallback.products);
    }
    if (!mergedVendors.length) {
      mergedVendors.push(...categoryFallback.vendors);
    }
  }

  if (!mergedProducts.length) {
    const generalFallback = CATEGORY_FALLBACKS.general;
    mergedProducts.push(...generalFallback.products);
    mergedVendors.push(...generalFallback.vendors);
  }

  if (!mergedVendors.length) {
    mergedVendors.push(...CATEGORY_FALLBACKS.general.vendors);
  }

  const distinctVendors = mergedVendors.reduce<Record<string, MaterialVendor>>((acc, vendor) => {
    acc[vendor.id] = { ...vendor };
    return acc;
  }, {});

  const activeVendors = Object.values(distinctVendors);
  if (!activeVendors.length) return [];

  const projectSqFt = Number.isFinite(options.projectSqFt) ? options.projectSqFt : undefined;

  return mergedProducts.map((product, index) => {
  const primaryVendorIds = product.vendorIds ?? [];
  const candidateVendors = primaryVendorIds
      .map((vendorId) => distinctVendors[vendorId])
      .filter((vendor): vendor is MaterialVendor => Boolean(vendor));
  const rankedCandidates = rankVendorsForLocale(candidateVendors, options.locale, options.specialtyId ?? undefined, options.specialtyCategory ?? "general");
  const backupRanked = rankVendorsForLocale(activeVendors, options.locale, options.specialtyId ?? undefined, options.specialtyCategory ?? "general");
  const allRanked = [...rankedCandidates, ...backupRanked];
  const distinctRanked = allRanked.filter(
    (vendor, index, self) => self.findIndex((item) => item.id === vendor.id) === index,
  );

  const preferredVendors = distinctRanked.filter(
    (vendor) =>
      (options.specialtyId && vendor.primarySpecialtyKey === options.specialtyId) ||
      vendor.primarySpecialtyKey === (options.specialtyCategory ?? "general"),
  );

  const orderedVendors: MaterialVendor[] = [];
  const addVendor = (vendor: MaterialVendor | undefined) => {
    if (!vendor) return;
    if (orderedVendors.some((entry) => entry.id === vendor.id)) return;
    orderedVendors.push(vendor);
  };

  const fallbackSequence = [...preferredVendors, ...distinctRanked, ...activeVendors];
  fallbackSequence.forEach((vendor) => addVendor(vendor));

  const vendorOptions =
    orderedVendors.length >= 4 ? orderedVendors.slice(0, 4) : orderedVendors.slice(0, 4);
  const primaryVendor = vendorOptions[0] ?? activeVendors[0];

    const quantity = (() => {
      if (!projectSqFt || !product.coverageSqFt || product.unit === "per day") return undefined;
      const raw = projectSqFt / product.coverageSqFt;
      if (!Number.isFinite(raw)) return undefined;
      const rounded = Math.ceil(raw * 1.1 * 10) / 10;
      return rounded > 0 ? rounded : undefined;
    })();

    const priceMidpoint = (() => {
      if (!product.priceRange) return undefined;
      const [min, max] = product.priceRange;
      return (min + max) / 2;
    })();

    const totalEstimatedCost = quantity && priceMidpoint ? quantity * priceMidpoint : undefined;

    return {
      id: `${product.id}-${index}`,
      name: product.name,
      description: product.description,
      unit: product.unit,
      category: product.category,
      vendor: primaryVendor,
      vendorOptions,
      priceRange: product.priceRange,
      quantity,
      coverageSqFt: product.coverageSqFt,
      totalEstimatedCost,
      notes: product.notes,
    };
  });
}
