/**
 * Synthetic proof for the Roda engine.
 *
 * Builds listings whose directed "wants" graph is known by construction, then
 * asserts the engine finds exactly the feasible rings:
 *   · a 3-cycle, a 4-cycle and a 5-cycle with cash that sums to zero;
 *   · a 3-cycle whose cash is only balanced inside the owners' tolerances;
 * and rejects:
 *   · a 3-cycle whose asks are R$ 1.000 each (no one receives anything);
 *   · a 2-cycle (that is the pairwise matcher's job, not a ring);
 *   · a 6-cycle (above the documented maximum length);
 *   · a one-way chain and an isolated listing (no cycle at all).
 *
 * Run with: npx tsx scripts/check-roda.ts
 */

import { buildRodaInviteMessage, findRings, type RodaRing } from "../lib/roda";
import type { CarPost, DesiredVehicle } from "../lib/types";

let checks = 0;
let failures = 0;

function assert(condition: unknown, message: string): void {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  ✖ ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  checks++;
  if (Object.is(actual, expected)) return;
  failures++;
  console.error(`  ✖ ${message} — esperado ${String(expected)}, obtido ${String(actual)}`);
}

function want(
  brand: string,
  model: string,
  cashAdjustment: number,
  cashAdjustmentTolerance = 0
): DesiredVehicle {
  return {
    brand,
    model,
    cashAdjustment,
    cashAdjustmentTolerance,
  } as DesiredVehicle;
}

function post(
  id: string,
  brand: string,
  model: string,
  wants: DesiredVehicle[],
  localization = "São Paulo - SP"
): CarPost {
  return {
    id,
    userId: `user-${id}`,
    title: `${brand} ${model} — anúncio sintético`,
    description: "Fixture do teste sintético da roda.",
    car: {
      brand,
      model,
      year: 2020,
      estimatedValue: 80_000,
      localization,
    },
    desiredTrade: { vehicles: wants },
    contactInfo: { whatsapp: "+5511999999999" },
    images: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    isActive: true,
  };
}

/** Ring of three where A→B→C→A and the raw asks already sum to zero. */
function ring3(): CarPost[] {
  return [
    post("r3-a", "Alfa", "Alfa One", [want("Bravo", "Bravo Two", 1_000)]),
    post("r3-b", "Bravo", "Bravo Two", [want("Charlie", "Charlie Three", 2_000)]),
    post("r3-c", "Charlie", "Charlie Three", [want("Alfa", "Alfa One", -3_000)]),
  ];
}

function ring4(): CarPost[] {
  return [
    post("r4-a", "Delta", "Delta Four", [want("Echo", "Echo Four", 5_000)]),
    post("r4-b", "Echo", "Echo Four", [want("Foxtrot", "Foxtrot Four", 3_000)]),
    post("r4-c", "Foxtrot", "Foxtrot Four", [want("Golf", "Golf Four", -2_000)]),
    post("r4-d", "Golf", "Golf Four", [want("Delta", "Delta Four", -6_000)]),
  ];
}

function ring5(): CarPost[] {
  return [
    post("r5-a", "Hotel", "Hotel Five", [want("India", "India Five", 12_000)], "Curitiba - PR"),
    post("r5-b", "India", "India Five", [want("Juliet", "Juliet Five", -4_000)], "Curitiba - PR"),
    post("r5-c", "Juliet", "Juliet Five", [want("Kilo", "Kilo Five", 7_000)], "Ponta Grossa - PR"),
    post("r5-d", "Kilo", "Kilo Five", [want("Lima", "Lima Five", -9_000)], "Joinville - SC"),
    post("r5-e", "Lima", "Lima Five", [want("Hotel", "Hotel Five", -6_000)], "Porto Alegre - RS"),
  ];
}

/** Length 6: real cash, but outside the documented bound. */
function ring6(): CarPost[] {
  return [
    post("r6-a", "Mike", "Mike Six", [want("November", "November Six", 1_000)]),
    post("r6-b", "November", "November Six", [want("Oscar", "Oscar Six", 2_000)]),
    post("r6-c", "Oscar", "Oscar Six", [want("Papa", "Papa Six", -1_000)]),
    post("r6-d", "Papa", "Papa Six", [want("Quebec", "Quebec Six", -2_000)]),
    post("r6-e", "Quebec", "Quebec Six", [want("Romeo", "Romeo Six", 500)]),
    post("r6-f", "Romeo", "Romeo Six", [want("Mike", "Mike Six", -500)]),
  ];
}

/** Every owner would pay R$ 1.000: the group as a whole receives nothing. */
function infeasible3(): CarPost[] {
  return [
    post("bad-a", "Sierra", "Sierra Bad", [want("Tango", "Tango Bad", 1_000, 100)]),
    post("bad-b", "Tango", "Tango Bad", [want("Uniform", "Uniform Bad", 1_000, 100)]),
    post("bad-c", "Uniform", "Uniform Bad", [want("Sierra", "Sierra Bad", 1_000, 100)]),
  ];
}

/** A reciprocal pair: already handled pairwise, deliberately not a ring. */
function twoCycle(): CarPost[] {
  return [
    post("two-a", "Victor", "Victor Two", [want("Whiskey", "Whiskey Two", 0)]),
    post("two-b", "Whiskey", "Whiskey Two", [want("Victor", "Victor Two", 0)]),
  ];
}

/** Residual R$ 250, tolerance budget R$ 300 → feasible after balancing. */
function tolerance3(): CarPost[] {
  return [
    post("tol-a", "TolA", "TolA One", [want("TolB", "TolB One", 500, 100)]),
    post("tol-b", "TolB", "TolB One", [want("TolC", "TolC One", -200, 100)]),
    post("tol-c", "TolC", "TolC One", [want("TolA", "TolA One", -50, 100)]),
  ];
}

/** X→Y→Z, but Z never wants X. */
function chain(): CarPost[] {
  return [
    post("chain-x", "Xray", "Xray One", [want("Yankee", "Yankee One", 0)]),
    post("chain-y", "Yankee", "Yankee One", [want("Zulu", "Zulu One", 0)]),
    post("chain-z", "Zulu", "Zulu One", []),
  ];
}

function isolated(): CarPost[] {
  return [post("solo", "Solo", "Solo One", [])];
}

function signature(ring: RodaRing): string {
  return ring.participants
    .map((participant) => participant.car.brand)
    .sort()
    .join("+");
}

function main(): void {
  const posts = [
    ...ring3(),
    ...ring4(),
    ...ring5(),
    ...ring6(),
    ...infeasible3(),
    ...twoCycle(),
    ...tolerance3(),
    ...chain(),
    ...isolated(),
  ];

  const result = findRings(posts);
  const rings = result.rings;

  console.log("Roda — verificação sintética");
  console.log(
    `posts=${result.stats.posts} edges=${result.stats.edges} rings=${rings.length} steps=${result.stats.steps} truncated=${result.stats.truncated}`
  );

  // Edge count is fixed by construction; an extra edge would mean the gate is
  // accepting something it should not.
  assertEqual(result.stats.edges, 28, "grafo deve ter exatamente 28 arestas");
  assertEqual(rings.length, 4, "deve encontrar exatamente 4 rodas viáveis");
  assertEqual(result.stats.truncated, false, "busca não deve ser truncada");
  assert(result.stats.steps > 0, "a busca deve visitar arestas");

  const expected = [
    "Alfa+Bravo+Charlie",
    "Delta+Echo+Foxtrot+Golf",
    "Hotel+India+Juliet+Kilo+Lima",
    "TolA+TolB+TolC",
  ].sort();

  const found = rings.map(signature).sort();
  assertEqual(JSON.stringify(found), JSON.stringify(expected), "conjunto exato de rodas");

  // Rotation dedupe: the 3-cycle must appear once, not as its three rotations.
  const triples = rings.filter((ring) => ring.size === 3);
  assertEqual(triples.length, 2, "duas rodas de 3 (uma exata, uma por tolerância)");

  // Forbidden participants: the 6-cycle, infeasible ring, 2-cycle and chain.
  const allParticipants = new Set(
    rings.flatMap((ring) => ring.participants.map((p) => p.car.brand))
  );
  for (const brand of ["Mike", "Sierra", "Victor", "Xray", "Solo"]) {
    assert(!allParticipants.has(brand), `${brand} não deve aparecer em nenhuma roda`);
  }

  // Every reported ring must close the cycle in order and balance to zero.
  for (const ring of rings) {
    assertEqual(ring.cashResidual, 0, `soma ajustada da roda ${signature(ring)}`);
    const last = ring.participants[ring.participants.length - 1];
    assertEqual(
      last.paysToPostId,
      ring.participants[0].postId,
      `a última pessoa da roda ${signature(ring)} entrega para a primeira`
    );
    for (let i = 0; i < ring.participants.length; i++) {
      const current = ring.participants[i];
      const next = ring.participants[(i + 1) % ring.participants.length];
      assertEqual(
        current.paysToPostId,
        next.postId,
        `ordem do ciclo em ${signature(ring)}`
      );
    }
  }

  const toleranceRing = rings.find((ring) => ring.size === 3 && signature(ring) === "TolA+TolB+TolC");
  assert(Boolean(toleranceRing), "roda por tolerância deve existir");
  if (toleranceRing) {
    assertEqual(toleranceRing.rawCashResidual, 250, "resíduo bruto da roda por tolerância");
    assertEqual(toleranceRing.cashToleranceBudget, 300, "orçamento de tolerância");
    for (const participant of toleranceRing.participants) {
      const correction = participant.cashDelta - participant.rawCashDelta;
      assert(
        Math.abs(correction) <= participant.cashTolerance + 1,
        `correção de ${participant.car.brand} deve caber na tolerância`
      );
    }
  }

  const sizes = rings.map((ring) => ring.size).sort();
  assertEqual(JSON.stringify(sizes), JSON.stringify([3, 3, 4, 5]), "tamanhos 3,3,4,5");
  assertEqual(result.stats.bySize["3"], 2, "bySize[3]");
  assertEqual(result.stats.bySize["4"], 1, "bySize[4]");
  assertEqual(result.stats.bySize["5"], 1, "bySize[5]");

  // Message: names every participant and car, and is honest about group links.
  const three = rings.find((ring) => signature(ring) === "Alfa+Bravo+Charlie")!;
  const decorated: RodaRing = {
    ...three,
    participants: three.participants.map((participant, i) => ({
      ...participant,
      ownerName: ["Ana Beatriz", "Bruno Lima", "Carla Souza"][i],
    })),
  };
  const message = buildRodaInviteMessage(decorated, "https://carmatch.test");

  for (const name of ["Ana", "Bruno", "Carla"]) {
    assert(message.includes(name), `mensagem deve citar ${name}`);
  }
  for (const car of ["Alfa One", "Bravo Two", "Charlie Three"]) {
    assert(message.includes(car), `mensagem deve citar ${car}`);
  }
  assert(
    message.includes("O WhatsApp não deixa criar um grupo por link"),
    "mensagem deve ser honesta sobre o convite de grupo"
  );
  assert(
    message.includes("https://carmatch.test/roda"),
    "mensagem deve apontar para a página da roda"
  );

  // Human-readable summary.
  for (const ring of rings) {
    const order = ring.participants.map((p) => p.car.brand).join(" → ");
    const cash = ring.participants
      .map((p) => `${p.car.brand}:${p.cashDelta >= 0 ? "+" : ""}${p.cashDelta}`)
      .join(" ");
    console.log(
      `  ✔ roda de ${ring.size}: ${order} → (fecha) | score ${ring.score} | ${cash}`
    );
  }

  console.log(`\n${checks} verificações, ${failures} falha(s)`);
  if (failures > 0) process.exit(1);
  console.log("✅ PASS — a roda encontra exatamente os ciclos esperados e rejeita o resto.");
}

main();
