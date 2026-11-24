import { readData, writeData } from "./db";
import { generateId, nowISO } from "./utils";
import type { CarPost, Match, DesiredVehicle } from "./types";
import { createConversationFromMatch } from "./chat";
import { getRegion } from "./brazil-regions";
import { parseLocalization, isInProximity } from "./location-utils";
import { areAdjacent } from "./brazil-adjacency";
import { SCORE_PERFEITO, SCORE_SIMILAR } from "./match-score";

export { SCORE_PERFEITO, SCORE_SIMILAR };

/* ─── Score thresholds ─────────────────────────────────────────── */
/* SCORE_PERFEITO / SCORE_SIMILAR live in ./match-score so client components
   can import them without dragging this file's filesystem access along. */

/* ─── Helpers ──────────────────────────────────────────────────── */

/**
 * Infers the vehicle body type from a FIPE model name by checking for
 * common keywords. Returns null when no body type can be inferred.
 */
function inferVehicleType(fipeName: string): string | null {
  const lower = fipeName.toLowerCase();
  if (lower.includes("hatchback") || lower.includes(" hatch")) return "Hatch";
  if (lower.includes("sedan") || lower.includes(" sd.") || lower.includes(" sda")) return "Sedan";
  if (lower.includes("suv")) return "SUV";
  if (lower.includes("pick-up") || lower.includes("pickup") || lower.includes("caminhonete")) return "Caminhonete";
  return null;
}

/**
 * Color families for proximity scoring.
 */
const COLOR_FAMILIES: Record<string, string> = {
  branco: "light",
  bege: "light",
  prata: "light",
  dourado: "light",
  preto: "dark",
  cinza: "dark",
  marrom: "dark",
  vermelho: "warm",
  laranja: "warm",
  amarelo: "warm",
  bordeaux: "warm",
  rosa: "warm",
  azul: "cool",
  verde: "cool",
  roxo: "cool",
};

/** Returns the colour family, or null if the colour is not recognised. */
function getColorFamily(color: string): string | null {
  return COLOR_FAMILIES[color.toLowerCase()] ?? null;
}

/* ─── Bilaterial vehicle gate (unchanged) ──────────────────────── */

/**
 * Checks if a single DesiredVehicle matches an offered car.
 *
 * Regras de matching:
 * - Tipo de veículo: se want.vehicleType está definido, verifica se o nome
 *   FIPE do carro contém keywords que correspondem ao tipo desejado.
 *   Se não for possível inferir o tipo, permite o match (permissivo).
 * - Marca: igualdade exata (case-insensitive)
 * - Modelo (geral): car.model DEVE COMEÇAR COM want.model
 * - Versão: car.model DEVE CONTER want.version (substring)
 * - Transmissão: car.model deve conter "Aut." ou "Mec." conforme
 * - Ano: bounds
 */
export function vehicleMatchesCar(
  car: CarPost["car"],
  want: DesiredVehicle
): boolean {
  // Vehicle type mode
  if (want.vehicleType) {
    const inferred = inferVehicleType(car.model);
    if (inferred && inferred !== want.vehicleType) return false;
  } else {
    // Marca
    if (want.brand && car.brand.toLowerCase() !== want.brand.toLowerCase()) {
      return false;
    }

    const carModelLower = car.model.toLowerCase();

    // Modelo geral
    if (want.model) {
      const wantModel = want.model.toLowerCase().trim();
      if (!carModelLower.startsWith(wantModel)) {
        if (!carModelLower.includes(wantModel)) {
          return false;
        }
      }
    }

    // Versão específica
    if (want.version) {
      if (!carModelLower.includes(want.version.toLowerCase().trim())) {
        return false;
      }
    }

    // Transmissão
    if (want.transmission) {
      const hasAuto = hasAutomaticTransmission(carModelLower);
      const hasManual = hasManualTransmission(carModelLower);
      if (want.transmission === "Automático" && !hasAuto) return false;
      if (want.transmission === "Manual" && !hasManual) return false;
    }
  }

  // Ano
  if (want.yearMin && car.year < want.yearMin) return false;
  if (want.yearMax && car.year > want.yearMax) return false;
  return true;
}

/* ─── Cash gate (unchanged) ────────────────────────────────────── */

interface CashRange {
  min: number;
  max: number;
}

function getCashRange(adjustment: number, tolerance: number): CashRange {
  return {
    min: adjustment - tolerance,
    max: adjustment + tolerance,
  };
}

/**
 * @returns null if incompatível, ou o valor sugerido que A paga para B
 *          (negativo = B paga A)
 */
function cashCompatible(
  rangeA: CashRange,
  rangeB: CashRange
): number | null {
  // Caso 1: A paga (rangeA >= 0), B recebe (rangeB <= 0)
  if (rangeA.min >= 0 && rangeB.max <= 0) {
    const bReceiveMin = -rangeB.max;
    const bReceiveMax = -rangeB.min;
    if (rangeA.max >= bReceiveMin && rangeA.min <= bReceiveMax) {
      return Math.round(
        (Math.max(rangeA.min, bReceiveMin) +
          Math.min(rangeA.max, bReceiveMax)) /
          2
      );
    }
    return null;
  }

  // Caso 2: A recebe (rangeA <= 0), B paga (rangeB >= 0)
  if (rangeA.max <= 0 && rangeB.min >= 0) {
    const aReceiveMin = -rangeA.max;
    const aReceiveMax = -rangeA.min;
    if (rangeB.max >= aReceiveMin && rangeB.min <= aReceiveMax) {
      const suggested = Math.round(
        (Math.max(rangeB.min, aReceiveMin) +
          Math.min(rangeB.max, aReceiveMax)) /
          2
      );
      return -suggested;
    }
    return null;
  }

  // Ambos querem pagar ou ambos querem receber
  return null;
}

/* ─── Location gate (new) ──────────────────────────────────────── */

/**
 * Location gate.
 *
 * The original only rejected a pair when *both* posts set `maxDistance` and
 * their states differed — so a post that asked for "até 100 km" happily
 * matched a car on the other side of the country, and a post with no
 * `maxDistance` bypassed the other party's limit entirely.
 *
 * Now each side's own limit is enforced against the other side's location,
 * using the same coarse radius buckets as the browse filter. Missing
 * location data stays permissive (we cannot prove it is far away).
 */
function locationGate(postA: CarPost, postB: CarPost): boolean {
  const limitA = postA.desiredTrade.maxDistance;
  if (limitA !== undefined && limitA !== null && limitA > 0) {
    if (!withinLimit(postB.car.localization, postA.car.localization, limitA)) {
      return false;
    }
  }

  const limitB = postB.desiredTrade.maxDistance;
  if (limitB !== undefined && limitB !== null && limitB > 0) {
    if (!withinLimit(postA.car.localization, postB.car.localization, limitB)) {
      return false;
    }
  }

  return true;
}

/** Is `otherLoc` within `limitKm` of `originLoc`? Permissive when unknown. */
function withinLimit(
  otherLoc: string | undefined,
  originLoc: string | undefined,
  limitKm: number
): boolean {
  const origin = parseLocalization(originLoc || "");
  if (!origin.state) return true; // no origin to measure from
  if (!otherLoc) return true; // candidate has no location — keep it

  return isInProximity(
    otherLoc,
    origin.state,
    origin.city || null,
    limitKm
  );
}

/* ─── Car Similarity scoring (new) ─────────────────────────────── */

/**
 * Calculates how similar two cars are across multiple dimensions.
 * Returns 0–50.
 */
function calculateCarSimilarity(
  carA: CarPost["car"],
  carB: CarPost["car"]
): number {
  let score = 0;

  // 1. Vehicle segment (max 8)
  const typeA = inferVehicleType(carA.model);
  const typeB = inferVehicleType(carB.model);
  if (typeA && typeB) {
    score += typeA === typeB ? 8 : 4;
  } else {
    score += 5; // neutral when one or both types can't be inferred
  }

  // 2. Value proximity (max 12)
  const vA = carA.estimatedValue;
  const vB = carB.estimatedValue;
  if (vA > 0 && vB > 0) {
    const ratio = Math.min(vA, vB) / Math.max(vA, vB);
    if (ratio >= 0.9) score += 12;
    else if (ratio >= 0.8) score += 9;
    else if (ratio >= 0.65) score += 6;
    else if (ratio >= 0.5) score += 3;
    else score += 1;
  }

  // 3. Year proximity (max 8)
  const yearDiff = Math.abs(carA.year - carB.year);
  if (yearDiff <= 2) score += 8;
  else if (yearDiff <= 5) score += 6;
  else if (yearDiff <= 10) score += 4;
  else score += 1;

  // 4. Mileage proximity (max 5)
  if (carA.mileage !== undefined && carB.mileage !== undefined) {
    const diff = Math.abs(carA.mileage - carB.mileage);
    if (diff <= 20000) score += 5;
    else if (diff <= 50000) score += 3;
    else if (diff <= 100000) score += 1;
  } else {
    score += 2; // neutral when mileage data is missing on one or both
  }

  // 5. Color similarity (max 3)
  if (carA.color && carB.color) {
    const a = carA.color.toLowerCase();
    const b = carB.color.toLowerCase();
    if (a === b) {
      score += 3;
    } else if (getColorFamily(a) === getColorFamily(b)) {
      score += 1;
    }
  }

  // 6. Location proximity (max 14)
  const locA = parseLocalization(carA.localization || "");
  const locB = parseLocalization(carB.localization || "");

  if (locA.state && locB.state) {
    if (locA.city && locB.city && locA.city.toLowerCase() === locB.city.toLowerCase()) {
      score += 14; // same city
    } else if (locA.state === locB.state) {
      score += 10; // same state
    } else if (areAdjacent(locA.state, locB.state)) {
      score += 8; // adjacent states
    } else {
      const regA = getRegion(locA.state);
      const regB = getRegion(locB.state);
      if (regA && regB && regA === regB) {
        score += 6; // same macro-region
      } else {
        score += 2; // different regions
      }
    }
  } else {
    score += 6; // neutral when location data is missing
  }

  return score;
}

/* ─── Desire Fulfilment scoring (new) ──────────────────────────── */

/**
 * Scores how well a DesiredVehicle matches an offered car.
 * Returns 0–15.
 */
function calculateDesireFulfillment(
  car: CarPost["car"],
  want: DesiredVehicle
): number {
  let score = 0;

  // Vehicle type mode — simplified scoring
  if (want.vehicleType) {
    const inferred = inferVehicleType(car.model);
    if (inferred === want.vehicleType) return 10;
    // Permissive: if we can't infer the type, assume it could match
    if (inferred === null) return 5;
    return 0;
  }

  // Brand (max 3)
  if (want.brand && car.brand.toLowerCase() === want.brand.toLowerCase()) {
    score += 3;
  }

  // Model (max 3)
  if (want.model) {
    const carModelLower = car.model.toLowerCase();
    const wantModel = want.model.toLowerCase().trim();
    if (carModelLower.startsWith(wantModel) || carModelLower.includes(` ${wantModel}`)) {
      score += 3;
    }
  }

  // Version + transmission (max 4)
  let detailMatch = true;
  if (want.version) {
    if (!car.model.toLowerCase().includes(want.version.toLowerCase())) {
      detailMatch = false;
    }
  }
  if (detailMatch && want.transmission) {
    const hasAuto = hasAutomaticTransmission(car.model);
    const hasManual = hasManualTransmission(car.model);
    if (want.transmission === "Automático" && !hasAuto) detailMatch = false;
    if (want.transmission === "Manual" && !hasManual) detailMatch = false;
  }
  if (detailMatch && (want.version || want.transmission)) {
    score += 4;
  }

  // Year within bounds (max 3)
  if (want.yearMin !== undefined || want.yearMax !== undefined) {
    let yearOk = true;
    if (want.yearMin !== undefined && car.year < want.yearMin) yearOk = false;
    if (want.yearMax !== undefined && car.year > want.yearMax) yearOk = false;
    if (yearOk) score += 3;
  }

  // Mileage within bounds (max 2) — NEW
  if (want.mileageMin !== undefined || want.mileageMax !== undefined) {
    if (car.mileage !== undefined) {
      let mileageOk = true;
      if (want.mileageMin !== undefined && car.mileage < want.mileageMin) mileageOk = false;
      if (want.mileageMax !== undefined && car.mileage > want.mileageMax) mileageOk = false;
      if (mileageOk) score += 2;
    }
    // If car has no mileage data but bounds are set, skip (no penalty)
  }

  return Math.min(score, 15);
}

/* ─── Score calculation (rewritten) ────────────────────────────── */

/**
 * Calculates the overall match score (0–100) using the new three-part
 * breakdown: Car Similarity (50) + Desire Fulfilment (30) + Cash (20).
 */
function calculateVehicleScore(
  carA: CarPost["car"],
  carB: CarPost["car"],
  wantA: DesiredVehicle,
  wantB: DesiredVehicle,
  suggestedCash: number | null
): number {
  let score = 0;

  // Part 1: Car Similarity (max 50)
  score += calculateCarSimilarity(carA, carB);

  // Part 2: Desire Fulfilment (max 30)
  score += calculateDesireFulfillment(carB, wantA); // A wants B's car
  score += calculateDesireFulfillment(carA, wantB); // B wants A's car

  // Part 3: Cash Compatibility (max 20)
  if (suggestedCash !== null) {
    const absCash = Math.abs(suggestedCash);
    if (absCash <= 500) score += 20;
    else if (absCash <= 3000) score += 15;
    else if (absCash <= 10000) score += 10;
    else if (absCash <= 25000) score += 5;
    else score += 2;
  }

  return Math.min(score, 100);
}

/* ─── Pair-level match finder (updated) ────────────────────────── */

interface VehicleMatchResult {
  wantA: DesiredVehicle;
  wantB: DesiredVehicle;
  score: number;
  suggestedCash: number;
}

/**
 * For a pair of posts (A, B), applies all gates and finds the best
 * combination of DesiredVehicles.
 */
function findBestVehicleMatch(
  postA: CarPost,
  postB: CarPost
): VehicleMatchResult | null {
  // Location gate: both have maxDistance but different states → reject
  if (!locationGate(postA, postB)) return null;

  const aVehicles = postA.desiredTrade.vehicles || [];
  const bVehicles = postB.desiredTrade.vehicles || [];

  let best: VehicleMatchResult | null = null;

  for (const wantA of aVehicles) {
    if (!vehicleMatchesCar(postB.car, wantA)) continue;

    for (const wantB of bVehicles) {
      if (!vehicleMatchesCar(postA.car, wantB)) continue;

      const rangeA = getCashRange(
        wantA.cashAdjustment,
        wantA.cashAdjustmentTolerance
      );
      const rangeB = getCashRange(
        wantB.cashAdjustment,
        wantB.cashAdjustmentTolerance
      );

      const suggestedCash = cashCompatible(rangeA, rangeB);
      if (suggestedCash === null) continue;

      const score = calculateVehicleScore(
        postA.car,
        postB.car,
        wantA,
        wantB,
        suggestedCash
      );

      if (!best || score > best.score) {
        best = { wantA, wantB, score, suggestedCash };
      }
    }
  }

  return best;
}

/* ─── Main matching entry point (updated) ──────────────────────── */

/**
 * Roda o matching entre todos os posts ativos.
 *
 * Para cada par que passa todos os gates (vehicle, cash, location),
 * calcula um score 0–100. Pairs com score abaixo de SCORE_SIMILAR
 * são descartados. O resultado é gravado em data/matches.json.
 */
export function runMatching(): Match[] {
  const allPosts = readData<CarPost>("posts");
  const posts = allPosts.filter((p) => p.isActive);
  const postMap = new Map(allPosts.map((p) => [p.id, p]));
  let matches = readData<Match>("matches");
  const newMatches: Match[] = [];

  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const postA = posts[i];
      const postB = posts[j];

      const best = findBestVehicleMatch(postA, postB);
      if (!best) continue;

      // Filter out low-scoring pairs
      if (best.score < SCORE_SIMILAR) continue;

      const existingIndex = matches.findIndex(
        (m) =>
          (m.postAId === postA.id && m.postBId === postB.id) ||
          (m.postAId === postB.id && m.postBId === postA.id)
      );

      const match: Match = {
        id: existingIndex >= 0 ? matches[existingIndex].id : generateId(),
        postAId: postA.id,
        postBId: postB.id,
        score: Math.round(best.score),
        suggestedCashFromA: best.suggestedCash,
        status: "pending",
        createdAt: nowISO(),
      };

      if (existingIndex >= 0) {
        matches[existingIndex] = match;
      } else {
        matches.push(match);
        newMatches.push(match);
      }
    }
  }

  // Remove matches órfãos
  const activePostIds = new Set(posts.map((p) => p.id));
  matches = matches.filter(
    (m) => activePostIds.has(m.postAId) && activePostIds.has(m.postBId)
  );

  writeData("matches", matches);

  // Auto-create conversations for newly matched posts
  for (const match of newMatches) {
    const postA = postMap.get(match.postAId);
    const postB = postMap.get(match.postBId);
    if (postA && postB) {
      createConversationFromMatch(match.id, postA.id, postA.userId, postB.userId);
    }
  }

  return newMatches;
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
