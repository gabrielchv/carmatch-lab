/**
 * Pure compatibility helpers shared by the pairwise engine (`lib/matching.ts`)
 * and the ring engine (`lib/roda.ts`).
 *
 * These used to live inside `lib/matching.ts`, which imports `node:fs` for the
 * JSON store. Any client component or pure engine that only needed "does this
 * car satisfy this want?" was forced to pull the filesystem in too. Keeping the
 * gate here — with no I/O — lets the ring engine run in the browser while the
 * pairwise engine keeps identical behaviour.
 *
 * Nothing in this module may import `node:*`; that is the whole point.
 */

import type { CarPost, DesiredVehicle } from "./types";

/* ─── Vehicle type inference ───────────────────────────────────── */

/**
 * Infers the vehicle body type from a FIPE model name by checking for
 * common keywords. Returns null when no body type can be inferred.
 */
export function inferVehicleType(fipeName: string): string | null {
  const lower = fipeName.toLowerCase();
  if (lower.includes("hatchback") || lower.includes(" hatch")) return "Hatch";
  if (lower.includes("sedan") || lower.includes(" sd.") || lower.includes(" sda")) return "Sedan";
  if (lower.includes("suv")) return "SUV";
  if (lower.includes("pick-up") || lower.includes("pickup") || lower.includes("caminhonete")) return "Caminhonete";
  return null;
}

/* ─── Colour families ──────────────────────────────────────────── */

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
export function getColorFamily(color: string): string | null {
  return COLOR_FAMILIES[color.toLowerCase()] ?? null;
}

/* ─── Bilateral vehicle gate ───────────────────────────────────── */

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

/* ─── Transmission tokens ──────────────────────────────────────── */

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
