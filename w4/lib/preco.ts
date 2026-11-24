/**
 * Preço — a heuristic valuation model for a used car in Brazil.
 *
 * The product thesis: a listing's value is a number the owner typed, and FIPE
 * is a reference table, not a market price. Two identical cars differ by ~30%
 * on mileage, condition and history. This module turns "o dono pede R$ X" into
 * a defensible number *with its reasoning attached* — the breakdown is the
 * product, not the total.
 *
 * Design constraints:
 *
 *   · PURE. No `node:fs`, no `fetch`, no I/O of any kind, so the exact same
 *     math runs in a server route, a server component and a client component.
 *   · Every constant is a documented choice, not a magic number. They are
 *     heuristics calibrated to be *small*: the declared value stays the
 *     anchor, and no single adjustment is allowed to dominate it.
 *   · `breakdown` sums EXACTLY to `fairValue`: each line is rounded once, and
 *     the total is the sum of the rounded lines. A panel that says "total"
 *     next to lines that do not add up destroys the entire premise.
 *   · Honest by construction: the score label is derived from the band, so the
 *     text ("justo") and the numbers can never disagree.
 *
 * It is NOT a replacement for an inspection (laudo) or a real FIPE lookup.
 * FIPE is not consulted here: the model starts from the owner's number and
 * reasons *relative* to it. That is deliberate — it works logged out, offline,
 * and for any car the FIPE tables do not know.
 */

import type { CarPost } from "./types";
import { formatBRL } from "./cash";

/* ─── Types ────────────────────────────────────────────────────── */

export type BodyType = "SUV" | "Hatch" | "Sedan" | "Caminhonete" | "Outro";

export type PriceScore = "abaixo do mercado" | "justo" | "acima do mercado";

/** Owner-declared condition items. All optional: absence means "not declared". */
export interface CarExtras {
  singleOwner?: boolean;
  fullServiceHistory?: boolean;
  recentlyServiced?: boolean;
  newTyres?: boolean;
  neverCrashed?: boolean;
}

export type ExtraKey = keyof CarExtras;

export interface ValuationInput {
  brand?: string;
  model: string;
  year: number;
  estimatedValue: number;
  mileage?: number;
  extras?: CarExtras;
  /** Override for tests and for reproducible examples. Defaults to this year. */
  referenceYear?: number;
}

export interface BreakdownLine {
  /** Stable id so React lists and tests can address a line. */
  key: string;
  /** Human sentence (pt-BR) explaining WHY the number moved. */
  reason: string;
  /** Signed amount in BRL. Positive adds value, negative removes it. */
  impactBRL: number;
}

export interface Valuation {
  /** Sum of `breakdown`. Never shown without the breakdown. */
  fairValue: number;
  /** Plausible market range around the fair value. */
  low: number;
  high: number;
  /** The owner's declared number (the model's anchor). */
  ask: number;
  /** ask - fairValue. Positive = asking above the model. */
  delta: number;
  /** delta / fairValue, as a ratio (0.07 = 7% above). */
  deltaPct: number;
  score: PriceScore;
  bodyType: BodyType;
  /** Expected mileage for the car's age, from the Brazilian annual average. */
  expectedMileage: number;
  mileage?: number;
  /** mileage - expectedMileage (undefined when km was not informed). */
  mileageDelta?: number;
  ageYears: number;
  referenceYear: number;
  breakdown: BreakdownLine[];
}

export interface RecommendedSplit {
  /**
   * Amount A pays B. Positive = A pays B, negative = B pays A.
   * Same sign convention as `Match.suggestedCashFromA` — do not invert.
   */
  fromAtoB: number;
  /** Conservative end of the settlement band (A pays less / receives more). */
  low: number;
  /** Aggressive end of the settlement band. */
  high: number;
  reason: string;
  valuationA: Valuation;
  valuationB: Valuation;
}

/* ─── Model constants (each one is a deliberate, documented choice) ── */

/**
 * Expected annual use, in km.
 *
 * ~13.000 km/ano is the commonly used Brazilian average for a private car
 * (roughly 35 km/day). It is the *line of base* for the mileage curve: below
 * it a car is considered lightly used, above it heavily used. Using a single
 * national figure (instead of city-by-city) keeps the model explicable; an
 * urban car that does 8.000 km/ano really is below the national average.
 */
export const KM_PER_YEAR = 13_000;

/**
 * How hard mileage above the expected curve hurts the price.
 *
 * 0.35 means: each 10% above expected mileage removes 3.5% of value, so a car
 * at 200% of the expected km loses 35% (before the cap). Mileage is the
 * strongest condition signal a listing carries and the used market discounts
 * high-km cars aggressively; 35% at double the expected use approximates the
 * spreads actually seen between two otherwise identical listings.
 */
export const MILEAGE_PENALTY_SLOPE = 0.35;

/**
 * Ceiling for the mileage penalty: −25%.
 *
 * Beyond roughly 70% over the expected km the car is already being sold as a
 * "rodado" car, and the remaining discount lives in year/condition. Uncapped,
 * a taxi with 500.000 km would be valued near zero even though it still has a
 * real market price — the cap keeps the model inside reality.
 */
export const MILEAGE_PENALTY_CAP = 0.25;

/**
 * How much low mileage is credited.
 *
 * 0.15 means each 10% below expected km earns 1.5% of value. It is
 * deliberately HALF the high-mileage slope: buyers pay a premium for low km,
 * but a smaller one — and it saturates quickly, because after a point the car
 * is simply "low km" and other factors take over.
 */
export const LOW_MILEAGE_CREDIT_SLOPE = 0.15;

/**
 * Ceiling for the low-mileage credit: +6%.
 *
 * A 2019 car with 20.000 km is worth more than the same car with 70.000 km,
 * but not proportionally more: rubber, fluids and seals age with time too.
 * 6% is the largest premium this model will defend without an inspection.
 */
export const LOW_MILEAGE_CREDIT_CAP = 0.06;

/**
 * Age window during which FIPE already accounts for depreciation.
 *
 * FIPE publishes a price per year-model, so normal year-over-year depreciation
 * is ALREADY inside any FIPE-derived number (and inside the owner's ask when
 * they typed a FIPE value). Charging depreciation again for the first years
 * would double count it. Three years is the window where model-year pricing
 * is most reliable and the car is still "seminovo" for financing/insurance.
 */
export const AGE_FREE_YEARS = 3;

/**
 * Extra age discount beyond the free window: −1.2% per year.
 *
 * Not depreciation (that is in FIPE) — it prices the *friction* of an older
 * car: harder financing, dearer insurance, parts availability concerns and a
 * smaller pool of buyers. 1.2%/year is intentionally much smaller than real
 * depreciation so the model never claims to re-price the car.
 */
export const AGE_PENALTY_PER_YEAR = 0.012;

/**
 * Ceiling for the age discount: −12%.
 *
 * Ten years past the free window is enough to price the friction; beyond that
 * the market is already pricing the car as a used/old car, and the mileage
 * curve is doing the heavy lifting.
 */
export const AGE_PENALTY_CAP = 0.12;

/**
 * Body-type adjustment relative to the declared/FIPE reference.
 *
 * Why per body type at all: FIPE tracks model-year price, not the demand
 * premium a body style carries in the used market. In Brazil:
 *   · SUV +4% — family demand for high-riding cars keeps used SUVs above the
 *     reference; kept small because FIPE already reflects segment pricing.
 *   · Caminhonete +6% — pickups (especially diesel 4x4) are the most
 *     demand-inelastic used segment (agro and fleet buyers), commonly
 *     negotiated above FIPE.
 *   · Hatch −2% — the most abundant body in the used market; buyers have the
 *     most alternatives, so there is more room to negotiate below reference.
 *   · Sedan 0% — the neutral baseline; FIPE tracking is tightest here.
 *   · Outro 0% — unknown body, no claim.
 */
export const BODY_ADJUSTMENT: Record<BodyType, number> = {
  SUV: 0.04,
  Caminhonete: 0.06,
  Hatch: -0.02,
  Sedan: 0,
  Outro: 0,
};

/**
 * Owner-declared condition items, each a small explicit premium.
 *
 * These are claims the owner makes, not verified facts — so each one is worth
 * little on its own. Together they matter, which is why there is a cap below.
 */
export const EXTRA_ADJUSTMENT: Record<ExtraKey, number> = {
  /** One owner from new: a shorter, more traceable history. 1.5%. */
  singleOwner: 0.015,
  /** Full service book / all revisions: the strongest condition evidence. 2.5%. */
  fullServiceHistory: 0.025,
  /** Serviced recently: immediate maintenance cost avoided. 1.0%. */
  recentlyServiced: 0.01,
  /** New tyres: a real, easily priced cost avoided. 1.0%. */
  newTyres: 0.01,
  /** Never crashed (owner-declared): structural-history premium. 2.0%. */
  neverCrashed: 0.02,
};

/**
 * Total cap for declared extras: +6%.
 *
 * The five items sum to +8%. Without a cap, ticking every box would inflate a
 * car by 8% on nothing but the owner's word. The cap keeps the whole extras
 * block smaller than the mileage penalty can be, and is applied as an explicit
 * correction line in the breakdown so the total is never a silent ceiling.
 */
export const EXTRAS_TOTAL_CAP = 0.06;

/**
 * Width of the fair-value band: ±6%.
 *
 * The band covers what the model cannot see: paint/panel condition, tyres not
 * declared, accident history not declared, regional price differences. ±6% is
 * narrower than the ~30% spread between identical cars because mileage, age,
 * body and declared extras are already modelled — the band is residual
 * uncertainty, not the whole story.
 */
export const BAND_PCT = 0.06;

/** Oldest model year the model will accept; below this the data is noise. */
export const MIN_YEAR = 1950;

/**
 * User-facing disclaimer. Kept here so the API, the listing panel and the
 * calculator all quote the exact same limitation.
 */
export const PRECO_DISCLAIMER =
  "Heurística a partir do valor declarado e dos dados do anúncio. Não substitui inspeção presencial nem laudo.";

/** Short list of assumptions rendered in the calculator ("premissas"). */
export const PRECO_ASSUMPTIONS: { title: string; detail: string }[] = [
  {
    title: "Uso esperado",
    detail: `${KM_PER_YEAR.toLocaleString("pt-BR")} km por ano — média brasileira usada como linha de base.`,
  },
  {
    title: "Quilometragem",
    detail: `Acima do esperado: até −${pct(MILEAGE_PENALTY_CAP)} (${pct(
      MILEAGE_PENALTY_SLOPE / 10
    )} a cada 10% de excesso). Abaixo: até +${pct(LOW_MILEAGE_CREDIT_CAP)} (${pct(
      LOW_MILEAGE_CREDIT_SLOPE / 10
    )} a cada 10% de folga).`,
  },
  {
    title: "Idade",
    detail: `Os primeiros ${AGE_FREE_YEARS} anos já estão na FIPE; depois, −${pct(
      AGE_PENALTY_PER_YEAR
    )} por ano, limitado a −${pct(AGE_PENALTY_CAP)}.`,
  },
  {
    title: "Carroceria",
    detail: `SUV +${pct(BODY_ADJUSTMENT.SUV)}, caminhonete +${pct(
      BODY_ADJUSTMENT.Caminhonete
    )}, hatch ${pct(BODY_ADJUSTMENT.Hatch)}, sedan 0%.`,
  },
  {
    title: "Conservação declarada",
    detail: `Cada item soma um pouco; o bloco inteiro tem teto de +${pct(
      EXTRAS_TOTAL_CAP
    )}.`,
  },
  {
    title: "Faixa",
    detail: `±${pct(BAND_PCT)} ao redor do valor justo — a incerteza do que não está no anúncio.`,
  },
];

/* ─── Labels ───────────────────────────────────────────────────── */

export const EXTRA_KEYS: ExtraKey[] = [
  "singleOwner",
  "fullServiceHistory",
  "recentlyServiced",
  "newTyres",
  "neverCrashed",
];

export const EXTRA_LABELS: Record<ExtraKey, string> = {
  singleOwner: "Único dono",
  fullServiceHistory: "Histórico completo de revisões",
  recentlyServiced: "Revisão recente",
  newTyres: "Pneus novos",
  neverCrashed: "Nunca batido (declarado)",
};

/* ─── Helpers ──────────────────────────────────────────────────── */

/** "6%" / "1,2%" — pt-BR number formatting for model percentages. */
function pct(ratio: number): string {
  return `${(ratio * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;
}

/** "108.500 km" */
function km(value: number): string {
  return `${Math.round(value).toLocaleString("pt-BR")} km`;
}

function clampYear(year: number, referenceYear: number): number {
  if (!Number.isFinite(year)) return referenceYear;
  return Math.min(referenceYear + 1, Math.max(MIN_YEAR, Math.round(year)));
}

/**
 * Expected mileage for a model year, as of `referenceYear`.
 *
 * The +0.5 accounts for the fact that a model-year car is sold partway
 * through the year: a 2024 car in 2026 has had ~2.5 years of use, not a clean
 * 2. Without it, brand-new cars would look "above expected" on day one.
 * The floor of one year keeps the ratio well-defined for future model years.
 */
export function expectedMileage(year: number, referenceYear: number): number {
  const yearsInUse = Math.max(1, referenceYear - year + 0.5);
  return Math.round(yearsInUse * KM_PER_YEAR);
}

/* ─── Body type inference ──────────────────────────────────────── */

/**
 * Explicit body-type words in the FIPE name win. The FIPE model list mixes
 * "HB20 Hatch", "Corolla Sedan", "Compass SUV" with plain names, so when the
 * word is present it is authoritative.
 */
const BODY_KEYWORDS: { re: RegExp; type: BodyType }[] = [
  { re: /\b(caminhonete|pick-?up|picape)\b/i, type: "Caminhonete" },
  { re: /\b(suv|crossover)\b/i, type: "SUV" },
  { re: /\b(hatchback|hatch)\b/i, type: "Hatch" },
  { re: /\bsed[aã]n\b/i, type: "Sedan" },
];

/**
 * Short, deliberate lookup for very common Brazilian models whose FIPE name
 * omits the body type ("Fit CX 1.4", "Corolla GLi").
 *
 * The list is kept small on purpose: an unknown model is classified "Outro"
 * and receives NO body adjustment, which is the honest outcome. Guessing from
 * a giant table would quietly apply a premium the model cannot defend.
 */
const KNOWN_BODY: Record<string, BodyType> = {
  // Hatches
  fit: "Hatch",
  gol: "Hatch",
  uno: "Hatch",
  onix: "Hatch",
  hb20: "Hatch",
  ka: "Hatch",
  argo: "Hatch",
  palio: "Hatch",
  polo: "Hatch",
  mobi: "Hatch",
  kwid: "Hatch",
  prius: "Hatch",
  // Sedans
  corolla: "Sedan",
  civic: "Sedan",
  cruze: "Sedan",
  virtus: "Sedan",
  cronos: "Sedan",
  sentra: "Sedan",
  // SUVs
  compass: "SUV",
  duster: "SUV",
  creta: "SUV",
  hrv: "SUV",
  tcross: "SUV",
  renegade: "SUV",
  kicks: "SUV",
  tracker: "SUV",
  // Caminhonetes / picapes
  hilux: "Caminhonete",
  ranger: "Caminhonete",
  s10: "Caminhonete",
  toro: "Caminhonete",
  strada: "Caminhonete",
  saveiro: "Caminhonete",
  amarok: "Caminhonete",
  l200: "Caminhonete",
};

/**
 * Infers the body type from the model name.
 *
 * Order: explicit keyword → known first token (hyphens stripped, so "HR-V"
 * and "T-Cross" work) → "Outro". Never throws; never guesses beyond the table.
 */
export function inferBodyType(model: string): BodyType {
  const name = (model || "").toLowerCase();

  for (const rule of BODY_KEYWORDS) {
    if (rule.re.test(name)) return rule.type;
  }

  const firstToken = name
    .split(/[\s/]+/)
    .find((token) => token.length > 0)
    ?.replace(/[^a-z0-9-]/g, "");

  if (!firstToken) return "Outro";

  return KNOWN_BODY[firstToken] ?? KNOWN_BODY[firstToken.replace(/-/g, "")] ?? "Outro";
}

/* ─── Valuation ────────────────────────────────────────────────── */

/**
 * Values one car.
 *
 * Every adjustment is computed from the declared value (`base`) and rounded
 * once. `fairValue` is the sum of the rounded lines, which is what makes the
 * "breakdown sums to the total" guarantee exact rather than approximate.
 */
export function valuate(input: ValuationInput): Valuation {
  const referenceYear = input.referenceYear ?? new Date().getFullYear();
  const year = clampYear(input.year, referenceYear);
  // Guard against NaN/Infinity from form input: they would poison every line.
  const requested = Number.isFinite(input.estimatedValue) ? input.estimatedValue : 0;
  const base = Math.max(0, Math.round(requested));

  const mileage =
    input.mileage !== undefined &&
    Number.isFinite(input.mileage) &&
    input.mileage >= 0
      ? Math.round(input.mileage)
      : undefined;

  const extras = input.extras ?? {};
  const bodyType = inferBodyType(input.model);
  const expected = expectedMileage(year, referenceYear);
  const ageYears = Math.max(0, referenceYear - year);

  const breakdown: BreakdownLine[] = [
    {
      key: "base",
      reason: "Valor declarado pelo dono (ponto de partida)",
      impactBRL: base,
    },
  ];

  /* ── Mileage vs the expected-use curve ── */
  let mileageDelta: number | undefined;
  if (mileage === undefined) {
    breakdown.push({
      key: "mileage",
      reason: "Quilometragem não informada — sem ajuste",
      impactBRL: 0,
    });
  } else {
    mileageDelta = mileage - expected;
    const ratio = (mileage - expected) / expected;

    if (ratio > 0) {
      const penalty = Math.min(MILEAGE_PENALTY_CAP, ratio * MILEAGE_PENALTY_SLOPE);
      breakdown.push({
        key: "mileage",
        reason: `${km(mileage)} contra ${km(expected)} esperados (${pct(
          ratio
        )} acima) — desgaste`,
        impactBRL: -Math.round(base * penalty),
      });
    } else if (ratio < 0) {
      const credit = Math.min(LOW_MILEAGE_CREDIT_CAP, -ratio * LOW_MILEAGE_CREDIT_SLOPE);
      breakdown.push({
        key: "mileage",
        reason: `${km(mileage)} contra ${km(expected)} esperados (${pct(
          -ratio
        )} abaixo) — bônus de uso baixo`,
        impactBRL: Math.round(base * credit),
      });
    } else {
      breakdown.push({
        key: "mileage",
        reason: `${km(mileage)} — exatamente na média esperada, sem ajuste`,
        impactBRL: 0,
      });
    }
  }

  /* ── Age beyond the free window ── */
  const agePct = -Math.min(
    AGE_PENALTY_CAP,
    Math.max(0, ageYears - AGE_FREE_YEARS) * AGE_PENALTY_PER_YEAR
  );
  breakdown.push({
    key: "age",
    reason:
      ageYears <= AGE_FREE_YEARS
        ? `Ano ${year}: dentro da janela de ${AGE_FREE_YEARS} anos — a FIPE já embute a depreciação por ano-modelo`
        : `Ano ${year} (${ageYears} anos): ${pct(
            -agePct
          )} além da depreciação já embutida na FIPE`,
    impactBRL: Math.round(base * agePct),
  });

  /* ── Body type ── */
  const bodyPct = BODY_ADJUSTMENT[bodyType] ?? 0;
  breakdown.push({
    key: "body",
    reason:
      bodyType === "Outro"
        ? "Carroceria não identificada pelo nome do modelo — sem ajuste"
        : bodyType === "Sedan"
          ? "Carroceria Sedan: referência neutra, sem ajuste"
          : `Carroceria ${bodyType}: ${
              bodyPct > 0 ? "prêmio" : "desconto"
            } de mercado (${pct(Math.abs(bodyPct))})`,
    impactBRL: Math.round(base * bodyPct),
  });

  /* ── Owner-declared extras, with a total cap ── */
  const selected = EXTRA_KEYS.filter((key) => extras[key]);
  if (selected.length === 0) {
    breakdown.push({
      key: "extras",
      reason: "Nenhum item de conservação declarado — sem ajuste",
      impactBRL: 0,
    });
  } else {
    let sumPct = 0;
    let sumImpact = 0;
    for (const key of selected) {
      const extraPct = EXTRA_ADJUSTMENT[key];
      const impact = Math.round(base * extraPct);
      sumPct += extraPct;
      sumImpact += impact;
      breakdown.push({
        key: `extra:${key}`,
        reason: `${EXTRA_LABELS[key]} (+${pct(extraPct)})`,
        impactBRL: impact,
      });
    }

    if (sumPct > EXTRAS_TOTAL_CAP) {
      // Correction against the *rounded* sum, so the extras block lands exactly
      // on the cap and the overall total still equals fairValue.
      const cappedImpact = Math.round(base * EXTRAS_TOTAL_CAP);
      breakdown.push({
        key: "extrasCap",
        reason: `Limite total de itens de conservação (+${pct(EXTRAS_TOTAL_CAP)})`,
        impactBRL: cappedImpact - sumImpact,
      });
    }
  }

  const fairValue = Math.max(
    0,
    breakdown.reduce((sum, line) => sum + line.impactBRL, 0)
  );
  const low = Math.round(fairValue * (1 - BAND_PCT));
  const high = Math.round(fairValue * (1 + BAND_PCT));
  const delta = base - fairValue;
  const deltaPct = fairValue > 0 ? delta / fairValue : 0;

  // Derived from the band — never a separate threshold — so the label and the
  // numbers cannot contradict each other.
  const score: PriceScore =
    base < low ? "abaixo do mercado" : base > high ? "acima do mercado" : "justo";

  return {
    fairValue,
    low,
    high,
    ask: base,
    delta,
    deltaPct,
    score,
    bodyType,
    expectedMileage: expected,
    mileage,
    mileageDelta,
    ageYears,
    referenceYear,
    breakdown,
  };
}

/* ─── Recommended settlement for a swap ────────────────────────── */

export interface SplitOptions {
  referenceYear?: number;
  extrasA?: CarExtras;
  extrasB?: CarExtras;
}

/**
 * How much money should move between two posts in a trade.
 *
 * `fromAtoB = valueB - valueA`, i.e. positive means A pays B — the SAME sign
 * convention as `Match.suggestedCashFromA` (see lib/cash.ts). The band is the
 * honest combination of both estimates: the lowest settlement is
 * (B's low − A's high), the highest is (B's high − A's low).
 *
 * Accepts anything with a `car` field, so `CarPost`, the calculator's draft
 * and test fixtures all work.
 */
export function recommendedSplit(
  postA: Pick<CarPost, "car">,
  postB: Pick<CarPost, "car">,
  options: SplitOptions = {}
): RecommendedSplit {
  const { referenceYear, extrasA, extrasB } = options;

  const valuationA = valuate({
    brand: postA.car.brand,
    model: postA.car.model,
    year: postA.car.year,
    estimatedValue: postA.car.estimatedValue,
    mileage: postA.car.mileage,
    extras: extrasA,
    referenceYear,
  });

  const valuationB = valuate({
    brand: postB.car.brand,
    model: postB.car.model,
    year: postB.car.year,
    estimatedValue: postB.car.estimatedValue,
    mileage: postB.car.mileage,
    extras: extrasB,
    referenceYear,
  });

  const fromAtoB = valuationB.fairValue - valuationA.fairValue;
  const low = valuationB.low - valuationA.high;
  const high = valuationB.high - valuationA.low;

  const carA = `${postA.car.brand} ${postA.car.model}`.trim();
  const carB = `${postB.car.brand} ${postB.car.model}`.trim();

  const reason =
    fromAtoB === 0
      ? `Pelo km e o ano, a troca é justa sem diferença: ${carA} e ${carB} valem R$ ${formatBRL(
          valuationA.fairValue
        )} cada.`
      : `Pelo km e o ano, o justo é R$ ${formatBRL(
          Math.abs(fromAtoB)
        )} de diferença: ${carA} vale R$ ${formatBRL(
          valuationA.fairValue
        )} e ${carB} vale R$ ${formatBRL(valuationB.fairValue)}.`;

  return { fromAtoB, low, high, reason, valuationA, valuationB };
}

/* ─── Query-string extras ──────────────────────────────────────── */

/**
 * Parses `?extras=singleOwner,fullServiceHistory` for the public API.
 * Unknown tokens are ignored rather than rejected — the endpoint is
 * exploratory and should never 400 because of a typo.
 */
export function parseExtrasParam(value: string | null): CarExtras {
  if (!value) return {};
  const tokens = new Set(
    value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
  );

  const extras: CarExtras = {};
  for (const key of EXTRA_KEYS) {
    if (tokens.has(key)) extras[key] = true;
  }
  return extras;
}
