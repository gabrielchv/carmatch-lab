import { readData, writeData } from "./db";
import { generateId, nowISO } from "./utils";
import type { CarPost, Match } from "./types";
import { findBestVehicleMatch, SCORE_SIMILAR } from "./matching";

/**
 * The filesystem half of the matcher.
 *
 * `lib/matching.ts` holds the rules and is deliberately free of Node imports so
 * the same rules can run in a client component (onboarding preview) and in the
 * Radar watcher. Saving the result is the only part that needs the JSON store,
 * so it lives here — importing `lib/matching` from the browser no longer drags
 * `node:fs` into the bundle.
 */

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

  // Matched people reach each other through a WhatsApp deep link in the UI.
  // Nothing is created server-side: no conversation, no message, no poller.
  return newMatches;
}
