import { readData, writeData } from "./db";
import { generateId, nowISO } from "./utils";
import type { CarPost, Match, DesiredVehicle } from "./types";
import { createConversationFromMatch } from "./chat";
import { SCORE_PERFEITO, SCORE_SIMILAR } from "./match-score";
import {
  calculateVehicleScore,
  cashCompatible,
  getCashRange,
  locationGate,
  vehicleMatchesCar,
} from "./compat";

export { SCORE_PERFEITO, SCORE_SIMILAR };

/* ─── Score thresholds ─────────────────────────────────────────── */
/* SCORE_PERFEITO / SCORE_SIMILAR live in ./match-score so client components
   can import them without dragging this file's filesystem access along. */

/* The pure vehicle/cash/scoring gates now live in ./compat. They were moved
   verbatim out of this file so the chain engine (which runs in the browser)
   can reuse them without pulling node:fs in through ./db. */

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
