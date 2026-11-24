/**
 * Brazilian macro-regions by state UF code.
 * Used by the matching engine for location-based scoring.
 */
const REGIONS: Record<string, string> = {
  // Sudeste
  SP: "Sudeste",
  RJ: "Sudeste",
  MG: "Sudeste",
  ES: "Sudeste",
  // Sul
  RS: "Sul",
  SC: "Sul",
  PR: "Sul",
  // Nordeste
  BA: "Nordeste",
  PE: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  RN: "Nordeste",
  PB: "Nordeste",
  AL: "Nordeste",
  SE: "Nordeste",
  PI: "Nordeste",
  // Norte
  AM: "Norte",
  PA: "Norte",
  TO: "Norte",
  RO: "Norte",
  RR: "Norte",
  AC: "Norte",
  AP: "Norte",
  // Centro-Oeste
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
};

/**
 * Returns the macro-region name for a given state UF code.
 * @param uf Two-letter state code (e.g. "SP", "RJ")
 * @returns Region name or null if unknown
 */
export function getRegion(uf: string): string | null {
  return REGIONS[uf.toUpperCase()] ?? null;
}

/** Raw region map, exported for iteration by location-utils. */
export const REGIONS_MAP = REGIONS;
