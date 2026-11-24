/**
 * Preço self-check (read-only).
 *
 * Runs the pure valuation model and asserts the two invariants the UI depends
 * on: the breakdown sums exactly to `fairValue`, and the score label agrees
 * with the band. Prints the same JSON shape the API returns so the numbers can
 * be inspected without a server.
 *
 * Run with:  node_modules/.bin/jiti scripts/preco-check.ts
 */
import {
  BAND_PCT,
  EXTRAS_TOTAL_CAP,
  MILEAGE_PENALTY_CAP,
  PRECO_DISCLAIMER,
  recommendedSplit,
  valuate,
} from "../lib/preco";
import { buildMatchMessageWithPrice, pricedMatchContact } from "../lib/preco-message";

const REFERENCE_YEAR = 2026;
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

function sumBreakdown(v: ReturnType<typeof valuate>) {
  return v.breakdown.reduce((sum, line) => sum + line.impactBRL, 0);
}

console.log("== case 1: Honda Fit 2014, 108.500 km, R$ 53.211 ==");
const fit = valuate({
  brand: "Honda",
  model: "Fit EX 1.5",
  year: 2014,
  estimatedValue: 53211,
  mileage: 108500,
  referenceYear: REFERENCE_YEAR,
});
console.log(JSON.stringify(fit, null, 2));
check("breakdown sums to fairValue", sumBreakdown(fit) === fit.fairValue);
check("fairValue > 0", fit.fairValue > 0);
check("low < fairValue < high", fit.low < fit.fairValue && fit.fairValue < fit.high);
check("body inferred Hatch (Fit)", fit.bodyType === "Hatch", fit.bodyType);

console.log("\n== case 2: extras cap ==");
const loaded = valuate({
  model: "Corolla XEi 2.0",
  year: 2019,
  estimatedValue: 96000,
  mileage: 45000,
  referenceYear: REFERENCE_YEAR,
  extras: {
    singleOwner: true,
    fullServiceHistory: true,
    recentlyServiced: true,
    newTyres: true,
    neverCrashed: true,
  },
});
const extrasTotal = loaded.breakdown
  .filter((line) => line.key.startsWith("extra"))
  .reduce((sum, line) => sum + line.impactBRL, 0);
const capImpact = Math.round(loaded.ask * EXTRAS_TOTAL_CAP);
check("extras block respects the +6% cap", extrasTotal <= capImpact, `${extrasTotal} > ${capImpact}`);
check("extras block lands on the cap", Math.abs(extrasTotal - capImpact) <= 1, `${extrasTotal} vs ${capImpact}`);
check("breakdown sums to fairValue (extras)", sumBreakdown(loaded) === loaded.fairValue);

console.log("\n== case 3: mileage penalty cap ==");
const taxi = valuate({
  model: "Gol 1.0",
  year: 2020,
  estimatedValue: 40000,
  mileage: 600000,
  referenceYear: REFERENCE_YEAR,
});
const mileageLine = taxi.breakdown.find((line) => line.key === "mileage");
const penalty = mileageLine ? -mileageLine.impactBRL / taxi.ask : 0;
check(
  "mileage penalty capped at 25%",
  penalty <= MILEAGE_PENALTY_CAP + 1e-9,
  String(penalty)
);

console.log("\n== case 4: score label agreement ==");
for (const [name, v] of [
  ["fit", fit],
  ["loaded", loaded],
  ["taxi", taxi],
] as const) {
  const expected =
    v.ask < v.low ? "abaixo do mercado" : v.ask > v.high ? "acima do mercado" : "justo";
  check(`score agrees with band (${name})`, v.score === expected, `${v.score} vs ${expected}`);
  const bandWidth = v.high - v.fairValue;
  check(
    `band is ±${Math.round(BAND_PCT * 100)}% (${name})`,
    Math.abs(bandWidth - Math.round(v.fairValue * BAND_PCT)) <= 1,
    String(bandWidth)
  );
}

console.log("\n== case 5: recommendedSplit sign convention ==");
const corolla = {
  brand: "Toyota",
  model: "Corolla XEi 2.0",
  year: 2019,
  estimatedValue: 96000,
  mileage: 45000,
};
const split = recommendedSplit(
  { car: { brand: "Honda", model: "Fit EX 1.5", year: 2014, estimatedValue: 53211, mileage: 108500 } },
  { car: corolla },
  { referenceYear: REFERENCE_YEAR }
);
check(
  "fromAtoB = valueB - valueA",
  split.fromAtoB === split.valuationB.fairValue - split.valuationA.fairValue,
  String(split.fromAtoB)
);
check("low <= fromAtoB <= high", split.low <= split.fromAtoB && split.fromAtoB <= split.high);
console.log(`  ${split.reason}`);

console.log("\n== case 6: WhatsApp message carries the number ==");
const message = buildMatchMessageWithPrice({
  recipientName: "Fernanda",
  myCar: { brand: "Honda", model: "Fit EX 1.5", year: 2014, estimatedValue: 53211, mileage: 108500 },
  theirCar: corolla,
  myPostUrl: "http://localhost:3604/posts/abc",
  cashFromMe: 43000,
  score: 78,
  referenceYear: REFERENCE_YEAR,
});
console.log(message);
check("message states the settlement", message.includes("o justo é"));
check(
  "message amount matches the model",
  message.includes(split.fromAtoB > 0 ? "eu pagar" : "você me pagar") ||
    split.fromAtoB === 0,
  String(split.fromAtoB)
);

console.log("\n== case 7: pricedMatchContact (shared by API + MatchCard) ==");
const postA = {
  id: "post-a",
  userId: "user-a",
  title: "Honda Fit EX 1.5 2014",
  description: "",
  car: {
    brand: "Honda",
    model: "Fit EX 1.5",
    year: 2014,
    estimatedValue: 53211,
    mileage: 108500,
  },
  desiredTrade: { vehicles: [] },
  contactInfo: { whatsapp: "+5511919765824" },
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  isActive: true,
};
const postB = {
  ...postA,
  id: "post-b",
  userId: "user-b",
  title: "Toyota Corolla XEi 2.0 2019",
  car: { ...corolla },
};
const priced = pricedMatchContact({
  match: {
    id: "m1",
    postAId: "post-a",
    postBId: "post-b",
    score: 78,
    suggestedCashFromA: 48000,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  myPost: postA,
  targetPost: postB,
  origin: "http://localhost:3604",
  referenceYear: REFERENCE_YEAR,
});
check("href is a wa.me link", Boolean(priced.href?.startsWith("https://wa.me/5511919765824")));
check("href carries the settlement text", Boolean(priced.href?.includes(encodeURIComponent("o justo é"))));
check("message restates the sender's cash sentence", priced.message.includes("Eu pago R$ 48.000"));
console.log(`  ${priced.href?.slice(0, 120)}…`);

console.log("\n== API response shape (what GET /api/preco/[postId] returns) ==");
console.log(
  JSON.stringify(
    {
      postId: "<post id>",
      car: {
        brand: "Honda",
        model: "Fit EX 1.5",
        year: 2014,
        estimatedValue: 53211,
        mileage: 108500,
      },
      valuation: fit,
      against: null,
      disclaimer: PRECO_DISCLAIMER,
    },
    null,
    2
  )
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
