/**
 * Avalia — modelo de avaliação transparente para troca de carros.
 *
 * Why this file exists
 * --------------------
 * The base product matches on a number the owner typed ("valor estimado").
 * FIPE is a reference table, not a transaction price: two identical cars can
 * differ by ~30% because of mileage, condition, history and region. This module
 * turns that single self-declared number into a defensible estimate, an explicit
 * confidence band and a line-by-line explanation.
 *
 * It is a HEURISTIC model, not a laudo (inspection) and not ground truth. Every
 * constant below is named and commented with the reasoning/source behind it so
 * the estimate can be argued with instead of trusted blindly.
 *
 * Import discipline: this file imports types plus `formatBRL` (both browser-safe).
 * It must stay free of `node:fs`/`node:path` so client components can import it.
 */

import type { CarDetail, CarPost, DesiredVehicle } from "./types";
import { formatBRL } from "./cash";

/* ─── Usage curve ──────────────────────────────────────────────── */

/**
 * EXPECTED_KM_PER_YEAR = 13.000 km.
 *
 * Brazilian passenger cars are usually driven 12.000–15.000 km/year; 13.000 is
 * the middle of that range. Using the middle avoids declaring a normal 5-year
 * car "high mileage" just because the driver commutes.
 */
export const EXPECTED_KM_PER_YEAR = 13_000;

/** Mileage adjustments move in steps of 10.000 km — the granularity buyers use in practice. */
export const MILEAGE_STEP_KM = 10_000;

/**
 * MILEAGE_PENALTY_PER_STEP = 1,8% per 10.000 km above the expected curve.
 *
 * High mileage is the single largest discount in Brazilian used-car
 * negotiations (it proxies for wear on engine, suspension and interior). The
 * penalty is deliberately larger than the low-mileage bonus: buyers price risk,
 * sellers only get a modest premium for a garage-kept car.
 */
export const MILEAGE_PENALTY_PER_STEP = 0.018;

/**
 * MILEAGE_MAX_PENALTY = 22%.
 *
 * Beyond roughly 120.000 km over the expected curve the discount stops growing.
 * Without a cap a badly-rolled-back odometer or a ex-fleet car would collapse
 * the estimate to an absurd number; past this point condition and history matter
 * more than kilometres alone.
 */
export const MILEAGE_MAX_PENALTY = 0.22;

/**
 * MILEAGE_BONUS_PER_STEP = 1,0% per 10.000 km below the expected curve.
 *
 * Low mileage is worth something (less wear, longer remaining life) but it is
 * only half as strong as the high-mileage discount, because a 10-year-old car
 * with 2.000 km also raises suspicion of a parked/abandoned vehicle.
 */
export const MILEAGE_BONUS_PER_STEP = 0.01;

/**
 * MILEAGE_MAX_BONUS = 6%.
 *
 * Credit is capped so an unusually low odometer cannot inflate the value without
 * limit. The remaining uncertainty is expressed in the band instead.
 */
export const MILEAGE_MAX_BONUS = 0.06;

/**
 * MILEAGE_MIN_AGE_YEARS = 1.
 *
 * A car leaves the dealership with delivery kilometres, not a full year of use.
 * Giving every car at least one year of expected mileage keeps zero-km and
 * one-year-old cars from earning a fake low-mileage bonus.
 */
export const MILEAGE_MIN_AGE_YEARS = 1;

/* ─── Age ──────────────────────────────────────────────────────── */

/**
 * AGE_FREE_YEARS = 3.
 *
 * FIPE already embeds the steep year-model depreciation, so charging it again
 * would double-count. What FIPE under-represents for older cars is liquidity:
 * buyers discount maintenance risk and parts availability. We therefore apply a
 * small extra discount only after the first three years.
 */
export const AGE_FREE_YEARS = 3;

/**
 * AGE_LIQUIDITY_PCT_PER_YEAR = 0,6% per year after the free window.
 *
 * A deliberately small number: enough to move a 15-year-old car by a few
 * percent, not enough to re-price it as if FIPE did not exist.
 */
export const AGE_LIQUIDITY_PCT_PER_YEAR = 0.006;

/** AGE_MAX_PENALTY = 8% — the age effect is bounded so condition/history can dominate. */
export const AGE_MAX_PENALTY = 0.08;

/**
 * MAX_USAGE_AGE_YEARS = 30.
 *
 * Past ~30 years a car is a classic/collector asset and the daily-usage curve
 * stops being meaningful. Capping the age keeps the mileage expectation finite.
 */
export const MAX_USAGE_AGE_YEARS = 30;

/* ─── Body / segment ───────────────────────────────────────────── */

export type BodyType = "Hatch" | "Sedan" | "SUV" | "Caminhonete" | "Desconhecido";

interface BodyRule {
  pct: number;
  reason: string;
}

/**
 * Segment adjustments are small and directional, based on Brazilian resale
 * behaviour rather than a formal price index:
 * - SUVs are the strongest demand segment and turn over quickly.
 * - Pickups/caminhonetes are work vehicles and depreciate less with fashion.
 * - Hatches are the most liquid entry segment.
 * - Sedans have lost share to SUVs and take longer to sell.
 * Unknown segments stay neutral instead of guessing.
 */
const BODY_RULES: Record<BodyType, BodyRule> = {
  SUV: {
    pct: 0.03,
    reason:
      "SUV: demanda acima da média no mercado brasileiro e revenda mais rápida.",
  },
  Caminhonete: {
    pct: 0.04,
    reason:
      "Caminhonete/picape: veículo de trabalho, sofre menos com mudança de moda.",
  },
  Hatch: {
    pct: 0.01,
    reason: "Hatch: maior liquidez entre os carros de entrada.",
  },
  Sedan: {
    pct: -0.02,
    reason:
      "Sedan: perde espaço para SUVs no gosto do comprador e gira mais devagar.",
  },
  Desconhecido: {
    pct: 0,
    reason:
      "Segmento não identificado pelo nome do modelo; ajuste de carroceria neutro.",
  },
};

/* ─── Documented extras ────────────────────────────────────────── */

export interface VehicleExtras {
  singleOwner?: boolean;
  fullServiceHistory?: boolean;
  recentlyServiced?: boolean;
  newTyres?: boolean;
  noAccidents?: boolean;
}

export interface ExtraOption {
  key: keyof VehicleExtras;
  label: string;
  pct: number;
  why: string;
}

/**
 * Each flag is a small, explicit premium because the information is declared by
 * the owner and cannot be verified by this model. The percentages reflect what
 * buyers typically pay for documented provenance in a negotiation; they are not
 * a substitute for an inspection.
 */
export const EXTRA_OPTIONS: ExtraOption[] = [
  {
    key: "singleOwner",
    label: "Único dono",
    pct: 0.02,
    why: "um só dono reduz o risco de histórico escondido e encurta a revenda.",
  },
  {
    key: "fullServiceHistory",
    label: "Histórico completo de manutenção",
    pct: 0.025,
    why: "manutenção documentada é o melhor indicador de condição real disponível.",
  },
  {
    key: "recentlyServiced",
    label: "Revisão feita recentemente",
    pct: 0.01,
    why: "revisão recente reduz o gasto imediato de quem compra.",
  },
  {
    key: "newTyres",
    label: "Pneus novos",
    pct: 0.008,
    why: "pneus são um custo visível e imediato para o comprador.",
  },
  {
    key: "noAccidents",
    label: "Nunca batido",
    pct: 0.015,
    why: "ausência de sinistro é o item que mais pesa numa vistoria cautelar.",
  },
];

/**
 * EXTRAS_MAX_PCT = 8%.
 *
 * The extras all describe the same underlying thing — documented care. Stacking
 * every flag without a cap would create a fantasy premium, so the total is
 * bounded at 8% and the UI shows exactly where the cap was hit.
 */
export const EXTRAS_MAX_PCT = 0.08;

/* ─── Confidence band ──────────────────────────────────────────── */

/**
 * BAND_BASE_PCT = 4%.
 *
 * Even with complete data, this is a heuristic over an aggregate reference
 * table. ±4% is the irreducible noise of that comparison, not a statistical
 * confidence interval.
 */
export const BAND_BASE_PCT = 0.04;

/**
 * BAND_NO_MILEAGE_PCT = +6 percentage points.
 *
 * Mileage is the strongest single driver of condition and it is the field most
 * often missing from listings. Without it, the estimate must visibly become
 * less precise rather than silently pretending.
 */
export const BAND_NO_MILEAGE_PCT = 0.06;

/** BAND_UNKNOWN_BODY_PCT = +1,5 pp — an unrecognised segment removes one adjustment from the evidence. */
export const BAND_UNKNOWN_BODY_PCT = 0.015;

/** BAND_OLD_CAR_YEARS = 10 — older cars spread much wider in real condition. */
export const BAND_OLD_CAR_YEARS = 10;

/** BAND_OLD_CAR_EXTRA_PCT = +2 pp for cars older than BAND_OLD_CAR_YEARS. */
export const BAND_OLD_CAR_EXTRA_PCT = 0.02;

/**
 * BAND_DOCUMENTED_REDUCTION_PCT = 0,5 pp.
 *
 * A car with both service history and no accidents has less information
 * asymmetry, so the band tightens slightly. It never removes the base band:
 * documentation can be incomplete or inaccurate.
 */
export const BAND_DOCUMENTED_REDUCTION_PCT = 0.005;

/** Floor/ceiling for the band: below 3% we would look falsely precise; above 15% the number stops being useful. */
export const BAND_MIN_PCT = 0.03;
export const BAND_MAX_PCT = 0.15;

/** Confidence is a plain-language mapping of the band width, not a separate model. */
export type ValuationConfidence = "alta" | "média" | "baixa";

export const CONFIDENCE_HIGH_MAX_PCT = 0.05;
export const CONFIDENCE_MEDIUM_MAX_PCT = 0.09;

/* ─── Labels ───────────────────────────────────────────────────── */

export type ValuationLabel = "bem abaixo do mercado" | "justo" | "acima do mercado";

/**
 * JUSTO_THRESHOLD_PCT = 8%.
 *
 * An asking price within 8% of fair value is inside normal negotiation noise
 * (and usually inside the confidence band). Calling that "above market" would
 * make the label useless; 8% is where the difference starts to be worth arguing
 * about in a swap.
 */
export const JUSTO_THRESHOLD_PCT = 0.08;

/* ─── Overall safety limits ────────────────────────────────────── */

/**
 * The combined adjustment may not exceed these bounds. They are a sanity rail,
 * not a market statement: if a stack of penalties would move a car by more than
 * 35%, the honest answer is "this listing needs an inspection", not a number.
 */
export const MAX_TOTAL_DISCOUNT_PCT = 0.35;
export const MAX_TOTAL_PREMIUM_PCT = 0.25;

/* ─── Split settlement ─────────────────────────────────────────── */

/**
 * CASH_ROUNDING = R$ 100.
 *
 * A swap settlement is a negotiation, not an invoice. Quoting "R$ 17.237" would
 * overstate precision; the model rounds to the nearest hundred and shows a range.
 */
export const CASH_ROUNDING = 100;

/**
 * STRAIGHT_SWAP_THRESHOLD = R$ 500.
 *
 * Mirrors the cash-compatibility scoring in lib/matching.ts, where a difference
 * of R$ 500 or less is treated as a perfect cash match. Below this, the
 * paperwork and risk of transferring money cost more than the difference.
 */
export const STRAIGHT_SWAP_THRESHOLD = 500;

/**
 * Weights when the two owners already declared compatible cash ranges.
 *
 * The fair number is the product thesis, so it carries the majority weight; the
 * declared asks only correct for subjective preference. If there is no
 * compatible declared range, the fair difference is used alone.
 */
export const WEIGHT_FAIR_ANCHOR = 0.6;
export const WEIGHT_DECLARED = 0.4;

/* ─── Output types ─────────────────────────────────────────────── */

export interface ValuationBreakdownItem {
  key: string;
  /** User-facing explanation in pt-BR. Every number shown in the UI must have one. */
  reason: string;
  /** Signed BRL impact. Adjustments sum with the reference row to the fair value. */
  impactBRL: number;
  /** Signed fraction applied to the reference (e.g. -0.018 = −1,8%). */
  impactPct: number;
}

export interface Valuation {
  /** FIPE-based value declared in the listing, in BRL. */
  referenceValue: number;
  /** Our estimate of the transaction value, in BRL. */
  fairValue: number;
  /** Low end of the confidence band, in BRL. */
  low: number;
  /** High end of the confidence band, in BRL. */
  high: number;
  /** Half-width of the band as a fraction (0.04 = ±4%). */
  bandPct: number;
  /** referenceValue − fairValue. Positive = the asking price is ABOVE fair. */
  delta: number;
  /** delta / fairValue. Positive = asking above fair. */
  deltaPct: number;
  label: ValuationLabel;
  confidence: ValuationConfidence;
  mileageKnown: boolean;
  expectedMileage: number;
  actualMileage: number | null;
  bodyType: BodyType;
  /** Every row contributes to fairValue (`referenceValue + Σ adjustments`). */
  breakdown: ValuationBreakdownItem[];
  /** Honest caveats shown next to the number (missing data, caps hit, etc.). */
  notes: string[];
  /** True when both mileage and segment were known. */
  complete: boolean;
}

export interface RecommendedSplit {
  /** Positive = A pays B; negative = B pays A. Matches `Match.suggestedCashFromA`. */
  amount: number;
  payer: "A" | "B" | null;
  receiver: "A" | "B" | null;
  /** Defensible negotiation range, same sign convention as `amount`. */
  low: number;
  high: number;
  /** Fair value of B minus fair value of A, before blending with declared asks. */
  fairDifference: number;
  /** Midpoint of the owners' compatible declared cash ranges, if any. */
  declaredMidpoint: number | null;
  /** True when the owners' declared ranges actually overlap. */
  declaredCompatible: boolean;
  justification: string;
  shortJustification: string;
  valuationA: Valuation;
  valuationB: Valuation;
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPct(pct: number, digits = 1): string {
  return `${(pct * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString("pt-BR")} km`;
}

/**
 * Curated body hints for high-volume Brazilian models whose FIPE name carries no
 * body keyword ("Fit", "Gol", "HB20"). Only models with an unambiguous body are
 * listed — an ambiguous name (Onix hatch vs. Onix Plus sedan, City sedan vs.
 * hatch) is deliberately absent, and stays "Desconhecido" so the band widens
 * instead of the model guessing wrong.
 */
const MODEL_BODY_HINTS: Array<{ needle: string; body: BodyType }> = [
  // Picapes
  { needle: "toro", body: "Caminhonete" },
  { needle: "strada", body: "Caminhonete" },
  { needle: "saveiro", body: "Caminhonete" },
  { needle: "hilux", body: "Caminhonete" },
  { needle: "amarok", body: "Caminhonete" },
  { needle: "frontier", body: "Caminhonete" },
  { needle: "l200", body: "Caminhonete" },
  // SUVs
  { needle: "creta", body: "SUV" },
  { needle: "compass", body: "SUV" },
  { needle: "renegade", body: "SUV" },
  { needle: "duster", body: "SUV" },
  { needle: "hr-v", body: "SUV" },
  { needle: "wr-v", body: "SUV" },
  { needle: "kicks", body: "SUV" },
  { needle: "t-cross", body: "SUV" },
  { needle: "tcross", body: "SUV" },
  { needle: "nivus", body: "SUV" },
  { needle: "tracker", body: "SUV" },
  { needle: "tiguan", body: "SUV" },
  { needle: "tucson", body: "SUV" },
  { needle: "sportage", body: "SUV" },
  { needle: "ecosport", body: "SUV" },
  { needle: "captur", body: "SUV" },
  { needle: "pulse", body: "SUV" },
  { needle: "fastback", body: "SUV" },
  // Hatches
  { needle: "fit", body: "Hatch" },
  { needle: "uno", body: "Hatch" },
  { needle: "gol", body: "Hatch" },
  { needle: "hb20", body: "Hatch" },
  { needle: "polo", body: "Hatch" },
  { needle: "argo", body: "Hatch" },
  { needle: "mobi", body: "Hatch" },
  { needle: "kwid", body: "Hatch" },
  { needle: "sandero", body: "Hatch" },
  { needle: "fox", body: "Hatch" },
  { needle: "palio", body: "Hatch" },
  { needle: "celta", body: "Hatch" },
  { needle: "208", body: "Hatch" },
  // "onix" only reaches here when the name has no "SD."/sedan marker, i.e. the
  // hatch. "ka" is word-boundary matched, so "Ka Sedan" stays a Sedan.
  { needle: "onix", body: "Hatch" },
  { needle: "ka", body: "Hatch" },
  { needle: "up!", body: "Hatch" },
  { needle: "prius", body: "Hatch" },
  // Sedans
  { needle: "corolla", body: "Sedan" },
  { needle: "civic", body: "Sedan" },
  { needle: "virtus", body: "Sedan" },
  { needle: "voyage", body: "Sedan" },
  { needle: "prisma", body: "Sedan" },
  { needle: "logan", body: "Sedan" },
  { needle: "cronos", body: "Sedan" },
  { needle: "sentra", body: "Sedan" },
];

/**
 * Infers the body type from the FIPE model string. This mirrors the private
 * helper in lib/matching.ts, kept separate because matching.ts reads the
 * filesystem and cannot be imported by client components.
 *
 * Order matters: explicit body words win over the model lexicon, because a FIPE
 * name like "Ka Sedan" or "ONIX SD." is more authoritative than "ka"/"onix".
 */
export function inferBodyType(model: string): BodyType {
  const lower = (model || "").toLowerCase();
  if (lower.includes("suv") || lower.includes("sport utility")) return "SUV";
  if (
    lower.includes("pick-up") ||
    lower.includes("pickup") ||
    lower.includes("picape") ||
    lower.includes("caminhonete")
  ) {
    return "Caminhonete";
  }
  if (lower.includes("hatch")) return "Hatch";
  if (
    lower.includes("sedan") ||
    lower.includes("sedã") ||
    lower.includes("sed.") ||
    lower.includes(" sd.") ||
    lower.includes("sda")
  ) {
    return "Sedan";
  }

  for (const hint of MODEL_BODY_HINTS) {
    const idx = lower.indexOf(hint.needle);
    if (idx === -1) continue;
    // Require a word boundary so "gol" does not match inside another token.
    const before = idx === 0 ? " " : lower[idx - 1];
    const after = lower[idx + hint.needle.length] ?? " ";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      return hint.body;
    }
  }

  return "Desconhecido";
}

/**
 * Core valuation. `car.estimatedValue` is treated as the FIPE-based reference
 * the owner typed; every adjustment is applied to that reference so the
 * breakdown is auditable and the rows sum to the fair value.
 */
export function valuateCar(
  car: CarDetail,
  options: { extras?: VehicleExtras; referenceYear?: number } = {}
): Valuation {
  const referenceYear = options.referenceYear ?? new Date().getFullYear();
  const extras = options.extras ?? {};

  const referenceValue =
    Number.isFinite(car.estimatedValue) && car.estimatedValue > 0
      ? Math.round(car.estimatedValue)
      : 0;

  const breakdown: ValuationBreakdownItem[] = [
    {
      key: "referencia",
      reason: `Valor de referência do anúncio (base FIPE declarada): R$ ${formatBRL(
        referenceValue
      )}.`,
      impactBRL: referenceValue,
      impactPct: 0,
    },
  ];

  const pushAdjustment = (key: string, reason: string, pct: number): number => {
    const impactBRL = Math.round(referenceValue * pct);
    breakdown.push({ key, reason, impactBRL, impactPct: pct });
    return impactBRL;
  };

  /* Mileage */
  const rawAge = Number.isFinite(car.year)
    ? Math.max(0, referenceYear - car.year)
    : 0;
  const ageYears = Math.min(rawAge, MAX_USAGE_AGE_YEARS);
  const usageYears = Math.max(MILEAGE_MIN_AGE_YEARS, ageYears);
  const expectedMileage = Math.round(usageYears * EXPECTED_KM_PER_YEAR);
  const mileageKnown =
    typeof car.mileage === "number" &&
    Number.isFinite(car.mileage) &&
    car.mileage >= 0;
  const actualMileage = mileageKnown ? Math.round(car.mileage as number) : null;

  if (!mileageKnown) {
    pushAdjustment(
      "quilometragem",
      "Sem quilometragem informada: nenhum ajuste de uso foi aplicado e a faixa de confiança foi alargada.",
      0
    );
  } else {
    const diff = actualMileage! - expectedMileage;
    if (diff > 0) {
      const steps = diff / MILEAGE_STEP_KM;
      const pct = -Math.min(
        steps * MILEAGE_PENALTY_PER_STEP,
        MILEAGE_MAX_PENALTY
      );
      pushAdjustment(
        "quilometragem",
        `Quilometragem ${formatKm(actualMileage!)}: ${formatKm(
          diff
        )} acima do esperado para ~${usageYears} ano(s) de uso (${formatKm(
          expectedMileage
        )}). Desconto de ${formatPct(Math.abs(pct), 2)}.`,
        pct
      );
    } else if (diff < 0) {
      const steps = Math.abs(diff) / MILEAGE_STEP_KM;
      const pct = Math.min(steps * MILEAGE_BONUS_PER_STEP, MILEAGE_MAX_BONUS);
      pushAdjustment(
        "quilometragem",
        `Quilometragem ${formatKm(actualMileage!)}: ${formatKm(
          Math.abs(diff)
        )} abaixo do esperado para ~${usageYears} ano(s) de uso (${formatKm(
          expectedMileage
        )}). Crédito de ${formatPct(pct, 2)}.`,
        pct
      );
    } else {
      pushAdjustment(
        "quilometragem",
        `Quilometragem ${formatKm(actualMileage!)} dentro do esperado (~${formatKm(
          expectedMileage
        )} para ${usageYears} ano(s)).`,
        0
      );
    }
  }

  /* Age */
  const chargeableAge = Math.max(0, ageYears - AGE_FREE_YEARS);
  if (chargeableAge > 0) {
    const pct = -Math.min(
      chargeableAge * AGE_LIQUIDITY_PCT_PER_YEAR,
      AGE_MAX_PENALTY
    );
    pushAdjustment(
      "idade",
      `Idade (${ageYears} anos): a FIPE já embute a depreciação por ano-modelo; aplicamos só um desconto de liquidez de ${formatPct(
        Math.abs(pct),
        1
      )} para carro usado fora da garantia.`,
      pct
    );
  } else {
    pushAdjustment(
      "idade",
      `Idade (${ageYears} ano(s)) dentro da janela em que a FIPE já reflete a depreciação; sem desconto adicional.`,
      0
    );
  }

  /* Body / segment */
  const bodyType = inferBodyType(car.model);
  const bodyRule = BODY_RULES[bodyType];
  pushAdjustment(
    "segmento",
    bodyType === "Desconhecido" ? bodyRule.reason : `${bodyType}: ${bodyRule.reason}`,
    bodyRule.pct
  );

  /* Documented extras */
  let extrasPct = 0;
  const extrasRequestedPct = EXTRA_OPTIONS.filter((o) => extras[o.key]).reduce(
    (sum, option) => sum + option.pct,
    0
  );
  for (const option of EXTRA_OPTIONS) {
    if (!extras[option.key]) continue;
    const remaining = EXTRAS_MAX_PCT - extrasPct;
    if (remaining <= 0) break;
    const pct = Math.min(option.pct, remaining);
    extrasPct += pct;
    pushAdjustment(
      `extra-${option.key}`,
      `${option.label}: ${formatPct(pct, 2)} — ${option.why}`,
      pct
    );
  }

  /* Safety rails: never let the stack run away. */
  let fairValue = breakdown.reduce((sum, item) => sum + item.impactBRL, 0);
  const minFair = Math.round(referenceValue * (1 - MAX_TOTAL_DISCOUNT_PCT));
  const maxFair = Math.round(referenceValue * (1 + MAX_TOTAL_PREMIUM_PCT));
  if (fairValue < minFair) {
    const residual = minFair - fairValue;
    breakdown.push({
      key: "limite",
      reason:
        "Limite de segurança do modelo: os descontos somados passariam de 35%, então a estimativa foi contida. Um carro nessa faixa precisa de vistoria.",
      impactBRL: residual,
      impactPct: referenceValue > 0 ? residual / referenceValue : 0,
    });
    fairValue = minFair;
  } else if (fairValue > maxFair) {
    const residual = maxFair - fairValue;
    breakdown.push({
      key: "limite",
      reason:
        "Limite de segurança do modelo: os prêmios somados passariam de 25%, então a estimativa foi contida.",
      impactBRL: residual,
      impactPct: referenceValue > 0 ? residual / referenceValue : 0,
    });
    fairValue = maxFair;
  }

  /* Confidence band */
  let bandPct = BAND_BASE_PCT;
  if (!mileageKnown) bandPct += BAND_NO_MILEAGE_PCT;
  if (bodyType === "Desconhecido") bandPct += BAND_UNKNOWN_BODY_PCT;
  if (ageYears > BAND_OLD_CAR_YEARS) bandPct += BAND_OLD_CAR_EXTRA_PCT;
  if (extras.fullServiceHistory && extras.noAccidents) {
    bandPct -= BAND_DOCUMENTED_REDUCTION_PCT;
  }
  bandPct = clamp(bandPct, BAND_MIN_PCT, BAND_MAX_PCT);

  const confidence: ValuationConfidence =
    bandPct <= CONFIDENCE_HIGH_MAX_PCT
      ? "alta"
      : bandPct <= CONFIDENCE_MEDIUM_MAX_PCT
        ? "média"
        : "baixa";

  const low = Math.round(fairValue * (1 - bandPct));
  const high = Math.round(fairValue * (1 + bandPct));

  const delta = referenceValue - fairValue;
  const deltaPct = fairValue > 0 ? delta / fairValue : 0;
  const label: ValuationLabel =
    deltaPct > JUSTO_THRESHOLD_PCT
      ? "acima do mercado"
      : deltaPct < -JUSTO_THRESHOLD_PCT
        ? "bem abaixo do mercado"
        : "justo";

  const notes: string[] = [];
  if (!mileageKnown) {
    notes.push(
      "Sem quilometragem informada: a faixa ficou mais larga e a estimativa é menos confiável."
    );
  }
  if (bodyType === "Desconhecido") {
    notes.push(
      "Não foi possível identificar a carroceria pelo nome do modelo; o ajuste de segmento ficou neutro."
    );
  }
  if (extrasPct >= EXTRAS_MAX_PCT && extrasRequestedPct > EXTRAS_MAX_PCT) {
    notes.push(
      `Os itens de histórico somam mais que o limite de ${formatPct(
        EXTRAS_MAX_PCT,
        0
      )}; o excedente foi ignorado.`
    );
  }
  if (ageYears > 15) {
    notes.push(
      "Carro com mais de 15 anos: a condição individual pesa mais que qualquer média de mercado."
    );
  }

  return {
    referenceValue,
    fairValue,
    low,
    high,
    bandPct,
    delta,
    deltaPct,
    label,
    confidence,
    mileageKnown,
    expectedMileage,
    actualMileage,
    bodyType,
    breakdown,
    notes,
    complete: mileageKnown && bodyType !== "Desconhecido",
  };
}

/** Convenience wrapper for a listing. Pure: no filesystem access. */
export function valuationForPost(
  post: CarPost,
  extras?: VehicleExtras
): Valuation {
  return valuateCar(post.car, { extras });
}

/* ─── Cash split ───────────────────────────────────────────────── */

interface CashRange {
  min: number;
  max: number;
}

/**
 * Mirrors the vehicle gate in lib/matching.ts. Kept as a local copy because
 * matching.ts is server-only; the split must agree with the engine's direction
 * even when the UI is rendered on the client.
 */
function vehicleFitsCar(want: DesiredVehicle, car: CarDetail): boolean {
  if (want.vehicleType) {
    const inferred = inferBodyType(car.model);
    // Permissive, exactly like the matching engine: an unknown body type is not
    // proof of a mismatch.
    if (inferred !== "Desconhecido" && inferred !== want.vehicleType) {
      return false;
    }
  } else {
    if (want.brand && want.brand.toLowerCase() !== car.brand.toLowerCase()) {
      return false;
    }
    const model = car.model.toLowerCase();
    if (want.model) {
      const wanted = want.model.toLowerCase().trim();
      if (!model.startsWith(wanted) && !model.includes(wanted)) return false;
    }
    if (want.version && !model.includes(want.version.toLowerCase().trim())) {
      return false;
    }
    if (want.transmission === "Automático" && !hasAutomaticTransmission(model)) {
      return false;
    }
    if (want.transmission === "Manual" && !hasManualTransmission(model)) {
      return false;
    }
  }

  if (want.yearMin && car.year < want.yearMin) return false;
  if (want.yearMax && car.year > want.yearMax) return false;
  if (
    want.mileageMin !== undefined &&
    car.mileage !== undefined &&
    car.mileage < want.mileageMin
  ) {
    return false;
  }
  if (
    want.mileageMax !== undefined &&
    car.mileage !== undefined &&
    car.mileage > want.mileageMax
  ) {
    return false;
  }
  return true;
}

/**
 * The owner's declared cash range for exactly this counterpart car. Returns null
 * when the post names no desired vehicle that fits it.
 */
function declaredCashRange(post: CarPost, otherCar: CarDetail): CashRange | null {
  const vehicles = post.desiredTrade?.vehicles ?? [];
  for (const want of vehicles) {
    if (!vehicleFitsCar(want, otherCar)) continue;
    const tolerance = Math.abs(want.cashAdjustmentTolerance ?? 0);
    return {
      min: want.cashAdjustment - tolerance,
      max: want.cashAdjustment + tolerance,
    };
  }
  return null;
}

/**
 * Same overlap logic as `cashCompatible` in lib/matching.ts, but it returns the
 * whole agreed range instead of its midpoint. Sign convention: positive = A pays B.
 */
function cashOverlap(rangeA: CashRange, rangeB: CashRange): CashRange | null {
  // A pays, B receives.
  if (rangeA.min >= 0 && rangeB.max <= 0) {
    const bReceiveMin = -rangeB.max;
    const bReceiveMax = -rangeB.min;
    if (rangeA.max >= bReceiveMin && rangeA.min <= bReceiveMax) {
      return {
        min: Math.max(rangeA.min, bReceiveMin),
        max: Math.min(rangeA.max, bReceiveMax),
      };
    }
    return null;
  }

  // A receives, B pays.
  if (rangeA.max <= 0 && rangeB.min >= 0) {
    const aReceiveMin = -rangeA.max;
    const aReceiveMax = -rangeA.min;
    if (rangeB.max >= aReceiveMin && rangeB.min <= aReceiveMax) {
      const positive = {
        min: Math.max(rangeB.min, aReceiveMin),
        max: Math.min(rangeB.max, aReceiveMax),
      };
      return { min: -positive.max, max: -positive.min };
    }
    return null;
  }

  // Both want to pay or both want to receive: no honest overlap.
  return null;
}

function roundToCash(value: number): number {
  return Math.round(value / CASH_ROUNDING) * CASH_ROUNDING;
}

function shortCarName(car: CarDetail): string {
  const firstModelWord = (car.model || "").trim().split(/\s+/)[0] || "";
  return `${car.brand} ${firstModelWord}`.trim();
}

interface SplitRangeEdges {
  low: number;
  high: number;
}

/** Human label for the negotiation range, in the A/B convention. */
export function splitRangeLabel(range: SplitRangeEdges): string {
  const { low, high } = range;
  if (low === 0 && high === 0) return "troca direta, sem dinheiro";
  if (low >= 0) {
    return `A paga entre R$ ${formatBRL(low)} e R$ ${formatBRL(high)}`;
  }
  if (high <= 0) {
    return `B paga entre R$ ${formatBRL(Math.abs(high))} e R$ ${formatBRL(
      Math.abs(low)
    )}`;
  }
  return `de R$ ${formatBRL(Math.abs(low))} (B paga) a R$ ${formatBRL(
    high
  )} (A paga)`;
}

/**
 * Recommended settlement for two listings.
 *
 * Direction is quoted exactly like `Match.suggestedCashFromA` in lib/matching.ts:
 * positive = A pays B. When the owners already declared compatible ranges we
 * blend the fair difference with their midpoint (fair value stays the anchor);
 * otherwise the fair difference stands alone and the justification says so.
 */
export function recommendedSplit(postA: CarPost, postB: CarPost): RecommendedSplit {
  const valuationA = valuationForPost(postA);
  const valuationB = valuationForPost(postB);
  const fairDifference = valuationB.fairValue - valuationA.fairValue;

  const rangeA = declaredCashRange(postA, postB.car);
  const rangeB = declaredCashRange(postB, postA.car);
  const declaredRange = rangeA && rangeB ? cashOverlap(rangeA, rangeB) : null;
  const declaredMidpoint = declaredRange
    ? Math.round((declaredRange.min + declaredRange.max) / 2)
    : null;

  const anchor =
    declaredMidpoint !== null
      ? WEIGHT_FAIR_ANCHOR * fairDifference +
        WEIGHT_DECLARED * declaredMidpoint
      : fairDifference;

  // The fair band propagates naturally: B's lowest against A's highest and vice
  // versa. If both owners declared an overlapping range, keep only the part of
  // the fair band that both would accept.
  let low = valuationB.low - valuationA.high;
  let high = valuationB.high - valuationA.low;
  if (declaredRange) {
    const interLow = Math.max(low, declaredRange.min);
    const interHigh = Math.min(high, declaredRange.max);
    if (interLow <= interHigh) {
      low = interLow;
      high = interHigh;
    }
  }

  const lowRounded = Math.floor(low / CASH_ROUNDING) * CASH_ROUNDING;
  const highRounded = Math.ceil(high / CASH_ROUNDING) * CASH_ROUNDING;
  const clamped = clamp(anchor, lowRounded, highRounded);
  let amount = roundToCash(clamped);
  amount = clamp(amount, lowRounded, highRounded);
  if (Math.abs(amount) < STRAIGHT_SWAP_THRESHOLD) amount = 0;

  const payer: "A" | "B" | null =
    amount > 0 ? "A" : amount < 0 ? "B" : null;
  const receiver: "A" | "B" | null =
    amount > 0 ? "B" : amount < 0 ? "A" : null;

  const nameA = shortCarName(postA.car);
  const nameB = shortCarName(postB.car);
  const rangeText = splitRangeLabel({ low: lowRounded, high: highRounded });

  const direction =
    amount > 0
      ? `${nameA} paga R$ ${formatBRL(amount)} para ${nameB}`
      : amount < 0
        ? `${nameB} paga R$ ${formatBRL(Math.abs(amount))} para ${nameA}`
        : `A diferença é menor que R$ ${formatBRL(
            STRAIGHT_SWAP_THRESHOLD
          )}; a troca fecha direto, sem dinheiro`;

  const justification =
    `Pelo modelo, ${nameA} vale R$ ${formatBRL(
      valuationA.fairValue
    )} e ${nameB} vale R$ ${formatBRL(
      valuationB.fairValue
    )}. ${direction}. Faixa defensável: ${rangeText}.`;

  const shortJustification =
    amount === 0
      ? `Valores justos praticamente iguais: ${nameA} R$ ${formatBRL(
          valuationA.fairValue
        )} · ${nameB} R$ ${formatBRL(valuationB.fairValue)}.`
      : `Pelo modelo: ${nameA} R$ ${formatBRL(
          valuationA.fairValue
        )} · ${nameB} R$ ${formatBRL(valuationB.fairValue)}.`;

  return {
    amount,
    payer,
    receiver,
    low: lowRounded,
    high: highRounded,
    fairDifference,
    declaredMidpoint,
    declaredCompatible: declaredRange !== null,
    justification,
    shortJustification,
    valuationA,
    valuationB,
  };
}

/**
 * Does this FIPE model name describe an automatic / manual car?
 *
 * The FIPE list is inconsistent: most entries end in "Aut." but plenty end in
 * "Aut" with no period (e.g. "HB20 Vision 1.6 Flex 16V Aut"). Testing for the
 * literal "aut." rejected every one of those, so a buyer asking for an
 * automatic silently never matched a real automatic. Match the token instead.
 */
export function hasAutomaticTransmission(modelName: string): boolean {
  return /\baut\.?(?=\s|$)/i.test(modelName);
}

export function hasManualTransmission(modelName: string): boolean {
  return /\bmec\.?(?=\s|$)/i.test(modelName);
}
