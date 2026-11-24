/**
 * Regression proof for the `lib/compat.ts` extraction.
 *
 * The vehicle gate moved out of `lib/matching.ts` so the pure ring engine could
 * reuse it. That refactor is only safe if pairwise behaviour is byte-for-byte
 * identical, so this script:
 *
 *   1. compares the new gate against a frozen copy of the pre-refactor code
 *      over every real post × every want in `data/posts.json`, plus synthetic
 *      edge cases (vehicleType, brand casing, version, transmission spelling,
 *      year bounds, empty want);
 *   2. asserts `lib/matching.ts` re-exports the very same function object;
 *   3. re-runs `runMatching()` with the JSON store's writes intercepted in
 *      memory and compares the resulting pairs/scores/cash with the matches
 *      already stored — an end-to-end check that scores did not drift with the
 *      move. The real `data/` files are never touched.
 *
 * Run with: npx tsx scripts/check-compat.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  hasAutomaticTransmission,
  hasManualTransmission,
  vehicleMatchesCar as compatMatchesCar,
} from "../lib/compat";
import type { CarPost, DesiredVehicle, Match } from "../lib/types";

/* ─── Frozen pre-refactor implementation ───────────────────────── */

function legacyInferVehicleType(fipeName: string): string | null {
  const lower = fipeName.toLowerCase();
  if (lower.includes("hatchback") || lower.includes(" hatch")) return "Hatch";
  if (lower.includes("sedan") || lower.includes(" sd.") || lower.includes(" sda")) return "Sedan";
  if (lower.includes("suv")) return "SUV";
  if (lower.includes("pick-up") || lower.includes("pickup") || lower.includes("caminhonete")) return "Caminhonete";
  return null;
}

function legacyMatchesCar(car: CarPost["car"], want: DesiredVehicle): boolean {
  if (want.vehicleType) {
    const inferred = legacyInferVehicleType(car.model);
    if (inferred && inferred !== want.vehicleType) return false;
  } else {
    if (want.brand && car.brand.toLowerCase() !== want.brand.toLowerCase()) {
      return false;
    }

    const carModelLower = car.model.toLowerCase();

    if (want.model) {
      const wantModel = want.model.toLowerCase().trim();
      if (!carModelLower.startsWith(wantModel)) {
        if (!carModelLower.includes(wantModel)) {
          return false;
        }
      }
    }

    if (want.version) {
      if (!carModelLower.includes(want.version.toLowerCase().trim())) {
        return false;
      }
    }

    if (want.transmission) {
      const hasAuto = legacyHasAuto(carModelLower);
      const hasManual = legacyHasManual(carModelLower);
      if (want.transmission === "Automático" && !hasAuto) return false;
      if (want.transmission === "Manual" && !hasManual) return false;
    }
  }

  if (want.yearMin && car.year < want.yearMin) return false;
  if (want.yearMax && car.year > want.yearMax) return false;
  return true;
}

function legacyHasAuto(modelName: string): boolean {
  return /\baut\.?(?=\s|$)/i.test(modelName);
}

function legacyHasManual(modelName: string): boolean {
  return /\bmec\.?(?=\s|$)/i.test(modelName);
}

/* ─── Harness ──────────────────────────────────────────────────── */

let checks = 0;
let failures = 0;

function assert(condition: unknown, message: string): void {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  ✖ ${message}`);
}

function parse(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", file), "utf-8"));
}

interface Case {
  label: string;
  car: CarPost["car"];
  want: DesiredVehicle;
}

function syntheticCases(): Case[] {
  const car = (brand: string, model: string, year = 2020): CarPost["car"] => ({
    brand,
    model,
    year,
    estimatedValue: 60_000,
  });

  const want = (partial: Partial<DesiredVehicle>): DesiredVehicle => ({
    brand: "",
    model: "",
    cashAdjustment: 0,
    cashAdjustmentTolerance: 0,
    ...partial,
  });

  const cases: Case[] = [
    { label: "vehicleType SUV ok", car: car("Jeep", "Compass SUV"), want: want({ vehicleType: "SUV" }) },
    { label: "vehicleType SUV vs hatch", car: car("Fiat", "Argo Hatch"), want: want({ vehicleType: "SUV" }) },
    { label: "vehicleType unknown stays permissive", car: car("Fiat", "500"), want: want({ vehicleType: "SUV" }) },
    { label: "vehicleType sedan", car: car("Toyota", "Corolla Sedan"), want: want({ vehicleType: "Sedan" }) },
    { label: "vehicleType pickup", car: car("Toyota", "Hilux Pick-up"), want: want({ vehicleType: "Caminhonete" }) },
    { label: "brand case-insensitive", car: car("Honda", "Fit"), want: want({ brand: "honda", model: "fit" }) },
    { label: "brand mismatch", car: car("Honda", "Fit"), want: want({ brand: "Toyota", model: "Fit" }) },
    { label: "model startsWith", car: car("Honda", "Fit CX 1.4"), want: want({ brand: "Honda", model: "Fit" }) },
    { label: "model inside", car: car("Honda", "Novo Fit CX"), want: want({ brand: "Honda", model: "Fit" }) },
    { label: "model absent", car: car("Honda", "City"), want: want({ brand: "Honda", model: "Fit" }) },
    { label: "version substring", car: car("Honda", "Fit CX 1.4 Flex"), want: want({ brand: "Honda", model: "Fit", version: "CX 1.4" }) },
    { label: "version absent", car: car("Honda", "Fit EX 1.5"), want: want({ brand: "Honda", model: "Fit", version: "CX 1.4" }) },
    { label: "auto token Aut.", car: car("Hyundai", "HB20 Vision 1.6 Aut."), want: want({ transmission: "Automático" }) },
    { label: "auto token Aut (no dot)", car: car("Hyundai", "HB20 Vision 1.6 Aut"), want: want({ transmission: "Automático" }) },
    { label: "auto missing", car: car("Hyundai", "HB20 Vision 1.6 Mec."), want: want({ transmission: "Automático" }) },
    { label: "manual token Mec.", car: car("VW", "Polo Track 1.0 Mec."), want: want({ transmission: "Manual" }) },
    { label: "manual token Mec (no dot)", car: car("VW", "Polo Track 1.0 Mec"), want: want({ transmission: "Manual" }) },
    { label: "manual missing", car: car("VW", "Polo Track 1.0 Aut."), want: want({ transmission: "Manual" }) },
    { label: "yearMin ok", car: car("Fiat", "Argo", 2021), want: want({ brand: "Fiat", model: "Argo", yearMin: 2019 }) },
    { label: "yearMin fails", car: car("Fiat", "Argo", 2018), want: want({ brand: "Fiat", model: "Argo", yearMin: 2019 }) },
    { label: "yearMax fails", car: car("Fiat", "Argo", 2024), want: want({ brand: "Fiat", model: "Argo", yearMax: 2023 }) },
    { label: "empty want matches all", car: car("Any", "Car", 1999), want: want({}) },
  ];

  return cases;
}

/* ─── Run ──────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const posts = parse("posts.json") as CarPost[];
  const storedMatches = parse("matches.json") as Match[];

  console.log("Compat — verificação da extração pura");
  console.log(`posts=${posts.length} matches armazenados=${storedMatches.length}`);

  assert(posts.length > 0, "data/posts.json deve ter anúncios");
  assert(storedMatches.length > 0, "data/matches.json deve ter matches para comparar");

  /* 1 · Gate matrix: every real post against every want. */
  let matrixCases = 0;
  for (const source of posts) {
    for (const target of posts) {
      for (const w of source.desiredTrade?.vehicles ?? []) {
        matrixCases++;
        const expected = legacyMatchesCar(target.car, w);
        const actual = compatMatchesCar(target.car, w);
        if (expected !== actual) {
          failures++;
          console.error(
            `  ✖ matriz: ${source.id.slice(0, 8)} quer ${w.brand} ${w.model} × ${target.id.slice(0, 8)} (${target.car.brand} ${target.car.model}) — legado ${expected}, novo ${actual}`
          );
        }
      }
    }
  }
  checks++;
  console.log(`  matriz real: ${matrixCases} comparações post × desejo`);

  /* 2 · Synthetic edge cases. */
  for (const testCase of syntheticCases()) {
    const expected = legacyMatchesCar(testCase.car, testCase.want);
    const actual = compatMatchesCar(testCase.car, testCase.want);
    assert(
      expected === actual,
      `${testCase.label}: legado ${expected}, novo ${actual}`
    );
  }

  /* 3 · Transmission helpers moved unchanged. */
  const transmissionSamples = [
    "Fit EX 1.5 Aut.",
    "HB20 Vision 1.6 Aut",
    "Polo Track 1.0 Mec.",
    "Polo Track 1.0 Mec",
    "Corolla XEi CVT",
    "AUTOMÁTICO",
  ];
  for (const sample of transmissionSamples) {
    assert(
      hasAutomaticTransmission(sample) === legacyHasAuto(sample),
      `hasAutomaticTransmission(${sample})`
    );
    assert(
      hasManualTransmission(sample) === legacyHasManual(sample),
      `hasManualTransmission(${sample})`
    );
  }

  /* 4 · End-to-end: runMatching with writes captured, not written. */
  const before = normalizeMatches(storedMatches);
  let captured: string | null = null;

  if (process.env.CARMATCH_DATA_DIR) {
    throw new Error(
      "CARMATCH_DATA_DIR está definido; este teste precisa ler data/ real e interceptar as escritas."
    );
  }

  const realWrite = fs.writeFileSync;
  const realRename = fs.renameSync;

  try {
    // `lib/db.ts` imports the same `node:fs` object. Intercepting here proves the
    // end-to-end matching output without creating or mutating any file.
    Reflect.set(fs, "writeFileSync", (file: unknown, data: unknown) => {
      const name = String(file);
      if (name.includes("matches.json.") && name.endsWith(".tmp")) {
        captured = String(data);
        return;
      }
      throw new Error(`escrita inesperada em ${name}`);
    });
    Reflect.set(fs, "renameSync", (from: unknown) => {
      const name = String(from);
      if (!(name.includes("matches.json.") && name.endsWith(".tmp"))) {
        throw new Error(`rename inesperado: ${name}`);
      }
    });

    // Dynamic so `lib/db.ts` resolves DATA_DIR inside this process.
    const matching = await import("../lib/matching");

    assert(
      matching.vehicleMatchesCar === compatMatchesCar,
      "lib/matching reexporta a mesma função de lib/compat"
    );

    matching.runMatching();

    assert(captured !== null, "runMatching deve produzir um novo matches.json");
    const after = captured === null ? [] : (JSON.parse(captured) as Match[]);
    const afterNormalized = normalizeMatches(after);

    assert(
      JSON.stringify(afterNormalized) === JSON.stringify(before),
      `runMatching reproduz os matches armazenados — antes ${JSON.stringify(before)}, depois ${JSON.stringify(afterNormalized)}`
    );
    console.log(`  runMatching: ${after.length} matches, idênticos aos armazenados`);
  } finally {
    Reflect.set(fs, "writeFileSync", realWrite);
    Reflect.set(fs, "renameSync", realRename);
  }

  console.log(`\n${checks} verificações, ${failures} falha(s)`);
  if (failures > 0) process.exit(1);
  console.log("✅ PASS — o gate e o matching pareado continuam idênticos após a extração.");
}

function normalizeMatches(matches: Match[]): Array<{
  a: string;
  b: string;
  score: number;
  cashFromA: number;
}> {
  return matches
    .map((match) => {
      const a = match.postAId < match.postBId ? match.postAId : match.postBId;
      const b = match.postAId < match.postBId ? match.postBId : match.postAId;
      return {
        a,
        b,
        score: match.score,
        // Normalise the cash direction onto the sorted pair.
        cashFromA:
          match.postAId === a ? match.suggestedCashFromA : -match.suggestedCashFromA,
      };
    })
    .sort((x, y) => (x.a === y.a ? x.b.localeCompare(y.b) : x.a.localeCompare(y.a)));
}

main().catch((error) => {
  console.error("❌ Falha inesperada:", error);
  process.exit(1);
});
