/**
 * Roda — multi-party trade rings.
 *
 * Pairwise matching is sparse: A must want B's car *and* B must want A's. Most
 * real inventories are chains instead: A wants B, B wants C, C wants A. Each
 * pair fails on its own, yet all three can trade at once. This module finds
 * those simple directed cycles of length 3–5 and works out the cash that makes
 * them consistent.
 *
 * Pure on purpose: no `node:fs`, no `next/*`. The API and the client share the
 * exact same engine, so the ring page and the endpoint can never disagree.
 */

import type { CarPost, DesiredVehicle } from "./types";
import { vehicleMatchesCar } from "./compat";
import { formatBRL } from "./cash";
import { shortCarName } from "./whatsapp";
import { parseLocalization } from "./location-utils";
import { getRegion } from "./brazil-regions";

/* ─── Explicit search bounds ───────────────────────────────────── */

/**
 * A 2-cycle is just the pairwise match the existing matcher already serves, so
 * rings start at 3. Above 5, coordination in a single WhatsApp group becomes
 * unrealistic and the number of simple cycles explodes factorially.
 */
export const RODA_MIN_LENGTH = 3;
export const RODA_MAX_LENGTH = 5;

/**
 * Hard cap on DFS edge expansions. With the default bounds, a few thousand
 * listings would otherwise be able to freeze a request on a dense graph (every
 * post wanting every car). 200k expansions is far beyond anything a useful
 * inventory produces; hitting it marks the result `truncated` instead of
 * pretending the list is complete.
 */
export const RODA_MAX_STEPS = 200_000;

/**
 * The page is meant to be read, not scrolled forever. Sixty rings is already
 * more than anyone will act on; the cap also bounds response size and the work
 * done enriching owners.
 */
export const RODA_MAX_RINGS = 60;

/* ─── Types ────────────────────────────────────────────────────── */

export interface RodaOptions {
  minLength?: number;
  maxLength?: number;
  maxSteps?: number;
  maxRings?: number;
}

/** A directed "A wants B's car" edge, with the want that produced it. */
export interface RodaEdge {
  from: string;
  to: string;
  /** The desired vehicle of `from` that matches `to`'s car. */
  want: DesiredVehicle;
  /** What `from` is willing to pay their successor (negative = receive). */
  rawDelta: number;
  tolerance: number;
}

export interface RodaParticipant {
  postId: string;
  userId: string;
  title: string;
  car: CarPost["car"];
  city?: string;
  value: number;
  /**
   * Balanced cash position: positive = pays into the ring, negative = receives.
   * Across a ring these always sum to zero (the balancing rule below).
   */
  cashDelta: number;
  /** The owner's own ask, before the ring-wide correction. */
  rawCashDelta: number;
  cashTolerance: number;
  /** The participant whose car this person receives (the "successor"). */
  paysToPostId: string;
  /** Filled in by the API from the users collection; absent in pure calls. */
  ownerName?: string;
  /** Filled in by the API from the listing's contact info. */
  ownerWhatsapp?: string | null;
}

export interface RodaRing {
  id: string;
  size: number;
  /** 0–100, cash fit + ring size + geographic spread. */
  score: number;
  participants: RodaParticipant[];
  /** Σ balanced deltas — always 0, kept as evidence in the payload. */
  cashResidual: number;
  /** Σ raw deltas before balancing; what feasibility is judged on. */
  rawCashResidual: number;
  /** Σ each owner's stated tolerance; the ring's cash correction budget. */
  cashToleranceBudget: number;
}

export interface RodaStats {
  posts: number;
  edges: number;
  rings: number;
  steps: number;
  truncated: boolean;
  bySize: Record<string, number>;
}

export interface RodaResult {
  rings: RodaRing[];
  stats: RodaStats;
}

/* ─── Graph construction ───────────────────────────────────────── */

/**
 * Best want for `post` given `target`'s car.
 *
 * A listing may accept several vehicles that all match the same car. We pick
 * the one closest to a direct swap (smallest |cashAdjustment|), because that
 * keeps the ring's cash residual — and therefore the chance it balances —
 * as small as possible. Ties go to the larger tolerance, then to declaration
 * order, so the result is deterministic.
 *
 * One want per edge is a deliberate simplification: expanding every
 * want combination per edge would make the search combinatorial for a gain the
 * cash rule rarely needs, since feasibility depends only on the sum. When an
 * owner lists several acceptable cars, the closest-to-even one is also the one
 * that gives that ring its best chance of closing.
 */
function bestWantFor(post: CarPost, target: CarPost): DesiredVehicle | null {
  let best: DesiredVehicle | null = null;

  for (const want of post.desiredTrade?.vehicles ?? []) {
    if (!vehicleMatchesCar(target.car, want)) continue;
    if (!best) {
      best = want;
      continue;
    }

    const candidateAbs = Math.abs(want.cashAdjustment ?? 0);
    const bestAbs = Math.abs(best.cashAdjustment ?? 0);
    const candidateTol = Math.max(0, want.cashAdjustmentTolerance ?? 0);
    const bestTol = Math.max(0, best.cashAdjustmentTolerance ?? 0);

    if (candidateAbs < bestAbs || (candidateAbs === bestAbs && candidateTol > bestTol)) {
      best = want;
    }
  }

  return best;
}

export interface RodaGraph {
  /** Post ids sorted for deterministic traversal. */
  nodes: string[];
  edges: Map<string, RodaEdge[]>;
  edgeCount: number;
  postsById: Map<string, CarPost>;
}

/**
 * Directed graph: A → B when B's car satisfies one of A's desired vehicles.
 *
 * The cash gate is deliberately *not* applied per edge. Each owner's ask is a
 * position in the trade, not a bilateral price; it only becomes meaningful once
 * the whole ring is known. Feasibility is decided on the sum (see balanceRing).
 */
export function buildRodaGraph(posts: CarPost[]): RodaGraph {
  const postsById = new Map<string, CarPost>();
  for (const post of posts) {
    if (post.isActive === false) continue;
    postsById.set(post.id, post);
  }

  const nodes = Array.from(postsById.keys()).sort();
  const edges = new Map<string, RodaEdge[]>();
  let edgeCount = 0;

  for (const from of nodes) {
    const fromPost = postsById.get(from)!;
    const outgoing: RodaEdge[] = [];

    for (const to of nodes) {
      if (to === from) continue;
      const toPost = postsById.get(to)!;
      const want = bestWantFor(fromPost, toPost);
      if (!want) continue;

      outgoing.push({
        from,
        to,
        want,
        rawDelta: want.cashAdjustment ?? 0,
        tolerance: Math.max(0, want.cashAdjustmentTolerance ?? 0),
      });
    }

    outgoing.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
    edges.set(from, outgoing);
    edgeCount += outgoing.length;
  }

  return { nodes, edges, edgeCount, postsById };
}

/* ─── Cash balancing ───────────────────────────────────────────── */

interface BalancedCash {
  deltas: number[];
  rawResidual: number;
  budget: number;
}

/**
 * The cash rule.
 *
 * Each edge A→B carries A's `cashAdjustment`: what A is willing to pay B on top
 * of their own car to receive B's. Around a ring the implied car values
 * telescope — value(B) = value(A) + δ_A, value(C) = value(B) + δ_B, … — so a
 * consistent ring requires Σδ ≈ 0. A positive sum means the group as a whole is
 * trying to pay more than it receives; a negative one means someone is
 * undervaluing their own car.
 *
 * Each owner also stated a tolerance. The ring is feasible when the residual
 * fits inside the combined tolerance budget T = Σtᵢ. We then spread the
 * correction proportionally to each owner's tolerance (cᵢ = −R·tᵢ/T), which
 * guarantees |cᵢ| ≤ tᵢ exactly when |R| ≤ T. With T = 0 the raw asks must sum to
 * zero exactly.
 *
 * The correction is rounded to whole reais at the end; any rounding drift is
 * absorbed by the owner with the largest tolerance so the displayed deltas still
 * sum to exactly zero.
 */
function balanceRing(edges: RodaEdge[]): BalancedCash | null {
  const raw = edges.map((e) => e.rawDelta);
  const tolerances = edges.map((e) => e.tolerance);

  const rawResidual = raw.reduce((sum, value) => sum + value, 0);
  const budget = tolerances.reduce((sum, value) => sum + value, 0);

  // 0.5 absorbs floating-point noise; the inputs are reais, not centavos.
  if (Math.abs(rawResidual) > budget + 0.5) return null;

  const corrected =
    budget > 0
      ? raw.map((value, i) => value - rawResidual * (tolerances[i] / budget))
      : raw.slice();

  const deltas = corrected.map((value) => Math.round(value));
  const drift = deltas.reduce((sum, value) => sum + value, 0);

  if (drift !== 0) {
    let absorb = 0;
    for (let i = 1; i < tolerances.length; i++) {
      if (tolerances[i] > tolerances[absorb]) absorb = i;
    }
    deltas[absorb] -= drift;
  }

  return { deltas, rawResidual, budget };
}

/* ─── Ring score ───────────────────────────────────────────────── */

/**
 * Aggregate 0–100, deliberately simple and explainable:
 *  · 60 for cash fit (60 when the raw asks already sum to zero, 30 at the edge
 *    of the tolerance budget);
 *  · 20/16/12 for a 3/4/5-person ring, because smaller rings close faster;
 *  · up to 20 for geography (same state 20, same macro-region 12, unknown 10,
 *    different regions 4) — a ring still needs cars physically delivered.
 */
function scoreRing(
  rawResidual: number,
  budget: number,
  size: number,
  cars: CarPost["car"][]
): number {
  const cashFit =
    60 * (1 - Math.abs(rawResidual) / Math.max(budget + Math.abs(rawResidual), 1));
  const sizeFit = size === 3 ? 20 : size === 4 ? 16 : 12;

  const states = cars
    .map((car) => parseLocalization(car.localization || "").state)
    .filter(Boolean) as string[];

  let geo = 4;
  if (cars.length === 0) geo = 0;
  else if (states.length === 0) geo = 10;
  else if (states.length < cars.length) geo = 12;
  else if (new Set(states).size === 1) geo = 20;
  else if (new Set(states.map((state) => getRegion(state) ?? state)).size === 1) geo = 12;

  return Math.max(0, Math.min(100, Math.round(cashFit + sizeFit + geo)));
}

/* ─── Cycle detection ──────────────────────────────────────────── */

/**
 * Enumerates every simple directed cycle of length minLength–maxLength.
 *
 * Rotations are deduplicated without a canonical-string pass: each DFS starts
 * at a fixed node and may only visit nodes whose sorted index is greater than
 * the start's. Every cycle therefore has exactly one "smallest id" node and is
 * reported once, from that node.
 *
 * A reversed ring (A→C→B→A when A→B→C→A also exists) is *not* a rotation: each
 * participant would receive a different car, so it is a legitimately different
 * arrangement and is reported separately when its cash balances.
 */
export function findRings(
  posts: CarPost[],
  options: RodaOptions = {}
): RodaResult {
  const minLength = Math.max(RODA_MIN_LENGTH, options.minLength ?? RODA_MIN_LENGTH);
  const maxLength = Math.max(minLength, Math.min(options.maxLength ?? RODA_MAX_LENGTH, 8));
  const maxSteps = Math.max(1, options.maxSteps ?? RODA_MAX_STEPS);
  const maxRings = Math.max(1, options.maxRings ?? RODA_MAX_RINGS);

  const graph = buildRodaGraph(posts);
  const index = new Map(graph.nodes.map((id, i) => [id, i]));

  const cycles: RodaEdge[][] = [];
  const visited = new Set<string>();
  let steps = 0;
  let truncated = false;

  const dfs = (start: string, current: string, path: RodaEdge[]) => {
    if (cycles.length >= maxRings) {
      truncated = true;
      return;
    }

    for (const edge of graph.edges.get(current) ?? []) {
      if (truncated) return;
      steps++;
      if (steps > maxSteps) {
        truncated = true;
        return;
      }

      if (edge.to === start) {
        // A closing edge shorter than minLength is a 2-cycle: already handled
        // by the pairwise matcher, so it is intentionally not a ring.
        if (path.length + 1 >= minLength) {
          cycles.push([...path, edge]);
        }
        continue;
      }

      if (path.length + 1 >= maxLength) continue;
      if (visited.has(edge.to)) continue;
      // Keeps `start` as the smallest id in the cycle → one report per rotation.
      if (index.get(edge.to)! <= index.get(start)!) continue;

      visited.add(edge.to);
      path.push(edge);
      dfs(start, edge.to, path);
      path.pop();
      visited.delete(edge.to);
    }
  };

  for (const start of graph.nodes) {
    if (truncated) break;
    visited.add(start);
    dfs(start, start, []);
    visited.delete(start);
  }

  const rings: RodaRing[] = [];

  for (const cycle of cycles) {
    const cash = balanceRing(cycle);
    if (!cash) continue;

    const participants = cycle.map((edge, i) => {
      const post = graph.postsById.get(edge.from)!;
      return {
        postId: post.id,
        userId: post.userId,
        title: post.title,
        car: post.car,
        city: post.car.localization,
        value: post.car.estimatedValue,
        cashDelta: cash.deltas[i],
        rawCashDelta: edge.rawDelta,
        cashTolerance: edge.tolerance,
        paysToPostId: edge.to,
      } satisfies RodaParticipant;
    });

    const cashResidual = participants.reduce((sum, p) => sum + p.cashDelta, 0);

    rings.push({
      id: participants.map((p) => p.postId).join(">"),
      size: participants.length,
      score: scoreRing(
        cash.rawResidual,
        cash.budget,
        participants.length,
        participants.map((p) => p.car)
      ),
      participants,
      cashResidual,
      rawCashResidual: cash.rawResidual,
      cashToleranceBudget: cash.budget,
    });
  }

  // Best rings first: a high score is one that is easy to close.
  rings.sort(
    (a, b) =>
      b.score - a.score ||
      a.size - b.size ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  const bySize: Record<string, number> = {};
  for (const ring of rings) {
    bySize[String(ring.size)] = (bySize[String(ring.size)] ?? 0) + 1;
  }

  return {
    rings,
    stats: {
      posts: graph.nodes.length,
      edges: graph.edgeCount,
      rings: rings.length,
      steps,
      truncated,
      bySize,
    },
  };
}

/* ─── "Does a ring already feature a car like mine?" ───────────── */

function firstModelToken(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")[0] ?? "";
}

/**
 * Loose comparison used by the onboarding hint: same brand and the same first
 * model word ("Fit" ↔ "Fit CX 1.4"). Year is intentionally ignored — the wizard
 * treats it as optional, and a 2013 Fit is still a Fit-shaped hole in a ring.
 */
export function carIsLike(
  car: CarPost["car"],
  like: { brand: string; model: string }
): boolean {
  if (!like.brand?.trim() || !like.model?.trim()) return false;
  if (car.brand.trim().toLowerCase() !== like.brand.trim().toLowerCase()) {
    return false;
  }
  const token = firstModelToken(like.model);
  if (token.length < 2) return false;
  return car.model.toLowerCase().includes(token);
}

export function ringFeaturesCar(
  ring: RodaRing,
  like: { brand: string; model: string }
): boolean {
  return ring.participants.some((participant) => carIsLike(participant.car, like));
}

export function countRingsFeaturingCar(
  rings: RodaRing[],
  like: { brand: string; model: string }
): number {
  return rings.filter((ring) => ringFeaturesCar(ring, like)).length;
}

/* ─── WhatsApp invitation ──────────────────────────────────────── */

/**
 * The ring is closed by talking, not by a server-side group.
 *
 * A WhatsApp group invite link cannot be created from outside WhatsApp (it
 * requires a group admin inside the app), so this message is an invitation to
 * each participant to reply. Once everyone answers, the organiser creates the
 * group from their own WhatsApp. The copy says that plainly — it does not
 * pretend a group already exists.
 */
export function buildRodaInviteMessage(ring: RodaRing, origin?: string): string {
  const lines: string[] = [
    `Oi! Encontrei uma roda de ${ring.size} no CarMatch Roda 🔄`,
    "",
    "Cada um quer o carro do próximo:",
  ];

  ring.participants.forEach((participant, i) => {
    const name =
      participant.ownerName?.trim().split(/\s+/)[0] || `Pessoa ${i + 1}`;
    const cash =
      participant.cashDelta > 0
        ? `paga R$ ${formatBRL(participant.cashDelta)}`
        : participant.cashDelta < 0
          ? `recebe R$ ${formatBRL(Math.abs(participant.cashDelta))}`
          : "troca direta";
    lines.push(`${i + 1}. ${name} — ${shortCarName(participant.car)} — ${cash}`);
  });

  lines.push(
    "",
    "As diferenças somam R$ 0, então a conta fecha entre todos.",
    "",
    'Se cada um responder "eu topo" aqui, eu crio o grupo com todo mundo e combinamos a entrega.',
    "(O WhatsApp não deixa criar um grupo por link: esta mensagem é o convite. Assim que todos responderem, eu crio o grupo.)"
  );

  if (origin) {
    lines.push("", `${origin.replace(/\/$/, "")}/roda`);
  }

  return lines.join("\n");
}
