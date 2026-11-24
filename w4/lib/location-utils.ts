/**
 * Shared location utilities for the CarMatch app.
 *
 * Consolidates the two separate parseLocalization() implementations that existed
 * in matching.ts and LocationSelect.tsx, and provides proximity-based filtering
 * functions that use state adjacency and macro-regions (no coordinates needed).
 */

import { getAdjacentStates } from "./brazil-adjacency";
import { getRegion, REGIONS_MAP } from "./brazil-regions";

/* ─── Parsing ────────────────────────────────────────────────────── */

/**
 * Parses a location string into city and state components.
 *
 * Accepted formats:
 *  - "City, ST"      → { city: "City", state: "ST" }
 *  - "City - ST"     → { city: "City", state: "ST" }
 *  - "ST"            → { city: "", state: "ST" }
 *  - "" / undefined  → { city: "", state: "" }
 */
export function parseLocalization(loc: string): {
  city: string;
  state: string;
} {
  if (!loc) return { city: "", state: "" };

  // "City, ST"
  const commaMatch = loc.match(/^(.+),\s*([A-Z]{2})$/i);
  if (commaMatch)
    return { city: commaMatch[1].trim(), state: commaMatch[2].toUpperCase() };

  // "City - ST"
  const dashMatch = loc.match(/^(.+)\s*-\s*([A-Z]{2})$/i);
  if (dashMatch)
    return { city: dashMatch[1].trim(), state: dashMatch[2].toUpperCase() };

  // Bare state code "ST"
  const trimmed = loc.trim();
  if (/^[A-Z]{2}$/i.test(trimmed)) {
    return { city: "", state: trimmed.toUpperCase() };
  }

  // Unknown format — treat as city name only (shouldn't normally happen)
  return { city: trimmed, state: "" };
}

/* ─── Proximity tiers ────────────────────────────────────────────── */

/**
 * Returns the set of state UFs whose posts should be shown when the user
 * filters by location `targetUF` with the given `radiusKm`.
 *
 * Uses a tiered geographic approach:
 *   State-only selection:
 *      0 km–100 km   → exact state only
 *    101 km–300 km   → state + adjacent states
 *    301 km–800 km   → entire macro-region
 *    801+ km         → all Brazil (returns [])
 *
 *   City selection:
 *      0 km–50 km    → exact state only
 *     51 km–200 km   → state + adjacent states
 *    201 km–500 km   → entire macro-region
 *    501+ km         → all Brazil (returns [])
 *
 * Returns an empty array to mean "no filter — include everything".
 */
export function getNearbyStates(
  targetUF: string,
  radiusKm: number,
  hasCity: boolean
): string[] {
  const uf = targetUF.toUpperCase();

  if (radiusKm <= 0) return [uf];

  if (!hasCity) {
    // State-only selection
    if (radiusKm <= 100) return [uf];
    if (radiusKm <= 300) return getAdjacentStates(uf);
    if (radiusKm <= 800) return getStatesInRegion(uf);
    return [];
  } else {
    // City selection
    if (radiusKm <= 50) return [uf];
    if (radiusKm <= 200) return getAdjacentStates(uf);
    if (radiusKm <= 500) return getStatesInRegion(uf);
    return [];
  }
}

/**
 * Helper: returns all state UFs that belong to the same macro-region as `uf`.
 */
function getStatesInRegion(uf: string): string[] {
  const region = getRegion(uf);
  if (!region) return [uf];

  const result: string[] = [];
  for (const [code, reg] of Object.entries(REGIONS_MAP)) {
    if (reg === region) result.push(code);
  }
  return result.sort();
}

/**
 * Checks whether a post's location string falls within the proximity of a
 * filter's target location and radius.
 *
 * @param postLoc    The post's `car.localization` value (e.g. "Campinas - SP")
 * @param filterUF   The state UF the user selected in the filter
 * @param filterCity The city name the user selected (or null if only state)
 * @param radiusKm   The range/distance in km (-1 or 0 for exact-only)
 */
export function isInProximity(
  postLoc: string,
  filterUF: string,
  filterCity: string | null,
  radiusKm: number
): boolean {
  const parsed = parseLocalization(postLoc);
  if (!parsed.state) return false; // post has no parseable state — exclude

  const uf = filterUF.toUpperCase();

  // --- Exact-match mode (range 0 or -1) ---
  if (radiusKm <= 0) {
    if (filterCity && parsed.city) {
      // Exact city match
      return (
        parsed.state === uf &&
        parsed.city.toLowerCase() === filterCity.toLowerCase()
      );
    }
    // Exact state match
    return parsed.state === uf;
  }

  // --- Proximity mode ---
  const validStates = getNearbyStates(uf, radiusKm, !!filterCity);

  // Empty array = all Brazil (no filter)
  if (validStates.length === 0) return true;

  // Check if post's state is in the valid set
  if (!validStates.includes(parsed.state)) return false;

  return true;
}
