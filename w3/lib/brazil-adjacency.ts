/**
 * Brazilian state adjacency list.
 * Maps each state UF code to the array of UFs it shares a land border with.
 *
 * Data verified against official IBGE state boundary maps.
 */

const ADJACENCY: Record<string, string[]> = {
  AC: ["AM", "RO"],
  AL: ["BA", "PE", "SE"],
  AM: ["AC", "MT", "PA", "RO", "RR"],
  AP: ["PA"],
  BA: ["AL", "ES", "GO", "MG", "PE", "PI", "SE", "TO"],
  CE: ["PB", "PE", "PI", "RN"],
  DF: ["GO", "MG"],
  ES: ["BA", "MG", "RJ"],
  GO: ["BA", "DF", "MG", "MS", "MT", "TO"],
  MA: ["PA", "PI", "TO"],
  MG: ["BA", "DF", "ES", "GO", "MS", "RJ", "SP"],
  MS: ["GO", "MG", "MT", "PR", "SP"],
  MT: ["AM", "GO", "MS", "PA", "RO", "TO"],
  PA: ["AM", "AP", "MA", "MT", "RR", "TO"],
  PB: ["CE", "PE", "RN"],
  PE: ["AL", "BA", "CE", "PB", "PI"],
  PI: ["BA", "CE", "MA", "PE", "TO"],
  PR: ["MS", "SC", "SP"],
  RJ: ["ES", "MG", "SP"],
  RN: ["CE", "PB"],
  RO: ["AC", "AM", "MT"],
  RR: ["AM", "PA"],
  RS: ["SC"],
  SC: ["PR", "RS"],
  SE: ["AL", "BA"],
  SP: ["MG", "MS", "PR", "RJ"],
  TO: ["BA", "GO", "MA", "MT", "PA", "PI"],
};

/**
 * Returns the list of states adjacent to the given UF, INCLUDING the UF itself
 * (useful for proximity filtering — "this state and its neighbors").
 * Always sorted alphabetically for deterministic output.
 */
export function getAdjacentStates(uf: string): string[] {
  const neighbors = ADJACENCY[uf.toUpperCase()];
  if (!neighbors) return [uf.toUpperCase()];
  return [uf.toUpperCase(), ...neighbors].sort();
}

/**
 * Returns ONLY the neighbouring UFs (excluding the state itself).
 */
export function getNeighbors(uf: string): string[] {
  return ADJACENCY[uf.toUpperCase()] ?? [];
}

/**
 * Returns whether two states share a land border (or are the same state).
 */
export function areAdjacent(a: string, b: string): boolean {
  const ufA = a.toUpperCase();
  const ufB = b.toUpperCase();
  if (ufA === ufB) return true;
  return ADJACENCY[ufA]?.includes(ufB) ?? false;
}
