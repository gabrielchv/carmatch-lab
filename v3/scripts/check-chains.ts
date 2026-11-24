/**
 * Runnable proof for the chain engine.
 *
 *   npx tsx scripts/check-chains.ts
 *
 * Uses synthetic posts (no FIPE network, no filesystem) with known directed
 * rings, then asserts the engine finds exactly those rings — once, not once
 * per rotation — and that the cash balancing behaves as documented.
 */

import assert from "node:assert/strict";
import { detectChains } from "../lib/chains";
import type { CarPost } from "../lib/types";

interface PostSpec {
  id: string;
  brand: string;
  model: string;
  year: number;
  value: number;
  wantBrand: string;
  wantModel: string;
  cash: number;
  tolerance?: number;
}

function makePost(spec: PostSpec): CarPost {
  return {
    id: spec.id,
    userId: `user-${spec.id}`,
    title: `${spec.brand} ${spec.model} ${spec.year}`,
    description: "",
    car: {
      brand: spec.brand,
      model: spec.model,
      year: spec.year,
      estimatedValue: spec.value,
      localization: "São Paulo - SP",
    },
    desiredTrade: {
      vehicles: [
        {
          brand: spec.wantBrand,
          model: spec.wantModel,
          yearMin: 2018,
          yearMax: 2022,
          cashAdjustment: spec.cash,
          cashAdjustmentTolerance: spec.tolerance ?? 0,
        },
      ],
    },
    contactInfo: {},
    images: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    isActive: true,
  };
}

/** Three posts whose wants form A → B → C → A. */
function threeCycle(prefix: string, cash: number, tolerance = 0): CarPost[] {
  return [
    makePost({
      id: `${prefix}a`,
      brand: "Fiat",
      model: "Uno Mille 1.0",
      year: 2020,
      value: 40000,
      wantBrand: "Honda",
      wantModel: "Fit",
      cash,
      tolerance,
    }),
    makePost({
      id: `${prefix}b`,
      brand: "Honda",
      model: "Fit EX 1.5",
      year: 2020,
      value: 40000,
      wantBrand: "VW - VolksWagen",
      wantModel: "Gol",
      cash,
      tolerance,
    }),
    makePost({
      id: `${prefix}c`,
      brand: "VW - VolksWagen",
      model: "Gol 1.0",
      year: 2020,
      value: 40000,
      wantBrand: "Fiat",
      wantModel: "Uno",
      cash,
      tolerance,
    }),
  ];
}

/** Four/five-post rings built from the same helper, one edge per post. */
function ring(
  prefix: string,
  cars: { id: string; brand: string; model: string; wants: [string, string] }[]
): CarPost[] {
  return cars.map((car) =>
    makePost({
      id: `${prefix}${car.id}`,
      brand: car.brand,
      model: car.model,
      year: 2020,
      value: 40000,
      wantBrand: car.wants[0],
      wantModel: car.wants[1],
      cash: 0,
      tolerance: 0,
    })
  );
}

function label(chain: { postIds: string[] }): string {
  return `${chain.postIds.join(" → ")} → ${chain.postIds[0]}`;
}

let assertions = 0;
function check(condition: boolean, message: string): void {
  assert.ok(condition, message);
  assertions++;
}

function main(): void {
  console.log("=== CarMatch Corrente — chain engine check ===\n");

  // ── Scenario 1: clean 3-cycle ─────────────────────────────────
  const clean = detectChains(threeCycle("t1", 0));
  console.log(`Scenario 1 (clean 3-cycle): found ${clean.length}`);
  for (const chain of clean) {
    console.log(
      `  ${label(chain)} | size ${chain.size} | score ${chain.score} | feasible ${chain.feasible} | cash [${chain.cashDeltas.join(", ")}]`
    );
  }
  check(clean.length === 1, "a clean 3-cycle must be reported exactly once");
  check(
    clean[0].postIds.join(",") === "t1a,t1b,t1c",
    "the ring must start at the smallest id and follow A→B→C"
  );
  check(clean[0].size === 3, "the ring size must be 3");
  check(clean[0].feasible, "zero cash asks must balance");
  check(clean[0].totalCash === 0, "balanced cash must sum to zero");
  check(
    clean[0].cashDeltas.every((delta) => delta === 0),
    "zero-cash participants must have zero deltas"
  );
  check(
    clean[0].edges.length === 3 &&
      clean[0].edges[0].fromPostId === "t1a" &&
      clean[0].edges[0].toPostId === "t1b",
    "edges must follow the ring direction"
  );
  console.log("  PASS: exactly one feasible 3-cycle, no rotation duplicates\n");

  // ── Scenario 2: same ring, impossible cash ────────────────────
  const broken = detectChains(threeCycle("t2", 5000, 0));
  console.log(`Scenario 2 (unbalanced 3-cycle): found ${broken.length}`);
  for (const chain of broken) {
    console.log(
      `  ${label(chain)} | feasible ${chain.feasible} | total cash R$ ${chain.totalCash} | reasons: ${chain.reasons.join(" / ")}`
    );
  }
  check(broken.length === 1, "the cycle must still be detected");
  check(!broken[0].feasible, "three +R$ 5.000 asks cannot balance");
  check(
    broken[0].reasons.some((reason) => reason.includes("caixa")),
    "an unbalanced ring must explain the cash problem"
  );
  console.log("  PASS: cash arithmetic blocks the ring\n");

  // ── Scenario 3: 4-cycle ───────────────────────────────────────
  const four = detectChains(
    ring("t3", [
      { id: "a", brand: "Fiat", model: "Uno", wants: ["Honda", "Fit"] },
      { id: "b", brand: "Honda", model: "Fit", wants: ["Toyota", "Corolla"] },
      { id: "c", brand: "Toyota", model: "Corolla", wants: ["Ford", "Ka"] },
      { id: "d", brand: "Ford", model: "Ka", wants: ["Fiat", "Uno"] },
    ])
  );
  console.log(`Scenario 3 (4-cycle): found ${four.length}`);
  for (const chain of four) console.log(`  ${label(chain)} | size ${chain.size}`);
  check(four.length === 1, "exactly one 4-cycle must be found");
  check(four[0].size === 4, "the ring size must be 4");
  check(four[0].feasible, "the 4-cycle cash must balance");
  console.log("  PASS: length-4 ring detected\n");

  // ── Scenario 4: 5-cycle ───────────────────────────────────────
  const five = detectChains(
    ring("t4", [
      { id: "a", brand: "Fiat", model: "Uno", wants: ["Honda", "Fit"] },
      { id: "b", brand: "Honda", model: "Fit", wants: ["Toyota", "Corolla"] },
      { id: "c", brand: "Toyota", model: "Corolla", wants: ["Ford", "Ka"] },
      { id: "d", brand: "Ford", model: "Ka", wants: ["Jeep", "Compass"] },
      { id: "e", brand: "Jeep", model: "Compass", wants: ["Fiat", "Uno"] },
    ])
  );
  console.log(`Scenario 4 (5-cycle): found ${five.length}`);
  for (const chain of five) console.log(`  ${label(chain)} | size ${chain.size}`);
  check(five.length === 1, "exactly one 5-cycle must be found");
  check(five[0].size === 5, "the ring size must be 5");
  check(five[0].feasible, "the 5-cycle cash must balance");
  console.log("  PASS: length-5 ring detected\n");

  // ── Scenario 5: a post outside the ring must not appear ──────
  const withBystander = detectChains([
    ...threeCycle("t5", 0),
    makePost({
      id: "t5z",
      brand: "Renault",
      model: "Duster",
      year: 2020,
      value: 90000,
      wantBrand: "Jeep",
      wantModel: "Compass",
      cash: 0,
    }),
  ]);
  console.log(`Scenario 5 (bystander): found ${withBystander.length}`);
  for (const chain of withBystander) console.log(`  ${label(chain)} | size ${chain.size}`);
  check(withBystander.length === 1, "the bystander must not create a chain");
  check(
    withBystander.every((chain) => !chain.postIds.includes("t5z")),
    "the unconnected post must not be in any ring"
  );
  console.log("  PASS: unconnected posts are excluded\n");

  // ── Scenario 6: tolerances absorb a small cash residual ────────
  const tolerant = detectChains([
    makePost({ id: "t6a", brand: "Fiat", model: "Uno Mille 1.0", year: 2020, value: 40000, wantBrand: "Honda", wantModel: "Fit", cash: 5000, tolerance: 2000 }),
    makePost({ id: "t6b", brand: "Honda", model: "Fit EX 1.5", year: 2020, value: 40000, wantBrand: "VW - VolksWagen", wantModel: "Gol", cash: 5000, tolerance: 2000 }),
    makePost({ id: "t6c", brand: "VW - VolksWagen", model: "Gol 1.0", year: 2020, value: 40000, wantBrand: "Fiat", wantModel: "Uno", cash: -9000, tolerance: 2000 }),
  ]);
  console.log(`Scenario 6 (tolerance balancing): found ${tolerant.length}`);
  for (const chain of tolerant) {
    console.log(
      `  ${label(chain)} | feasible ${chain.feasible} | deltas [${chain.cashDeltas.join(", ")}] sum ${chain.totalCash} | bounds [${chain.cashLowerBound}, ${chain.cashUpperBound}]`
    );
  }
  check(tolerant.length === 1, "the tolerant ring must be found");
  check(tolerant[0].feasible, "tolerance must absorb the residual cash");
  check(Math.abs(tolerant[0].totalCash) < 0.01, "balanced deltas must sum to zero");
  check(
    tolerant[0].cashLowerBound <= 0 && tolerant[0].cashUpperBound >= 0,
    "the declared cash intervals must contain zero"
  );
  check(
    tolerant[0].cashDeltas.every(
      (delta, index) =>
        delta >= tolerant[0].edges[index].cashAdjustment - 2000 - 0.01 &&
        delta <= tolerant[0].edges[index].cashAdjustment + 2000 + 0.01
    ),
    "each delta must stay inside its own tolerance"
  );
  console.log("  PASS: cash balanced inside tolerances\n");

  // ── Scenario 7: self-want must not create a trivial cycle ────
  const selfWant = detectChains([
    makePost({ id: "t7a", brand: "Fiat", model: "Uno Mille 1.0", year: 2020, value: 40000, wantBrand: "Fiat", wantModel: "Uno", cash: 0 }),
  ]);
  console.log(`Scenario 7 (self-want): found ${selfWant.length}`);
  check(selfWant.length === 0, "a single post cannot form a chain");
  console.log("  PASS: no trivial/self cycles\n");

  // ── Scenario 8: search bounds are honoured ───────────────────
  const capped = detectChains(threeCycle("t8", 0), { maxLength: 3 });
  check(capped.length === 1, "maxLength=3 keeps the 3-cycle");
  const limited = detectChains(threeCycle("t9", 0), { maxChains: 1 });
  check(limited.length <= 1, "maxChains caps the returned chains");
  const starved = detectChains(threeCycle("t10", 0), { maxSteps: 1 });
  check(starved.length === 0, "maxSteps bounds the search");
  console.log("  PASS: search bounds honoured\n");

  // ── Scenario 9: canonical rotation + stable ids ──────────────
  const ordered = detectChains(threeCycle("t11", 0));
  check(ordered.length === 1, "one ring");
  check(new Set(ordered.map((c) => c.id)).size === ordered.length, "chain ids are unique");
  check(
    ordered[0].postIds[0] < ordered[0].postIds[1] &&
      ordered[0].postIds[1] < ordered[0].postIds[2],
    "ring starts at the smallest id (canonical rotation)"
  );
  check(
    ordered[0].id === `chain_${ordered[0].postIds.join("_")}`,
    "chain id derives from the canonical ring"
  );
  console.log("  PASS: canonical rotation + stable ids\n");

  console.log(`=== All checks passed (${assertions} assertions) ===`);
}

main();
