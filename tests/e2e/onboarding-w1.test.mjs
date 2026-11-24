/**
 * The onboarding, driven end to end against a *deterministic* FIPE.
 *
 * The real catalogue is a free service with a quota, so a test that depends on
 * it either skips when the quota is gone (proving nothing) or fails for a reason
 * the app cannot fix. Here the app is pointed at a local fake catalogue with the
 * exact shape of the real one, so every step is reproducible:
 *
 *   · the year is genuinely required,
 *   · going back and forward keeps the car and lets you pick again,
 *   · changing brand after going back reloads the models,
 *   · matches come back "temporary" and lead to signup, not to the listing,
 *   · no match leads to publishing the car.
 *
 * Only w1 is exercised: it is the version this whole product is consolidating
 * on. Other versions skip.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startServer, LAB } from "../lib/harness.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  chromium = null;
}

const VERSION = process.env.CARMATCH_TEST_VERSION ?? "w1";
const TARGET = "w1";
const isTarget = VERSION === TARGET;
const SKIP = {
  skip: !isTarget
    ? "o fluxo novo do onboarding existe só na w1"
    : !chromium
      ? "navegador indisponível"
      : false,
};

/* ─── Fake FIPE catalogue ─────────────────────────────────────── */

const BRANDS = [
  { codigo: "23", nome: "GM - Chevrolet" },
  { codigo: "26", nome: "Hyundai" },
  { codigo: "56", nome: "Toyota" },
];

const MODELS = {
  "23": [
    // Dois motores no mesmo modelo: é o que dá ao select de versão o que
    // oferecer, e o acabamento (LT/LTZ) some no agrupamento.
    { codigo: 7428, nome: "TRACKER LT 1.8 16V Flex 4x2 Aut." },
    { codigo: 7429, nome: "TRACKER LTZ 1.8 16V Flex 4x2 Aut." },
    { codigo: 7430, nome: "TRACKER 1.0 Turbo 12V Flex Aut." },
    { codigo: 8000, nome: "ONIX HATCH LT 1.0 12V Flex 5p Mec." },
  ],
  "26": [
    { codigo: 7000, nome: "Creta Pulse 1.6 16V Flex Aut." },
    { codigo: 7001, nome: "Creta 1.0 TB Flex 12V Aut." },
  ],
  "56": [
    { codigo: 9000, nome: "COROLLA GLi 1.8 16V Aut." },
    { codigo: 9001, nome: "COROLLA XEi 2.0 16V Flex Aut." },
  ],
};

const YEARS = [
  { codigo: "2016-5", nome: "2016 Flex" },
  { codigo: "2017-5", nome: "2017 Flex" },
];

async function startFakeFipe() {
  // The simplified payload must be the real one: the app asks for `?simplified=1`
  // and the picker is built around it.
  const { simplifyModels, groupByLine } = await import(
    pathToFileURL(path.join(LAB, TARGET, "lib", "car-simplify.ts")).href
  );

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const parts = url.pathname.split("/").filter(Boolean); // marcas/:b/modelos/:m/anos/:c
    const json = (body) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    // /marcas
    if (parts.length === 1 && parts[0] === "marcas") return json(BRANDS);

    const brandId = parts[1];
    const modelos = MODELS[brandId] ?? [];

    // /marcas/:id/modelos
    if (parts.length === 3 && parts[2] === "modelos") {
      if (url.searchParams.get("simplified") === "1") {
        const simplified = simplifyModels(modelos);
        const lines = groupByLine(simplified);
        return json({
          brandId,
          stats: {
            before: modelos.length,
            after: simplified.length,
            lines: lines.length,
          },
          lines: lines.map((line) => ({
            key: line.key,
            name: line.name,
            versions: line.versions,
          })),
        });
      }
      return json({ modelos });
    }

    // /marcas/:id/modelos/:model/anos
    if (parts.length === 5 && parts[4] === "anos") return json(YEARS);

    // /marcas/:id/modelos/:model/anos/:code
    if (parts.length === 6 && parts[4] === "anos") {
      return json({
        Valor: "R$ 65.128,00",
        Marca: "GM - Chevrolet",
        Modelo: "TRACKER LT 1.8 16V Flex 4x2 Aut.",
        AnoModelo: 2016,
        Combustivel: "Flex",
        CodigoFipe: "004278-3",
        MesReferencia: "novembro de 2026",
        SiglaCombustivel: "F",
      });
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

/* ─── Fixture posts ───────────────────────────────────────────── */

/** A reciprocal pair: the Tracker wants a Creta, and the Creta wants a Tracker. */
const RECIPROCAL = [
  {
    id: "post-tracker",
    userId: "user-a",
    title: "Tracker LT 2016",
    description: "",
    images: [],
    isActive: true,
    createdAt: "2026-11-01T10:00:00.000Z",
    car: {
      brand: "GM - Chevrolet",
      model: "TRACKER LT 1.8 16V Flex 4x2 Aut.",
      year: 2016,
      estimatedValue: 65128,
      localization: "Goiânia - GO",
    },
    desiredTrade: {
      vehicles: [
        {
          brand: "Hyundai",
          model: "Creta",
          cashAdjustment: 0,
          cashAdjustmentTolerance: 0,
        },
      ],
      maxDistance: 500,
    },
    contactInfo: { whatsapp: "+5511999990001" },
  },
  {
    id: "post-creta",
    userId: "user-b",
    title: "Creta Pulse 2017",
    description: "",
    images: [],
    isActive: true,
    createdAt: "2026-11-02T10:00:00.000Z",
    car: {
      brand: "Hyundai",
      model: "Creta Pulse 1.6 16V Flex Aut.",
      year: 2017,
      estimatedValue: 79364,
      localization: "Brasília - DF",
    },
    desiredTrade: {
      vehicles: [
        {
          brand: "GM - Chevrolet",
          model: "TRACKER",
          cashAdjustment: 0,
          cashAdjustmentTolerance: 0,
        },
      ],
      maxDistance: 500,
    },
    contactInfo: { whatsapp: "+5511999990002" },
  },
];

/** Nobody wants this car: the "publish yours" path. */
const ORPHAN = [
  {
    id: "post-corolla",
    userId: "user-c",
    title: "Corolla GLi 2016",
    description: "",
    images: [],
    isActive: true,
    createdAt: "2026-11-03T10:00:00.000Z",
    car: {
      brand: "Toyota",
      model: "COROLLA GLi 1.8 16V Aut.",
      year: 2016,
      estimatedValue: 90000,
      localization: "São Paulo - SP",
    },
    desiredTrade: {
      vehicles: [
        { brand: "Toyota", model: "COROLLA XEi", cashAdjustment: 0, cashAdjustmentTolerance: 0 },
      ],
      maxDistance: 500,
    },
    contactInfo: { whatsapp: "+5511999990003" },
  },
];

/* ─── Harness ─────────────────────────────────────────────────── */

let fake;
let app;
let browser;

async function boot(seed) {
  fake = await startFakeFipe();
  app = await startServer(TARGET, {
    port: 3950 + Math.floor(Math.random() * 40),
    seed,
    env: { FIPE_API_BASE: fake.base, FIPE_FALLBACK_BASE: "off" },
  });
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  return app.base;
}

async function teardown() {
  await browser?.close().catch(() => {});
  await app?.stop().catch(() => {});
  await fake?.stop().catch(() => {});
}

async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Ruído de dev e indisponibilidade de terceiro não são defeito do fluxo.
    if (/Download the React DevTools|\[HMR\]|Fast Refresh/i.test(text)) return;
    errors.push(text);
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { page, errors };
}

/** Marca → modelo → versão, com os selects reais do CarPicker. */
async function pickCar(page, { brand, model, version }) {
  await page.getByRole("button", { name: /Selecione a marca/i }).first().click();
  await page.getByRole("textbox").fill(brand);
  await page.getByRole("option", { name: brand, exact: true }).first().click();

  await page.getByRole("button", { name: /Selecione o modelo/i }).first().click();
  await page.getByRole("textbox").fill(model);
  await page
    .getByRole("option", { name: new RegExp(`^${model} \\(`, "i") })
    .first()
    .click();

  /*
   * Um grupo com uma única opção não tem select de versão ("Só há uma versão"):
   * nesse caso já está escolhido.
   */
  const versionTrigger = page.getByRole("button", {
    name: /Selecione motor e câmbio|Só há uma versão/i,
  });
  if ((await versionTrigger.count()) > 0 && (await versionTrigger.first().isEnabled())) {
    await versionTrigger.first().click();
    await page.getByRole("textbox").fill(version);
    await page
      .getByRole("option", { name: new RegExp(version, "i") })
      .first()
      .click();
  }
}

async function startWizard(page) {
  await page.goto(`${app.base}/boas-vindas`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Descobrir meus matches/i }).click();
  await page.getByRole("button", { name: /Pular esta etapa/i }).click();
  await page.waitForSelector("text=Qual carro você tem?", { timeout: 15000 });
}

/* ─── Tests ───────────────────────────────────────────────────── */

test("onboarding: o ano é obrigatório e o motivo é dito", SKIP, async (t) => {
  t.after(teardown);
  await boot(RECIPROCAL);

  const { page, errors } = await open(`${app.base}/boas-vindas`);
  await startWizard(page);

  await pickCar(page, {
    brand: "GM - Chevrolet",
    model: "Tracker",
    version: "1.8 Flex 16V",
  });

  const next = page.getByRole("button", { name: /^Continuar$/ });
  assert.equal(await next.isDisabled(), true, "sem ano não deve avançar");
  await page.waitForSelector("text=Falta escolher o ano", { timeout: 5000 });

  // Com o ano, avança.
  await page.getByRole("button", { name: /Selecione o ano/i }).click();
  await page.getByRole("option", { name: /2016/ }).first().click();
  assert.equal(await next.isDisabled(), false, "com ano deve avançar");

  assert.deepEqual(errors, [], `erros de página: ${errors.join(" | ")}`);
});

test("onboarding: voltar e continuar preserva o carro e permite escolher de novo", SKIP, async (t) => {
  t.after(teardown);
  await boot(RECIPROCAL);

  const { page, errors } = await open(`${app.base}/boas-vindas`);
  await startWizard(page);

  await pickCar(page, {
    brand: "GM - Chevrolet",
    model: "Tracker",
    version: "1.8 Flex 16V",
  });
  await page.getByRole("button", { name: /Selecione o ano/i }).click();
  await page.getByRole("option", { name: /2016/ }).first().click();

  // Ida e volta pela etapa anterior — o caso que travava.
  await page.getByRole("button", { name: /^Voltar$/ }).click();
  await page.getByRole("button", { name: /^Continuar$/ }).click();

  // A marca continua lá…
  await page.waitForSelector("text=Qual carro você tem?");
  assert.ok(
    await page.getByRole("button", { name: /GM - Chevrolet/ }).first().isVisible(),
    "a marca precisa continuar selecionada"
  );

  // …e o modelo continua escolhível: a lista abre com opções.
  await page.getByRole("button", { name: /Tracker \(/ }).first().click();
  const options = page.getByRole("option");
  await options.first().waitFor({ timeout: 10000 });
  assert.ok((await options.count()) > 0, "o select de modelo não pode abrir vazio");
  await page.keyboard.press("Escape");

  assert.deepEqual(errors, [], `erros de página: ${errors.join(" | ")}`);
});

test("onboarding: trocar de marca depois de voltar recarrega os modelos", SKIP, async (t) => {
  t.after(teardown);
  await boot(RECIPROCAL);

  const { page, errors } = await open(`${app.base}/boas-vindas`);
  await startWizard(page);

  await pickCar(page, {
    brand: "GM - Chevrolet",
    model: "Tracker",
    version: "1.8 Flex 16V",
  });

  // Volta, troca para outra marca: o modelo antigo precisa sumir e a lista nova
  // precisa carregar (era aqui que ficava "marca escolhida, modelo impossível").
  await page.getByRole("button", { name: /^Voltar$/ }).click();
  await page.getByRole("button", { name: /^Continuar$/ }).click();

  await page.getByRole("button", { name: /GM - Chevrolet/ }).first().click();
  await page.getByRole("textbox").fill("Toyota");
  await page.getByRole("option", { name: "Toyota", exact: true }).first().click();

  await page.getByRole("button", { name: /Selecione o modelo/i }).first().click();
  await page.getByRole("textbox").fill("Corolla");
  const corolla = page.getByRole("option", { name: /^Corolla \(/i }).first();
  await corolla.waitFor({ timeout: 10000 });
  await corolla.click();

  await page.getByRole("button", { name: /Selecione motor e câmbio/i }).click();
  await page.getByRole("textbox").fill("1.8");
  await page.getByRole("option", { name: /1\.8/ }).first().click();

  assert.ok(
    await page.getByRole("button", { name: /Corolla 1\.8/ }).first().isVisible(),
    "a versão escolhida precisa aparecer"
  );

  assert.deepEqual(errors, [], `erros de página: ${errors.join(" | ")}`);
});

test("onboarding: match vira 'temporário' e leva ao cadastro, não ao anúncio", SKIP, async (t) => {
  t.after(teardown);
  await boot(RECIPROCAL);

  const { page, errors } = await open(`${app.base}/boas-vindas`);
  await startWizard(page);

  await pickCar(page, {
    brand: "GM - Chevrolet",
    model: "Tracker",
    version: "1.8 Flex 16V",
  });
  await page.getByRole("button", { name: /Selecione o ano/i }).click();
  await page.getByRole("option", { name: /2016/ }).first().click();
  await page.getByRole("button", { name: /^Continuar$/ }).click();

  await page.waitForSelector("text=E o que você quer?");
  await pickCar(page, {
    brand: "Hyundai",
    model: "Creta",
    version: "1.6 Flex 16V",
  });
  await page.getByRole("button", { name: /Ver meus matches/i }).click();

  await page.waitForSelector("text=Matches temporários", { timeout: 20000 });
  assert.match(
    await page.textContent("body"),
    /Finalize seu cadastro para oficializar/,
    "o CTA de oficializar precisa aparecer"
  );

  // O anúncio aparece, mas não abre: o clique leva ao cadastro.
  const row = page.locator('a[href^="/auth?redirectTo="]').first();
  await row.waitFor({ timeout: 10000 });
  const href = await row.getAttribute("href");
  assert.match(href, /redirectTo=/);
  assert.match(
    decodeURIComponent(href),
    /posts\/new\?fromOnboarding=1/,
    "o cadastro precisa levar o rascunho"
  );

  // Nenhum link direto para o anúncio nesta tela: o gate é o caminho.
  assert.equal(await page.locator('a[href^="/posts/"]').count(), 0);

  assert.deepEqual(errors, [], `erros de página: ${errors.join(" | ")}`);
});

test("onboarding: sem match, o convite é publicar o carro na vitrine", SKIP, async (t) => {
  t.after(teardown);
  await boot(ORPHAN);

  // Entra direto no resultado: o que interessa aqui é a tela final.
  const { page, errors } = await open(
    `${app.base}/boas-vindas?haveBrand=GM%20-%20Chevrolet&haveModel=ONIX%20HATCH%20LT%201.0%2012V%20Flex%205p%20Mec.&haveYear=2016`
  );

  await page.waitForSelector("text=/Ninguém pediu o seu carro|Nenhum match/i", {
    timeout: 20000,
  });
  const body = await page.textContent("body");
  assert.match(body, /Coloque seu carro na vitrine|Cadastrar meu carro/i);

  const cta = page.locator('a[href^="/auth?redirectTo="]').first();
  await cta.waitFor({ timeout: 10000 });
  const href = decodeURIComponent((await cta.getAttribute("href")) ?? "");
  assert.match(href, /posts\/new\?fromOnboarding=1/);

  assert.deepEqual(errors, [], `erros de página: ${errors.join(" | ")}`);
});

test("rascunho: depois do login o formulário abre preenchido", SKIP, async (t) => {
  t.after(teardown);
  await boot(RECIPROCAL);

  const draft = `/posts/new?fromOnboarding=1&brand=GM+-+Chevrolet&brandId=23&model=TRACKER+LT+1.8+16V+Flex+4x2+Aut.&modelCode=7428&year=2016&wantBrand=Hyundai&wantModel=Creta+Pulse+1.6+16V+Flex+Aut.`;

  const { page, errors } = await open(`${app.base}${draft}`);

  // Deslogado: precisa passar pelo login, levando o rascunho.
  await page.waitForURL(/\/auth\?redirectTo=/, { timeout: 20000 });
  await page.fill('input[aria-label="Nome"]', "Pessoa Onboarding");
  await page.fill('input[aria-label="E-mail"]', `onb-${Date.now()}@test.local`);
  await page.fill('input[aria-label="WhatsApp"]', "11912345678");
  await page.getByRole("button", { name: /Entrar sem senha/i }).click();

  await page.waitForURL(/\/posts\/new\?fromOnboarding=1/, { timeout: 20000 });
  await page.waitForSelector("text=Falta só publicar", { timeout: 15000 });

  // O carro que a pessoa tem vem preenchido, com ano.
  await page.getByRole("button", { name: /GM - Chevrolet/ }).first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Tracker/ }).first().waitFor();
  await page.getByRole("button", { name: /2016/ }).first().waitFor();

  // E o carro que ela quer já está na primeira linha.
  assert.match(await page.textContent("body"), /Creta/);

  assert.deepEqual(errors, [], `erros de página: ${errors.join(" | ")}`);
});
