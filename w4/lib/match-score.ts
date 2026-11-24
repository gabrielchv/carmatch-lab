/**
 * Match score thresholds.
 *
 * Lives in its own dependency-free module because both the server engine
 * (`lib/matching.ts`, which reads JSON from disk) and client components need
 * them. Importing them from the engine pulled `node:fs` into the browser
 * bundle and broke the build.
 */

/** At or above this score a match is presented as "perfect". */
export const SCORE_PERFEITO = 76;

/** Below this score a pair is discarded entirely. */
export const SCORE_SIMILAR = 36;

export function matchTier(score: number): "perfect" | "similar" {
  return score >= SCORE_PERFEITO ? "perfect" : "similar";
}
