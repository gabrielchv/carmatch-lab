#!/usr/bin/env node
/**
 * Seed realistic car posts into a running CarMatch instance.
 *
 *   node tools/seed-posts.mjs --port 3200 --reset
 *   node tools/seed-posts.mjs --all --reset
 *
 * Everything it writes is real data from the FIPE API (brand, model, year,
 * price) and real photographs from Wikimedia Commons. "Semi-real" here means:
 * a plausible Brazilian used-car market, with owners who want something
 * specific in exchange.
 *
 * The generator deliberately builds RINGS: post A wants B's car, B wants C's,
 * C wants A's. Because each owner's cash adjustment is set to the price
 * difference with its successor, the deltas around a ring sum to exactly zero —
 * so every version lights up: pairwise matches in v1/v2/v4, and complete
 * swap chains in v3.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listBrands,
  listModels,
  listYears,
  getPrice,
  parseBRL,
  yearFromCode,
  isDiesel,
} from "./fipe.mjs";
import { fetchCarPhotos } from "./photos.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ─── CLI ──────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const opts = {
    port: 3200,
    url: undefined,
    all: false,
    allW: false,
    reset: false,
    images: 2,
    users: 8,
    rings: [3, 4, 5],
    pairs: 2,
    deals: 0,
    seed: 42,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--all-w") opts.allW = true;
    else if (a === "--reset") opts.reset = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--port") opts.port = Number(argv[++i]);
    else if (a === "--url") opts.url = argv[++i].replace(/\/$/, "");
    else if (a === "--images") opts.images = Number(argv[++i]);
    else if (a === "--users") opts.users = Number(argv[++i]);
    else if (a === "--deals") opts.deals = Number(argv[++i]);
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--rings") opts.rings = argv[++i].split(",").map(Number).filter(Boolean);
    else if (a === "--pairs") opts.pairs = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Uso: node tools/seed-posts.mjs [opções]

  --port <n>       porta do app local (padrão 3200)
  --url <url>      alvo remoto, ex.: https://carmatch-xxx.run.app
  --all            semeia v1..v5 (portas 3200, 3502-3505)
  --all-w          semeia w1..w5 (portas 3601-3605)
  --reset          apaga os dados antes (via DEBUG_TOKEN)
  --images <n>     fotos por anúncio (padrão 2, 0 desliga)
  --users <n>      número de pessoas (padrão 8)
  --rings a,b,c    tamanhos das correntes (padrão 3,4,5)
  --pairs <n>      pares recíprocos para gerar matches simples (padrão 2)
  --deals <n>      abre N negociações na v5
  --seed <n>       semente do sorteio (padrão 42)
  --dry-run        mostra o plano sem escrever nada`);
      process.exit(0);
    }
  }
  return opts;
}

const DEBUG_TOKEN = process.env.DEBUG_TOKEN || "local-debug-token";

/* ─── Deterministic randomness (so runs are reproducible) ──────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

/* ─── People ───────────────────────────────────────────────────── */

/** Stable fake WhatsApp per person: +55 11 9XXXX-XXXX. */
function phoneFor(person) {
  const digits = [...person.email].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const tail = String(digits * 7919).padStart(8, "0").slice(-8);
  return `+55119${tail}`;
}

const PEOPLE = [
  { name: "Ana Beatriz", city: "São Paulo - SP", email: "ana.beatriz@carmatch.test" },
  { name: "Carlos Henrique", city: "Campinas - SP", email: "carlos.henrique@carmatch.test" },
  { name: "Juliana Prado", city: "Belo Horizonte - MG", email: "juliana.prado@carmatch.test" },
  { name: "Roberto Lima", city: "Curitiba - PR", email: "roberto.lima@carmatch.test" },
  { name: "Fernanda Alves", city: "Porto Alegre - RS", email: "fernanda.alves@carmatch.test" },
  { name: "Marcos Vinícius", city: "Salvador - BA", email: "marcos.vinicius@carmatch.test" },
  { name: "Patrícia Nunes", city: "Recife - PE", email: "patricia.nunes@carmatch.test" },
  { name: "Thiago Moreira", city: "Goiânia - GO", email: "thiago.moreira@carmatch.test" },
  { name: "Larissa Campos", city: "Florianópolis - SC", email: "larissa.campos@carmatch.test" },
  { name: "Diego Ferreira", city: "Rio de Janeiro - RJ", email: "diego.ferreira@carmatch.test" },
];

const COLORS = ["Branco", "Preto", "Prata", "Cinza", "Azul", "Vermelho", "Verde", "Marrom"];

/*
 * Cities are assigned per GROUP (ring or pair), not per person: two people
 * swapping cars are almost always within driving distance. Spreading a ring
 * across Brazil would make the distance gate reject every edge, which is a
 * property of the data, not of the product.
 */
const CITY_GROUPS = [
  ["São Paulo - SP", "Campinas - SP", "Santos - SP", "São José dos Campos - SP"],
  ["Belo Horizonte - MG", "Uberlândia - MG", "Juiz de Fora - MG"],
  ["Curitiba - PR", "Porto Alegre - RS", "Florianópolis - SC", "Londrina - PR"],
  ["Salvador - BA", "Recife - PE", "Fortaleza - CE"],
  ["Goiânia - GO", "Brasília - DF", "Campo Grande - MS"],
  ["Rio de Janeiro - RJ", "Niterói - RJ", "Vitória - ES"],
];

/* ─── Car catalogue ────────────────────────────────────────────── */
/*
 * Chosen for how the Brazilian used market actually looks, and so that
 * consecutive entries are plausible swap targets for one another.
 * `brand` is a match key into the FIPE brand list; `model` is a prefix of the
 * FIPE model name. The FIPE API supplies everything else.
 */
const CATALOGUE = [
  { brand: "Honda", model: "Fit", prefer: ["EX", "LX", "DX"] },
  { brand: "Toyota", model: "Corolla", prefer: ["XEi", "GLi", "XLi", "Altis"] },
  { brand: "Fiat", model: "Argo", prefer: ["Drive", "Precision"] },
  { brand: "VW - VolksWagen", model: "Polo", prefer: ["Highline", "Comfortline", "Track"] },
  { brand: "GM - Chevrolet", model: "Onix", prefer: ["LT", "LTZ", "Joy"] },
  { brand: "Hyundai", model: "HB20", prefer: ["Comfort", "Vision", "Premium"] },
  { brand: "Ford", model: "Ka", prefer: ["SEL", "SE", "FreeStyle"] },
  { brand: "Renault", model: "Sandero", prefer: ["Stepway", "Zen", "Intense"] },
  { brand: "Nissan", model: "Kicks", prefer: ["SV", "SL", "Advance"] },
  { brand: "Jeep", model: "Renegade", prefer: ["Longitude", "Sport", "Limited"] },
  { brand: "Honda", model: "HR-V", prefer: ["EX", "LX", "EXL"] },
  { brand: "Toyota", model: "Yaris", prefer: ["XL", "XLS", "XLE"] },
  { brand: "Fiat", model: "Cronos", prefer: ["Drive", "Precision"] },
  { brand: "VW - VolksWagen", model: "T-Cross", prefer: ["Highline", "Comfortline"] },
  { brand: "GM - Chevrolet", model: "Tracker", prefer: ["LT", "LTZ", "Premier"] },
  { brand: "Hyundai", model: "Creta", prefer: ["Comfort", "Pulse", "Limited"] },
];

/* ─── HTTP helpers ─────────────────────────────────────────────── */

class Session {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  absorb(res) {
    const list = res.headers.getSetCookie?.() ?? [];
    for (const raw of list) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async json(pathname, init = {}) {
    const res = await fetch(`${this.base}${pathname}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(this.cookies.size ? { cookie: this.cookieHeader() } : {}),
        ...(init.headers ?? {}),
      },
    });
    this.absorb(res);
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: res.status, ok: res.ok, body, headers: res.headers };
  }

  async form(pathname, form) {
    const res = await fetch(`${this.base}${pathname}`, {
      method: "POST",
      body: form,
      headers: this.cookies.size ? { cookie: this.cookieHeader() } : {},
    });
    this.absorb(res);
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: res.status, ok: res.ok, body, headers: res.headers };
  }
}

/* ─── FIPE resolution ──────────────────────────────────────────── */

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

async function resolveCar(entry, brands) {
  const brandKey = norm(entry.brand);
  const brand = brands.find((b) => norm(b.nome) === brandKey || norm(b.nome).includes(brandKey));
  if (!brand) return null;

  const models = await listModels(brand.codigo);
  const modelKey = norm(entry.model);
  // "HR-V" arrives as "HR-V" or "HRV" depending on the brand; compare loosely.
  const candidates = models.filter((m) => {
    const n = norm(m.nome);
    return n.startsWith(modelKey) || n.startsWith(modelKey.replace(/-/g, "")) || n.includes(modelKey);
  });
  if (!candidates.length) return null;

  // Prefer a version whose name mentions a real trim, then the shortest name
  // (the general model rather than an obscure special edition).
  const ranked = candidates.slice().sort((a, b) => {
    const score = (m) => {
      const n = norm(m.nome);
      const hit = entry.prefer.some((p) => n.includes(norm(p))) ? -10 : 0;
      return hit + m.nome.length / 100;
    };
    return score(a) - score(b);
  });

  // A trim can be long-lived or a one-off: "Corolla GLi 1.6" only has pre-2010
  // years, while another Corolla trim covers 2020-2025. Walk the ranking until
  // a candidate actually has recent years, instead of accepting the first.
  for (const preferred of ranked.slice(0, 8)) {
    const years = await listYears(brand.codigo, preferred.codigo);
    const usable = years
      .filter((y) => !isDiesel(y.codigo))
      .map((y) => ({ ...y, year: yearFromCode(y.codigo) }))
      .filter((y) => y.year >= 2010 && y.year <= new Date().getFullYear())
      .sort((a, b) => b.year - a.year);

    if (!usable.length) continue;

    // Keep the pool recent but varied.
    const yearEntry = usable[Math.min(usable.length - 1, between(0, Math.min(6, usable.length - 1)))];
    const price = await getPrice(brand.codigo, preferred.codigo, yearEntry.codigo);
    const value = parseBRL(price.Valor);
    if (!value) continue;

    const modelName = price.Modelo || preferred.nome;
    const transmission = /aut\.?$/i.test(modelName)
      ? "Automático"
      : /mec\.?$/i.test(modelName)
        ? "Manual"
        : undefined;

    return {
      id: `${brand.codigo}-${preferred.codigo}-${yearEntry.codigo}`,
      brand: price.Marca || brand.nome,
      model: modelName,
      modelGeneral: modelName.split(" ")[0],
      year: price.AnoModelo || yearEntry.year,
      value,
      fuel: price.Combustivel || "Gasolina",
      fipeBrandId: brand.codigo,
      fipeModelCode: String(preferred.codigo),
      fipeYearCode: yearEntry.codigo,
      transmission,
    };
  }

  return null;
}

/* ─── Post shaping ─────────────────────────────────────────────── */

const mileageCache = new Map();
/**
 * Mileage for a car, fixed the first time it is asked for.
 *
 * It has to be stable: the post advertises this number, and the want that
 * targets this car caps mileage relative to it. Drawing twice gave a car
 * 79.900 km while its suitor accepted "até 60.000 km" — a gate that fails for
 * reasons that have nothing to do with the data being unrealistic.
 */
function mileageFor(car) {
  const key = car.id ?? `${car.brand}|${car.model}|${car.year}`;
  if (!mileageCache.has(key)) {
    const age = Math.max(1, new Date().getFullYear() - car.year);
    const value = Math.round((between(9000, 16000) * age) / 500) * 500;
    mileageCache.set(key, value);
  }
  return mileageCache.get(key);
}

function cashFor(fromCar, toCar) {
  // Positive = the owner pays. Difference plus a small negotiation cushion.
  const delta = toCar.value - fromCar.value;
  const tolerance = Math.max(600, Math.round(Math.abs(delta) * 0.07 / 100) * 100);
  return { cashAdjustment: delta, cashAdjustmentTolerance: tolerance };
}

function wantFor(targetCar, extra) {
  return {
    brand: targetCar.brand,
    model: targetCar.modelGeneral,
    version: "",
    transmission: targetCar.transmission,
    yearMin: Math.max(1950, targetCar.year - 2),
    yearMax: targetCar.year + 2,
    mileageMin: undefined,
    // Generous but anchored to the real odometer of the car being asked for.
    mileageMax: mileageFor(targetCar) + 30_000,
    ...cashFor(extra.fromCar, targetCar),
    fipeBrandId: targetCar.fipeBrandId,
    fipeVersionCode: targetCar.fipeModelCode,
  };
}

function describe(owner, car, mileage) {
  const bits = [
    `${car.year}`,
    `${mileage.toLocaleString("pt-BR")} km`,
    car.fuel,
    "documento em dia, IPVA pago",
  ];
  return `${owner.name.split(" ")[0]} troca ${car.brand} ${car.model} ${car.year}. ` +
    `Carro ${bits.join(" · ")}. Aceita troca por modelo equivalente com acerto em dinheiro.`;
}

/* ─── Main ─────────────────────────────────────────────────────── */

async function detectFeatures(session, samplePostId) {
  const features = {
    trust: false, chains: false, valuation: false, deals: false,
    radar: false, roda: false, preco: false, confianca: false,
  };

  // A route that does not exist answers 404. Everything else means it is there.
  const chains = await session.json("/api/chains");
  features.chains = chains.status !== 404;

  const deals = await session.json("/api/deals");
  features.deals = deals.status !== 404;

  // Invalid signal on purpose: a real v2 answers 400, a missing route answers 404.
  /*
   * Feature detection.
   *
   * A missing route and a route answering "unknown id" both return 404, so
   * status alone is not enough. Next serves a missing route as an HTML error
   * page and a real route as JSON — that difference is the reliable signal.
   * Auth-protected endpoints answer 401/400, which also means "it exists".
   */
  const exists = (res) =>
    res.status !== 404 ||
    String(res.headers?.get?.("content-type") ?? "").includes("application/json");

  const radars = await session.json("/api/radars");
  features.radar = exists(radars);

  const roda = await session.json("/api/roda");
  features.roda = exists(roda);

  const preco = await session.json("/api/preco/__probe__");
  features.preco = exists(preco);

  const conf = await session.json("/api/confianca/verificacao", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signal: "__probe__", value: true }),
  });
  features.confianca = exists(conf);

  const probe = await session.json("/api/verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signal: "__probe__", value: true }),
  });
  features.trust = probe.status !== 404;

  if (samplePostId) {
    const v = await session.json(`/api/valuation/${samplePostId}`);
    features.valuation = v.status === 200;
  }
  return features;
}

async function seedOne(base, opts, cars) {
  const session = new Session(base);

  const health = await session.json("/api/posts?pageSize=1");
  if (health.status !== 200) {
    throw new Error(`app não respondeu em ${base} (status ${health.status}). Rode ./tools/run-all.sh`);
  }

  if (opts.reset) {
    const res = await fetch(`${base}/api/debug/clear`, {
      method: "POST",
      headers: { "x-debug-token": DEBUG_TOKEN },
    });
    if (res.status !== 200) {
      throw new Error(
        `reset falhou (${res.status}). O servidor precisa de DEBUG_TOKEN=${DEBUG_TOKEN} no .env.local`
      );
    }
    session.cookies.clear();
  }

  const labels = {
    "http://localhost:3200": "v1 original corrigido",
    "http://localhost:3502": "v2 Confiança",
    "http://localhost:3503": "v3 Corrente",
    "http://localhost:3504": "v4 Avalia",
    "http://localhost:3505": "v5 Troca Fechada",
    "http://localhost:3601": "w1 WhatsApp-first",
    "http://localhost:3602": "w2 Radar",
    "http://localhost:3603": "w3 Roda",
    "http://localhost:3604": "w4 Preço",
    "http://localhost:3605": "w5 Confiança",
  };
  const version = labels[base] ?? (base.includes("run.app") ? "LIVE Cloud Run" : base);

  console.log(`\n── ${version} (${base}) ${opts.reset ? "[reset]" : ""}`);

  // Log in as each person. Dev login creates the account when it is new and
  // takes over an existing one in development, so re-runs are idempotent.
  const people = PEOPLE.slice(0, Math.max(opts.users, 4));
  const sessions = new Map();
  for (const person of people) {
    const s = new Session(base);
    const res = await s.json("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: person.name,
        email: person.email,
        // WhatsApp is mandatory in the w-generation; older versions ignore it.
        whatsapp: phoneFor(person),
      }),
    });
    if (res.status !== 200) {
      throw new Error(`login de ${person.name} falhou (${res.status}). ALLOW_DEV_LOGIN=1?`);
    }
    sessions.set(person.email, s);
  }
  console.log(`   ${people.length} pessoas prontas`);

  /*
   * Two shapes, because the versions need different things:
   *
   *  RINGS  A→B→C→A. Each person wants the next one's car. No pair in a ring is
   *         reciprocal (B wants C, not A) — which is exactly the gap v3 exists
   *         to close. Cash is each owner's price gap to their successor, so the
   *         deltas around the ring sum to zero.
   *
   *  PAIRS  A↔B. Both want each other, cheaper side pays the difference. This
   *         is what produces ordinary matches in v1/v2/v4.
   *
   * Seeding only rings gives v1 zero matches (true, but a bad demo); seeding
   * only pairs hides v3's entire value. So we seed both.
   */
  const ringCars = [];
  let cursor = 0;
  for (const size of opts.rings) {
    const slice = cars.slice(cursor, cursor + size);
    if (slice.length === size) ringCars.push(slice);
    cursor += size;
  }

  const remaining = cars.slice(cursor);
  const pairCars = [];
  for (let i = 0; i + 1 < remaining.length && pairCars.length < opts.pairs; i += 2) {
    // Pair cars of similar value so the cash difference stays plausible.
    pairCars.push([remaining[i], remaining[i + 1]]);
  }

  const plan = [];
  let groupIndex = 0;
  const pushPost = (car, owner, wants, { inRing = false, city } = {}) =>
    plan.push({ car, owner, wants, inRing, city });

  for (const ring of ringCars) {
    // Ascending value: everyone upgrades except the top one, who downgrades
    // and takes cash. That is the shape a real swap chain has.
    const sorted = ring.slice().sort((a, b) => a.value - b.value);
    const cities = CITY_GROUPS[groupIndex++ % CITY_GROUPS.length];
    sorted.forEach((car, i) => {
      const next = sorted[(i + 1) % sorted.length];
      const owner = people[(plan.length + i) % people.length];
      // `wantFor` sets cash = next.value - this.value, i.e. exactly the gap the
      // next car costs. Summed around the ring that is zero, by construction.
      pushPost(car, owner, [wantFor(next, { fromCar: car })], {
        inRing: true,
        city: cities[i % cities.length],
      });
    });
  }

  for (const [first, second] of pairCars) {
    const [cheap, dear] = [first, second].sort((a, b) => a.value - b.value);
    const ownerCheap = people[plan.length % people.length];
    const ownerDear = people[(plan.length + 1) % people.length];
    const cities = CITY_GROUPS[groupIndex++ % CITY_GROUPS.length];
    // Reciprocal by construction: each wants the other's exact car, and the
    // cheaper owner pays the difference while the dearer one receives it.
    pushPost(cheap, ownerCheap, [wantFor(dear, { fromCar: cheap })], { city: cities[0] });
    pushPost(dear, ownerDear, [wantFor(cheap, { fromCar: dear })], { city: cities[1 % cities.length] });
  }

  console.log(
    `   plano: ${ringCars.length} correntes (${ringCars.map((r) => r.length).join("/")}) + ` +
      `${pairCars.length} pares recíprocos + ${plan.length} anúncios`
  );

  console.log(
    `   ${plan.length} anúncios · correntes ${ringCars.map((r) => r.length).join("/") || "—"}`
  );

  if (opts.dryRun) {
    for (const p of plan) console.log(`   - ${p.car.brand} ${p.car.model} ${p.car.year} R$ ${p.car.value.toLocaleString("pt-BR")} (${p.owner.name})`);
    return { version, created: 0, matches: 0, chains: 0 };
  }

  /* Photos: fetched once per car and cached across all five versions. */
  const photoPlan = new Map();
  if (opts.images > 0) {
    console.log(`   buscando fotos (${opts.images}/anúncio)…`);
    for (const car of cars) {
      const files = await fetchCarPhotos(
        { brand: car.brand, model: car.model, year: car.year },
        { count: opts.images, log: () => {} }
      );
      photoPlan.set(car, files);
    }
  }

  /* Create posts through the real HTTP API. */
  const created = [];
  for (const [index, item] of plan.entries()) {
    const s = sessions.get(item.owner.email);
    const form = new FormData();

    form.set("title", `${item.car.brand} ${item.car.model} ${item.car.year}`);
    const mileage = mileageFor(item.car);
    form.set("description", describe(item.owner, item.car, mileage));
    form.set("brand", item.car.brand);
    form.set("model", item.car.model);
    form.set("year", String(item.car.year));
    form.set("estimatedValue", String(item.car.value));
    form.set("mileage", String(mileage));
    form.set("color", pick(COLORS));
    form.set("localization", item.city ?? item.owner.city);
    form.set("fipeBrandId", item.car.fipeBrandId);
    form.set("fipeModelCode", item.car.fipeModelCode);
    form.set("fipeYearCode", item.car.fipeYearCode);
    form.set("whatsapp", `+5511${between(900000000, 999999999)}`);
    form.set("email", item.owner.email);

    // Some owners restrict distance — but never ring participants: a 100 km
    // radius would cut the very edges the chain depends on.
    if (!item.inRing && index % 3 === 0) {
      form.set("maxDistance", String(pick([100, 200, 300])));
    }

    for (const want of item.wants) {
      form.append("vVehicleType", "");
      form.append("vBrand", want.brand);
      form.append("vModel", want.model);
      form.append("vVersion", want.version ?? "");
      form.append("vTransmission", want.transmission ?? "");
      form.append("vYearMin", want.yearMin ? String(want.yearMin) : "");
      form.append("vYearMax", want.yearMax ? String(want.yearMax) : "");
      form.append("vMileageMin", want.mileageMin ? String(want.mileageMin) : "");
      form.append("vMileageMax", want.mileageMax ? String(want.mileageMax) : "");
      form.append("vCashAdj", String(want.cashAdjustment ?? 0));
      form.append("vTolerance", String(want.cashAdjustmentTolerance ?? 0));
      form.append("vFipeBrandId", want.fipeBrandId ?? "");
      form.append("vFipeVersionCode", want.fipeVersionCode ?? "");
    }

    for (const file of photoPlan.get(item.car) ?? []) {
      const bytes = await import("node:fs/promises").then((fs) => fs.readFile(file));
      form.append("images", new Blob([bytes], { type: "image/jpeg" }), path.basename(file));
    }

    const res = await s.form("/api/posts", form);
    if (res.status === 201) {
      created.push({ id: res.body.post.id, car: item.car, owner: item.owner });
      console.log(`   ✓ ${item.car.brand} ${item.car.model} ${item.car.year} — R$ ${item.car.value.toLocaleString("pt-BR")}`);
    } else {
      console.log(`   ✗ ${item.car.brand} ${item.car.model}: ${res.status} ${res.body?.error ?? ""}`);
    }
  }

  /* Version-specific enrichment. Detection happens now, with data present. */
  const features = await detectFeatures(session, created[0]?.id);
  console.log(
    `   recursos: ${["trust", "chains", "valuation", "deals", "radar", "roda", "preco", "confianca"]
      .filter((k) => features[k])
      .join(", ") || "nenhum"}`
  );

  if (features.trust) await enrichTrust(base, people, sessions, created);
  if (features.confianca) await enrichConfianca(base, people, sessions, created);
  const dealCount = features.deals ? await openDeals(base, created, sessions, opts.deals) : 0;

  /* Verify what actually landed. */
  const matches = await session.json("/api/matches");
  const chains = features.chains ? await session.json("/api/chains") : { body: { chains: [] } };

  const summary = {
    version,
    created: created.length,
    matches: matches.body?.matches?.length ?? 0,
    chains: chains.body?.chains?.length ?? 0,
    deals: dealCount,
  };

  console.log(
    `   → ${summary.created} anúncios · ${summary.matches} matches · ${summary.chains} correntes` +
      (dealCount ? ` · ${dealCount} negociações` : "")
  );
  return summary;
}

/** v2 only: give people identities and cars a dossier, with a realistic spread. */
async function enrichTrust(base, people, sessions, created) {
  const SIGNALS = ["email", "phone", "cpf", "cnh", "selfie", "address"];
  const DOSSIER = [
    "documentInSellerName", "noLiens", "noFines", "inspection", "serviceHistory", "noRecall", "singleOwner",
  ];

  for (const [i, person] of people.entries()) {
    const s = sessions.get(person.email);
    // 1/3 fully verified, 1/3 partial, 1/3 barely — so the filter is meaningful.
    const count = i % 3 === 0 ? SIGNALS.length : i % 3 === 1 ? 4 : 1;
    for (const signal of SIGNALS.slice(0, count)) {
      await s.json("/api/verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signal, value: true }),
      }).catch(() => {});
    }
  }

  for (const [i, post] of created.entries()) {
    const s = sessions.get(post.owner.email);
    const count = i % 3 === 0 ? DOSSIER.length : i % 3 === 1 ? 4 : 0;
    for (const item of DOSSIER.slice(0, count)) {
      await s.json(`/api/posts/${post.id}/dossier`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item, checked: true }),
      }).catch(() => {});
    }
  }
  console.log(`   ✓ confiança: sinais e dossiês distribuídos`);
}

/** w5 only: identity signals and a vehicle dossier, with a realistic spread. */
async function enrichConfianca(base, people, sessions, created) {
  const SIGNALS = ["email", "phone", "cpf", "cnh", "selfie", "residence"];
  const DOSSIER = ["document", "noLien", "noFines", "inspection", "history", "noRecall", "singleOwner"];

  for (const [i, person] of people.entries()) {
    const s = sessions.get(person.email);
    if (!s) continue;
    // A third fully verified, a third partial, a third with nothing at all —
    // without a "novo" group the "só verificados" filter would remove nothing
    // and could not be seen working.
    const count = i % 3 === 0 ? SIGNALS.length : i % 3 === 1 ? 4 : 0;
    for (const signal of SIGNALS.slice(0, count)) {
      await s.json("/api/confianca/verificacao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signal, confirmed: true }),
      }).catch(() => {});
    }
  }

  for (const [i, post] of created.entries()) {
    const s = sessions.get(post.owner.email);
    if (!s) continue;
    const count = i % 3 === 0 ? DOSSIER.length : i % 3 === 1 ? 4 : 0;
    for (const item of DOSSIER.slice(0, count)) {
      await s.json(`/api/posts/${post.id}/dossie`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item, confirmed: true }),
      }).catch(() => {});
    }
  }
  console.log("   ✓ confiança: sinais e dossiês distribuídos");
}

/** v5 only: open a few negotiations so the deal room has content. */
async function openDeals(base, created, sessions, requested) {
  if (!requested) return 0;
  const all = await fetch(`${base}/api/posts?pageSize=100`).then((r) => r.json());
  const posts = all.posts ?? [];
  let opened = 0;

  for (const post of posts) {
    if (opened >= requested) break;
    const other = posts.find((p) => p.userId !== post.userId);
    if (!other) break;
    const owner = PEOPLE.find((pe) => pe.email === post.contactInfo?.email) ?? PEOPLE[0];
    const s = sessions.get(owner.email) ?? [...sessions.values()][0];
    const res = await s.json("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId: post.id, otherPostId: other.id }),
    });
    if (res.status === 201 || res.status === 200) opened++;
  }
  if (opened) console.log(`   ✓ ${opened} negociação(ões) aberta(s)`);
  return opened;
}

/* ─── Entry point ──────────────────────────────────────────────── */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  rand = mulberry32(opts.seed);

  console.log("CarMatch — gerador de anúncios");
  console.log("fonte: FIPE (dados) + Wikimedia Commons (fotos)");

  console.log("\nresolvendo catálogo na FIPE…");
  const brands = await listBrands();
  const cars = [];
  for (const entry of CATALOGUE) {
    try {
      const car = await resolveCar(entry, brands);
      if (car) {
        cars.push(car);
        console.log(`   · ${car.brand} ${car.model} ${car.year} — R$ ${car.value.toLocaleString("pt-BR")}`);
      } else {
        console.log(`   ! sem dados para ${entry.brand} ${entry.model}`);
      }
    } catch (err) {
      console.log(`   ! ${entry.brand} ${entry.model}: ${err.message}`);
    }
  }

  if (cars.length < 6) {
    console.error("\nNão há carros suficientes para montar correntes. Abortando.");
    process.exit(1);
  }

  const V_TARGETS = ["http://localhost:3200", "http://localhost:3502",
    "http://localhost:3503", "http://localhost:3504", "http://localhost:3505"];
  const W_TARGETS = ["http://localhost:3601", "http://localhost:3602",
    "http://localhost:3603", "http://localhost:3604", "http://localhost:3605"];

  const targets = opts.url
    ? [opts.url]
    : opts.allW
      ? W_TARGETS
      : opts.all
        ? V_TARGETS
        : [`http://localhost:${opts.port}`];

  const results = [];
  for (const base of targets) {
    try {
      results.push(await seedOne(base, opts, cars));
    } catch (err) {
      console.error(`   ✗ ${base}: ${err.message}`);
      results.push({ version: base, error: err.message });
    }
  }

  console.log("\n═══ resumo ═══");
  for (const r of results) {
    if (r.error) console.log(`  ${r.version.padEnd(22)}  ERRO: ${r.error}`);
    else console.log(`  ${r.version.padEnd(22)}  ${r.created} anúncios · ${r.matches} matches · ${r.chains} correntes`);
  }
  console.log("\nfotos e licenças: tools/.cache/photos/CREDITS.md");
}

main().catch((err) => {
  console.error("\nFalhou:", err.message);
  process.exit(1);
});
