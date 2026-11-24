/**
 * Multi-party swap-chain engine.
 *
 * Pairwise matching needs A→B *and* B→A. Chains only need each person to want
 * the next person's car, which closes a ring: A wants B, B wants C, C wants A.
 * This module detects those rings.
 *
 * Purity: this file has no filesystem imports. It is imported by the
 * `/correntes` client component as well as by the API route.
 */

import type { CarPost, DesiredVehicle } from "./types";
import { formatBRL } from "./cash";
import {
  calculateCarSimilarity,
  calculateDesireFulfillment,
  cashCompatible,
  cashFitScore,
  getCashRange,
  vehicleMatchesCar,
  withinLimit,
} from "./compat";
import { SCORE_SIMILAR } from "./match-score";

/* ─── Public types ─────────────────────────────────────────────── */

export interface ChainEdge {
  fromPostId: string;
  toPostId: string;
  /** The desired vehicle on `from` that made this edge possible. */
  want: DesiredVehicle;
  /** Directional compatibility score, 0–100. */
  score: number;
  /** Declared net cash of the from-participant; positive = pays. */
  cashAdjustment: number;
  /** ± tolerance around `cashAdjustment`. */
  cashTolerance: number;
  /**
   * Pairwise midpoint when the other side also wants this car (a reciprocal
   * pair), otherwise null. Informational only — chain balancing uses the
   * participant's own net ask, not this value.
   */
  pairwiseCash: number | null;
}

export interface Chain {
  id: string;
  /** Ring order: posts[i] wants posts[i + 1], and the last wants posts[0]. */
  postIds: string[];
  posts: CarPost[];
  size: number;
  edges: ChainEdge[];
  /** Balanced net cash per participant, aligned with `posts`; positive = pays. */
  cashDeltas: number[];
  /** Sum of `cashDeltas` after balancing (≈ 0 for a feasible chain). */
  totalCash: number;
  /** Σ(cashAdjustment − tolerance): most the ring could receive in total. */
  cashLowerBound: number;
  /** Σ(cashAdjustment + tolerance): most the ring could pay in total. */
  cashUpperBound: number;
  /** Aggregate 0–100 score: mean of the directional edge scores. */
  score: number;
  scoreTotal: number;
  minEdgeScore: number;
  feasible: boolean;
  /** Human-readable blocking reasons (pt-BR). Empty when feasible. */
  reasons: string[];
  /** Non-blocking observations (e.g. a weak edge). */
  warnings: string[];
}

export interface DetectChainsOptions {
  /** Product limit; clamped to [3, MAX_CHAIN_LENGTH]. */
  maxLength?: number;
  /** Hard budget of edge visits. */
  maxSteps?: number;
  /** Hard cap on returned chains. */
  maxChains?: number;
}

/* ─── Search bound ─────────────────────────────────────────────── */

export const MIN_CHAIN_LENGTH = 3;
export const MAX_CHAIN_LENGTH = 5;

/**
 * Enumerating every simple cycle of length ≤ 5 in a graph with N posts is
 * O(N^5) in the worst case. That is fine for a small marketplace but not for
 * a public one, and a single post that accepts "qualquer SUV" makes the
 * out-degree explode. Three independent bounds keep a request predictable:
 *
 *   1. MAX_CHAIN_LENGTH = 5 — product limit: rings longer than five people
 *      are unmanageable in practice.
 *   2. MAX_SEARCH_STEPS = 200_000 — a global budget of edge visits per call.
 *   3. MAX_CHAINS = 200 — a hard cap on returned chains.
 *
 * Rotations are additionally pruned: a cycle is only explored from its
 * lexicographically smallest post id. That reports each directed ring exactly
 * once and cuts the N rotations to one. Reverse rings remain distinct because
 * edges are directed and the cash legs differ.
 */
export const MAX_SEARCH_STEPS = 200_000;
export const MAX_CHAINS = 200;

/** R$ 1 of slack for floating-point noise when proving Σdeltas = 0. */
const CASH_EPSILON = 1;

/* ─── Graph construction ───────────────────────────────────────── */

interface DirectedEdge extends ChainEdge {
  from: CarPost;
  to: CarPost;
}

interface EdgeCandidate {
  want: DesiredVehicle;
  wantIndex: number;
  cashAdjustment: number;
  cashTolerance: number;
  score: number;
  pairwiseCash: number | null;
}

/** Raw maxima for the one-sided edge score: similarity 50 + desire 15 + cash 20. */
const MAX_DIRECTIONAL_SCORE = 85;

function safeNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * A chain edge is directional: it scores how well `to`'s car satisfies
 * `from`'s want. The reciprocal desire component used by the pairwise engine
 * is deliberately absent — a chain exists precisely when that component is
 * missing. We keep the other three components (car similarity, desire
 * fulfilment, cash fit) and normalise 0–85 to 0–100.
 */
function scoreEdge(
  from: CarPost,
  to: CarPost,
  want: DesiredVehicle,
  cash: number
): number {
  const raw =
    calculateCarSimilarity(from.car, to.car) +
    calculateDesireFulfillment(to.car, want) +
    cashFitScore(cash);
  return Math.round((raw / MAX_DIRECTIONAL_SCORE) * 100);
}

/**
 * When several desired vehicles on `from` accept `to`'s car, keep the graph a
 * simple digraph: choose the highest edge score, then the smallest absolute
 * cash ask, then the earliest declared want. Determinism matters because the
 * search budget is finite.
 */
function findEdgeCandidate(from: CarPost, to: CarPost): EdgeCandidate | null {
  const wants = from.desiredTrade.vehicles ?? [];
  let best: EdgeCandidate | null = null;

  for (let i = 0; i < wants.length; i++) {
    const want = wants[i];
    if (!vehicleMatchesCar(to.car, want)) continue;

    const cashAdjustment = safeNumber(want.cashAdjustment);
    const cashTolerance = Math.max(0, safeNumber(want.cashAdjustmentTolerance));
    const score = scoreEdge(from, to, want, cashAdjustment);

    // `cashCompatible` is the pairwise gate. It only has a meaning when the
    // other side also wants this car; in a chain that is often false, so the
    // result is stored as an annotation rather than used as a gate.
    const returnWant = (to.desiredTrade.vehicles ?? []).find((w) =>
      vehicleMatchesCar(from.car, w)
    );
    const pairwiseCash = returnWant
      ? cashCompatible(
          getCashRange(cashAdjustment, cashTolerance),
          getCashRange(
            safeNumber(returnWant.cashAdjustment),
            Math.max(0, safeNumber(returnWant.cashAdjustmentTolerance))
          )
        )
      : null;

    const candidate: EdgeCandidate = {
      want,
      wantIndex: i,
      cashAdjustment,
      cashTolerance,
      score,
      pairwiseCash,
    };

    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score &&
        Math.abs(candidate.cashAdjustment) < Math.abs(best.cashAdjustment)) ||
      (candidate.score === best.score &&
        Math.abs(candidate.cashAdjustment) === Math.abs(best.cashAdjustment) &&
        candidate.wantIndex < best.wantIndex)
    ) {
      best = candidate;
    }
  }

  return best;
}

function buildGraph(posts: CarPost[]): Map<string, DirectedEdge[]> {
  const graph = new Map<string, DirectedEdge[]>();

  for (const from of posts) {
    const edges: DirectedEdge[] = [];

    for (const to of posts) {
      if (from.id === to.id) continue;

      // The distance limit applies to the car this owner wants, not
      // symmetrically: a chain only needs to move `to`'s car to `from`.
      const limit = from.desiredTrade.maxDistance;
      if (limit !== undefined && limit !== null && limit > 0) {
        if (!withinLimit(to.car.localization, from.car.localization, limit)) {
          continue;
        }
      }

      const candidate = findEdgeCandidate(from, to);
      if (!candidate) continue;

      edges.push({
        from,
        to,
        fromPostId: from.id,
        toPostId: to.id,
        want: candidate.want,
        score: candidate.score,
        cashAdjustment: candidate.cashAdjustment,
        cashTolerance: candidate.cashTolerance,
        pairwiseCash: candidate.pairwiseCash,
      });
    }

    // Stable order keeps the bounded DFS deterministic.
    edges.sort((a, b) => a.to.id.localeCompare(b.to.id));
    graph.set(from.id, edges);
  }

  return graph;
}

/* ─── Cash balancing ───────────────────────────────────────────── */

function roundCash(value: number): number {
  return Math.round(value * 100) / 100;
}

interface BalancedCash {
  deltas: number[];
  total: number;
  lower: number;
  upper: number;
  balanced: boolean;
}

/**
 * Balancing rule
 * --------------
 * A participant's matched `DesiredVehicle.cashAdjustment` is treated as their
 * **net** cash ask: positive means they expect to add money to leave with the
 * car they want, negative means they expect to receive money. In a closed
 * ring those net asks must sum to zero — otherwise the group is collectively
 * asking for cash that no participant is supplying.
 *
 * Every ask has a ±`cashAdjustmentTolerance`. The ring is accepted when the
 * sum of the intervals contains zero:
 *
 *     Σ(ask − tol) ≤ 0 ≤ Σ(ask + tol)
 *
 * and then each delta is shifted inside its own interval until the sum is
 * exactly zero. The shifted values are what the UI shows as "paga/recebe".
 * This is stronger than "the car values roughly match": it proves the cash
 * legs can actually be settled as a group.
 *
 * (The pairwise `cashCompatible` midpoint is not the balancing gate: it needs
 * both people to want each other's car, which is exactly what a chain does
 * not require. It is still attached to each edge when available.)
 */
function balanceCash(values: number[], tolerances: number[]): BalancedCash {
  const lower = values.map((v, i) => v - tolerances[i]);
  const upper = values.map((v, i) => v + tolerances[i]);
  const lowerSum = lower.reduce((a, b) => a + b, 0);
  const upperSum = upper.reduce((a, b) => a + b, 0);
  const midSum = values.reduce((a, b) => a + b, 0);

  if (lowerSum > CASH_EPSILON || upperSum < -CASH_EPSILON) {
    return {
      deltas: values.map(roundCash),
      total: roundCash(midSum),
      lower: roundCash(lowerSum),
      upper: roundCash(upperSum),
      balanced: false,
    };
  }

  // Start at the declared asks and move the residual inside tolerances.
  const deltas = values.slice();
  let remaining = -midSum;
  const order = deltas
    .map((_, i) => i)
    .sort((a, b) => tolerances[b] - tolerances[a] || a - b);

  for (const i of order) {
    if (Math.abs(remaining) <= 0.005) break;
    const target = deltas[i] + remaining;
    const clamped = Math.min(upper[i], Math.max(lower[i], target));
    remaining -= clamped - deltas[i];
    deltas[i] = clamped;
  }

  // Rounding to cents can leave a few cents behind; absorb them on a
  // participant that still has tolerance room.
  const rounded = deltas.map(roundCash);
  let residue = roundCash(-rounded.reduce((a, b) => a + b, 0));
  if (Math.abs(residue) > 0.005) {
    for (const i of order) {
      if (Math.abs(residue) <= 0.005) break;
      const target = rounded[i] + residue;
      const clamped = Math.min(upper[i], Math.max(lower[i], target));
      const applied = roundCash(clamped - rounded[i]);
      rounded[i] = roundCash(clamped);
      residue = roundCash(residue - applied);
    }
  }

  const total = roundCash(rounded.reduce((a, b) => a + b, 0));
  return {
    deltas: rounded,
    total,
    lower: roundCash(lowerSum),
    upper: roundCash(upperSum),
    balanced: Math.abs(total) <= CASH_EPSILON,
  };
}

/* ─── Chain assembly ───────────────────────────────────────────── */

function buildChain(
  ringPostIds: string[],
  edges: DirectedEdge[],
  byId: Map<string, CarPost>
): Chain {
  // Copy: the DFS reuses and mutates its path array while unwinding.
  const postIds = [...ringPostIds];
  const posts = postIds
    .map((id) => byId.get(id))
    .filter((post): post is CarPost => Boolean(post));

  const cash = balanceCash(
    edges.map((edge) => edge.cashAdjustment),
    edges.map((edge) => edge.cashTolerance)
  );
  const edgeScores = edges.map((edge) => edge.score);
  const scoreTotal = edgeScores.reduce((a, b) => a + b, 0);
  const score = Math.round(scoreTotal / Math.max(1, edgeScores.length));
  const minEdgeScore = Math.min(...edgeScores);

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (posts.length !== postIds.length || edges.length !== postIds.length) {
    reasons.push("Ciclo inválido: faltam participantes ou ligações.");
  }
  if (new Set(postIds).size !== postIds.length) {
    reasons.push("Ciclo inválido: participante repetido.");
  }
  if (posts.length < MIN_CHAIN_LENGTH || posts.length > MAX_CHAIN_LENGTH) {
    reasons.push("Ciclo inválido: tamanho fora do limite de 3 a 5.");
  }
  if (!cash.balanced) {
    reasons.push(
      `O caixa não fecha: a soma dos ajustes fica entre R$ ${formatBRL(
        cash.lower
      )} e R$ ${formatBRL(cash.upper)}, sem incluir zero.`
    );
  }
  if (minEdgeScore < SCORE_SIMILAR) {
    warnings.push(
      "Uma das trocas tem compatibilidade baixa; confira os detalhes antes de negociar."
    );
  }

  return {
    id: `chain_${postIds.join("_")}`,
    postIds,
    posts,
    size: posts.length,
    edges: edges.map((edge) => ({
      fromPostId: edge.fromPostId,
      toPostId: edge.toPostId,
      want: edge.want,
      score: edge.score,
      cashAdjustment: edge.cashAdjustment,
      cashTolerance: edge.cashTolerance,
      pairwiseCash: edge.pairwiseCash,
    })),
    cashDeltas: cash.deltas,
    totalCash: cash.total,
    cashLowerBound: cash.lower,
    cashUpperBound: cash.upper,
    score,
    scoreTotal,
    minEdgeScore,
    feasible: reasons.length === 0,
    reasons,
    warnings,
  };
}

/* ─── Public entry point ──────────────────────────────────────── */

/**
 * Detects directed simple cycles of 3–5 posts.
 *
 * Edges: A → B when B's car satisfies at least one of A's
 * `desiredTrade.vehicles`, after the same distance gate the pairwise engine
 * uses. Cash is validated per ring by `balanceCash`.
 *
 * Returns every detected ring (feasible first), not just the closable ones,
 * so the UI can be honest about cash that does not balance.
 */
export function detectChains(
  posts: CarPost[],
  options: DetectChainsOptions = {}
): Chain[] {
  const active = posts.filter((post) => post.isActive !== false);
  const byId = new Map(active.map((post) => [post.id, post]));
  const nodeIds = active.map((post) => post.id).sort();
  const order = new Map(nodeIds.map((id, index) => [id, index]));
  const graph = buildGraph(active);

  const maxLength = Math.max(
    MIN_CHAIN_LENGTH,
    Math.min(options.maxLength ?? MAX_CHAIN_LENGTH, MAX_CHAIN_LENGTH)
  );
  const maxSteps = Math.max(1, options.maxSteps ?? MAX_SEARCH_STEPS);
  const maxChains = Math.max(1, options.maxChains ?? MAX_CHAINS);

  const chains: Chain[] = [];
  const seen = new Set<string>();
  let steps = 0;

  const visit = (
    startId: string,
    currentId: string,
    path: string[],
    edges: DirectedEdge[],
    visited: Set<string>
  ): void => {
    if (steps >= maxSteps || chains.length >= maxChains) return;

    for (const edge of graph.get(currentId) ?? []) {
      steps++;
      if (steps > maxSteps) return;

      const nextId = edge.to.id;

      if (nextId === startId) {
        if (path.length >= MIN_CHAIN_LENGTH && path.length <= maxLength) {
          const key = path.join(">");
          if (!seen.has(key)) {
            seen.add(key);
            chains.push(buildChain([...path], [...edges, edge], byId));
          }
        }
        continue;
      }

      if (visited.has(nextId)) continue;
      if (path.length >= maxLength) continue;

      // Canonical rotation: only the smallest id in the ring may start the
      // DFS. Without this, every ring would be found once per rotation.
      if ((order.get(nextId) ?? 0) < (order.get(startId) ?? 0)) continue;

      visited.add(nextId);
      path.push(nextId);
      edges.push(edge);
      visit(startId, nextId, path, edges, visited);
      edges.pop();
      path.pop();
      visited.delete(nextId);

      if (steps >= maxSteps || chains.length >= maxChains) return;
    }
  };

  for (const startId of nodeIds) {
    if (steps >= maxSteps || chains.length >= maxChains) break;
    visit(startId, startId, [startId], [], new Set([startId]));
  }

  chains.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.size !== b.size) return a.size - b.size;
    return a.id.localeCompare(b.id);
  });

  return chains;
}
