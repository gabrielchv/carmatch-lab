import { addItem, clearData } from "./db";
import { generateId, nowISO } from "./utils";
import { runMatching } from "./matching";
import { fetchFipeBrands, fetchFipeModels, fetchFipeYears, fetchFipePrice } from "./fipe-api";
import { parseFipeModels } from "./fipe-utils";
import type { User, CarPost, DesiredVehicle } from "./types";
import type { FipeBrand } from "./fipe-api";

// ──────────────────────────────────────────────
// Users — hardcoded (people, not car data)
// FIPE doesn't have user data.
// ──────────────────────────────────────────────

const MOCK_USERS: { name: string; email: string }[] = [
  { name: "Carlos Silva", email: "carlos@email.com" },
  { name: "Ana Oliveira", email: "ana@email.com" },
  { name: "Roberto Santos", email: "roberto@email.com" },
  { name: "Juliana Costa", email: "juliana@email.com" },
  { name: "Fernando Lima", email: "fernando@email.com" },
  { name: "Mariana Souza", email: "mariana@email.com" },
  { name: "Lucas Pereira", email: "lucas@email.com" },
  { name: "Camila Rocha", email: "camila@email.com" },
];

// ──────────────────────────────────────────────
// Lookup config — search params for the FIPE API.
// These tell the seed WHAT to fetch. They are search
// parameters, not seed output — no hardcoded years,
// titles, descriptions, cash, or WhatsApp here.
// ──────────────────────────────────────────────

interface LookupEntry {
  brand: string;
  model: string;       // General model name (first word of FIPE name)
  preferAuto: boolean; // Prefer automatic transmission version
}

const SEED_LOOKUPS: LookupEntry[] = [
  // 0-7: Primary cars — each produces one post
  { brand: "Honda",           model: "Fit",     preferAuto: true  },
  { brand: "Toyota",          model: "Prius",   preferAuto: true  },
  { brand: "Fiat",            model: "Uno",     preferAuto: false },
  { brand: "VW - VolksWagen", model: "Gol",     preferAuto: false },
  { brand: "GM - Chevrolet",  model: "Onix",    preferAuto: true  },
  { brand: "GM - Chevrolet",  model: "Cruze",   preferAuto: true  },
  { brand: "Ford",            model: "Ka",      preferAuto: false },
  { brand: "Hyundai",         model: "HB20",    preferAuto: true  },
  // 8-9: Reference cars — fetched for desired-vehicle data, no post created
  { brand: "Jeep",            model: "Compass", preferAuto: true  },
  { brand: "Renault",         model: "Duster",  preferAuto: true  },
];

// Which lookup indices produce actual posts — these become CarPosts
const POST_LOOKUP_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 3, 7];

// Map post index (position in POST_LOOKUP_INDICES) → user index
const POST_USER_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1];

// Per-post colour assignments — richer spread across the 15 defined colours
const POST_COLORS = [
  "Branco",   // 0: Fit
  "Preto",    // 1: Prius
  "Prata",    // 2: Uno
  "Azul",     // 3: Gol
  "Vermelho", // 4: Onix
  "Cinza",    // 5: Cruze
  "Marrom",   // 6: Ka
  "Verde",    // 7: HB20
  "Branco",   // 8: Gol (Match Perfeito pair — same color as HB20)
  "Branco",   // 9: HB20 (Match Perfeito pair)
];

// Per-post location — spread across states and macro-regions
const POST_CITIES = [
  "São Paulo - SP",       // 0: Fit      → Sudeste
  "São Paulo - SP",       // 1: Prius    → Sudeste
  "Campinas - SP",        // 2: Uno      → Sudeste
  "São Paulo - SP",       // 3: Gol      → Sudeste
  "Belo Horizonte - MG",  // 4: Onix     → Sudeste
  "Belo Horizonte - MG",  // 5: Cruze    → Sudeste
  "Porto Alegre - RS",    // 6: Ka       → Sul
  "Salvador - BA",        // 7: HB20     → Nordeste
  "São Paulo - SP",       // 8: Gol (Match Perfeito pair — same city as HB20)
  "São Paulo - SP",       // 9: HB20 (Match Perfeito pair)
];

// Per-post maxDistance — tests the location gate when both sides have it
const POST_MAX_DISTANCE = [
  undefined, undefined, undefined, undefined,
  200,  // 4: Onix — same city as Cruze, both MG, passes gate
  200,  // 5: Cruze
  undefined, undefined,
  undefined, undefined,
];

// Each entry: [postIndex, desiredCarLookupIndex]
// The post at postIndex wants a car matching the FIPE data at desiredCarLookupIndex.
const SEED_WANTS: [number, number][] = [
  [0, 1],  // Honda Fit       → wants a car like the Toyota Prius
  [1, 0],  // Toyota Prius    → wants a car like the Honda Fit
  [2, 3],  // Fiat Uno        → wants a car like the VW Gol
  [3, 2],  // VW Gol          → wants a car like the Fiat Uno
  [4, 5],  // Chevy Onix      → wants any Chevy (brand-only match)
  [5, 4],  // Chevy Cruze     → wants any Chevy (brand-only match)
  [6, 8],  // Ford Ka         → wants a car like the Jeep Compass
  [7, 9],  // Hyundai HB20    → wants a car like the Renault Duster
  [8, 7],  // VW Gol (2023)   → wants a car like the Hyundai HB20 (Match Perfeito)
  [9, 3],  // Hyundai HB20    → wants a car like the VW Gol (Match Perfeito)
];

// ──────────────────────────────────────────────
// Chain-forming extra wants
//
// Pairwise swaps are sparse: A must want B AND B must want A. These extra
// wants close directed rings so a fresh seed always exercises the chain
// engine:
//   0 Fit → 1 Prius → 2 Uno → 0 Fit                  (3-cycle)
//   3 Gol → 4 Onix → 5 Cruze → 6 Ka → 3 Gol          (4-cycle)
//   0 Fit → 1 Prius → 2 Uno → 3 Gol → 4 Onix → 0 Fit (5-cycle)
//
// Cash comes from the FIPE value difference, so each ring's net cash sums to
// zero and the /correntes page has feasible examples to show.
// ──────────────────────────────────────────────
const SEED_EXTRA_WANTS: [number, number][] = [
  [1, 2], // Prius → Uno
  [2, 0], // Uno → Fit
  [3, 4], // Gol → Onix
  [5, 6], // Cruze → Ka
  [6, 3], // Ka → Gol
  [4, 0], // Onix → Fit
];

// Per-want mileage bounds — exercises the new mileageMin/mileageMax scoring
// Position i corresponds to SEED_WANTS[i]
const WANT_MILEAGE_BOUNDS: [number | undefined, number | undefined][] = [
  [undefined, 80000],   // 0: Fit → Prius, max 80k km
  [undefined, 100000],  // 1: Prius → Fit, max 100k km
  [undefined, 60000],   // 2: Uno → Gol, max 60k km
  [undefined, 80000],   // 3: Gol → Uno, max 80k km
  [undefined, 50000],   // 4: Onix → Cruze, max 50k km
  [undefined, 50000],   // 5: Cruze → Onix, max 50k km
  [undefined, 40000],   // 6: Ka → Compass, max 40k km
  [undefined, 40000],   // 7: HB20 → Duster, max 40k km
  [undefined, 50000],   // 8: Gol → HB20, max 50k km
  [undefined, 50000],   // 9: HB20 → Gol, max 50k km
];

// ──────────────────────────────────────────────
// Cache helpers
// ──────────────────────────────────────────────

let _brandsCache: FipeBrand[] | null = null;

async function findBrandCode(name: string): Promise<string> {
  if (!_brandsCache) _brandsCache = await fetchFipeBrands();
  const match = _brandsCache.find((b) => b.nome.toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`Marca "${name}" não encontrada na Tabela FIPE`);
  return match.codigo;
}

const parsedCache = new Map<string, ReturnType<typeof parseFipeModels>>();

async function getParsedModels(brandCode: string) {
  if (parsedCache.has(brandCode)) return parsedCache.get(brandCode)!;
  const raw = await fetchFipeModels(brandCode);
  const parsed = parseFipeModels(raw);
  parsedCache.set(brandCode, parsed);
  return parsed;
}

const yearsCache = new Map<string, { value: string; yearNum: number }[]>();

async function getYearOptions(brandCode: string, modelCode: string) {
  const key = `${brandCode}-${modelCode}`;
  if (yearsCache.has(key)) return yearsCache.get(key)!;
  const raw = await fetchFipeYears(brandCode, modelCode);
  const mapped = raw.map((y) => ({
    value: y.codigo,
    yearNum: parseInt(y.codigo.split("-")[0], 10),
  }));
  yearsCache.set(key, mapped);
  return mapped;
}

// ──────────────────────────────────────────────
// Resolve one car from FIPE
// ──────────────────────────────────────────────

interface ResolvedCar {
  brand: string;
  generalModel: string;        // First word of FIPE name
  version: string;             // Version string (transmission suffix stripped)
  transmission: string | null; // "Automático" | "Manual" | null
  fullModelName: string;       // Full FIPE name
  year: number;
  estimatedValue: number;
}

async function resolveCarFromFipe(lookup: LookupEntry): Promise<ResolvedCar> {
  const brandCode = await findBrandCode(lookup.brand);
  const parsed = await getParsedModels(brandCode);

  const match = parsed.generalModels.find(
    (gm) => gm.toLowerCase() === lookup.model.toLowerCase()
  );
  if (!match) {
    throw new Error(
      `Modelo "${lookup.model}" da marca "${lookup.brand}" não encontrado. ` +
      `Disponíveis: ${parsed.generalModels.join(", ")}`
    );
  }

  const versions = parsed.versionsByGeneralModel[match]
    // Sort by modelCode descending — higher codes tend to be newer FIPE entries
    .sort((a, b) => parseInt(b.modelCode) - parseInt(a.modelCode));
  let chosenVersion = versions[0];
  if (lookup.preferAuto) {
    const auto = versions.find((v) => v.transmission === "Automático");
    if (auto) chosenVersion = auto;
  }

  const yearOpts = await getYearOptions(brandCode, chosenVersion.modelCode);
  // Pick the latest available year — no hardcoded target.
  const latestYear = yearOpts[yearOpts.length - 1];
  if (!latestYear) {
    throw new Error(`Nenhum ano para ${lookup.brand} ${chosenVersion.fullName}`);
  }

  const priceData = await fetchFipePrice(brandCode, chosenVersion.modelCode, latestYear.value);
  const cleaned = priceData.Valor.replace(/[R$\s.]/g, "").replace(",", ".");
  const price = parseFloat(cleaned);
  if (isNaN(price)) throw new Error(`Preço FIPE inválido: "${priceData.Valor}"`);

  return {
    brand: lookup.brand,
    generalModel: match,
    version: chosenVersion.version,
    transmission: chosenVersion.transmission,
    fullModelName: chosenVersion.fullName,
    year: priceData.AnoModelo,
    estimatedValue: Math.round(price),
  };
}

// ──────────────────────────────────────────────
// Desired-vehicle builder
// ──────────────────────────────────────────────

function buildWant(
  car: ResolvedCar,
  targetCar: ResolvedCar,
  options: {
    brandOnly?: boolean;
    /** Omit version/transmission — used for chain-only wants. */
    loose?: boolean;
    mileageMin?: number;
    mileageMax?: number;
  } = {}
): DesiredVehicle {
  // Cash is the price gap between the two cars. In a ring these values cancel
  // exactly, which is what makes the seeded chains feasible.
  const cashAdjustment = targetCar.estimatedValue - car.estimatedValue;

  return {
    brand: targetCar.brand,
    model: options.brandOnly ? "" : targetCar.generalModel,
    version:
      options.brandOnly || options.loose ? undefined : targetCar.version,
    transmission:
      options.brandOnly || options.loose
        ? undefined
        : (targetCar.transmission ?? undefined),
    yearMin: targetCar.year - 3,
    yearMax: targetCar.year + 3,
    mileageMin: options.mileageMin,
    mileageMax: options.mileageMax,
    cashAdjustment,
    cashAdjustmentTolerance: Math.max(
      1,
      Math.round(0.2 * Math.abs(cashAdjustment))
    ),
  };
}

// ──────────────────────────────────────────────
// Main seed function
// ──────────────────────────────────────────────

export async function seedDatabase(): Promise<{
  users: User[];
  posts: CarPost[];
  matchCount: number;
}> {
  clearData("users");
  clearData("posts");
  clearData("matches");
  clearData("conversations");
  clearData("messages");

  // Users
  const users: User[] = MOCK_USERS.map((u) => ({
    id: generateId(),
    name: u.name,
    email: u.email,
    provider: "email" as const,
    createdAt: nowISO(),
  }));
  for (const user of users) addItem("users", user);

  // Reset caches so each seed run fetches fresh FIPE data
  _brandsCache = null;
  parsedCache.clear();
  yearsCache.clear();

  // ── Pass 1: resolve ALL lookups from FIPE ──
  const resolved: ResolvedCar[] = [];
  for (const lookup of SEED_LOOKUPS) {
    resolved.push(await resolveCarFromFipe(lookup));
  }

  // ── Pass 2: build posts with everything derived from FIPE ──
  const currentYear = new Date().getFullYear();
  const posts: CarPost[] = POST_LOOKUP_INDICES.map((lookupIndex, postIndex) => {
    const car = resolved[lookupIndex];

    // Find what this post wants
    const want = SEED_WANTS.find((w) => w[0] === postIndex)!;
    const targetIndex = want[1];
    const targetCar = resolved[targetIndex];

    // Chevrolet pair (4↔5) is brand-only — strip model/version/transmission
    const isBrandOnly =
      (postIndex === 4 && targetIndex === 5) ||
      (postIndex === 5 && targetIndex === 4);

    // Cash derived from FIPE price difference between the two cars.
    // Positive = this post pays cash on top; negative = receives cash.
    // Year range is centred on the target car's actual FIPE year.
    // Mileage bounds for this want (exercises the new scoring).
    const wantMileageBounds = WANT_MILEAGE_BOUNDS.find((_, wi) => {
      const sw = SEED_WANTS[wi];
      return sw && sw[0] === postIndex;
    });

    const desiredVehicle: DesiredVehicle = buildWant(car, targetCar, {
      brandOnly: isBrandOnly,
      mileageMin: wantMileageBounds?.[0],
      mileageMax: wantMileageBounds?.[1],
    });

    // Title auto-generated from FIPE data — never a hardcoded year.
    const title = `${car.brand} ${car.fullModelName} ${car.year}`;

    // Realistic mileage based on car age (~12k km/year, minimum 5k)
    const carAge = Math.max(1, currentYear - car.year);
    const mileage = Math.round(Math.min(5000 + carAge * 12000, 200000));

    return {
      id: generateId(),
      userId: users[POST_USER_INDICES[postIndex]].id,
      title,
      description: "",
      car: {
        brand: car.brand,
        model: car.fullModelName,
        year: car.year,
        estimatedValue: car.estimatedValue,
        mileage,
        color: POST_COLORS[postIndex],
        localization: POST_CITIES[postIndex],
      },
      desiredTrade: {
        vehicles: [desiredVehicle],
        maxDistance: POST_MAX_DISTANCE[postIndex],
      },
      contactInfo: {
        whatsapp: undefined,
        email: users[POST_USER_INDICES[postIndex]].email,
      },
      images: [],
      createdAt: nowISO(),
      isActive: true,
    };
  });

  for (const [postIndex, targetIndex] of SEED_EXTRA_WANTS) {
    const car = resolved[POST_LOOKUP_INDICES[postIndex]];
    const targetCar = resolved[targetIndex];
    // Loose wants (brand + general model only) avoid FIPE spelling quirks
    // such as "Aut" without the dot, which the existing exact transmission
    // gate does not accept. Pairwise behaviour is untouched because these
    // wants only exist for chain edges.
    posts[postIndex].desiredTrade.vehicles.push(
      buildWant(car, targetCar, { mileageMax: 120000, loose: true })
    );
  }

  for (const post of posts) addItem("posts", post);

  const newMatches = runMatching();
  return { users, posts, matchCount: newMatches.length };
}
