/**
 * Browser tests: the things only a real browser can prove.
 *
 * Server tests can confirm that an endpoint returns the right JSON; they cannot
 * confirm that the button is reachable, that the wizard advances, or that a
 * page throws no React error. Each test here drives Chrome and fails on any
 * console error.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { useServer } from "../lib/server.mjs";
import { Client, postForm, makeWant } from "../lib/harness.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  chromium = null;
}

const server = useServer();
const isW = () => (process.env.CARMATCH_TEST_VERSION ?? "w1").startsWith("w");

/**
 * A w6 reorganizou o seletor de carro em três níveis (marca → modelo → versão)
 * em vez de um select único de "modelo e versão". O teste precisa da mesma
 * pergunta nas duas formas, então a escolha do carro fica aqui.
 */
const isW6 = () => (process.env.CARMATCH_TEST_VERSION ?? "w1") === "w6";

/**
 * Is the FIPE catalogue reachable from this test server?
 *
 * It is a third-party API with a public quota; when it answers 429 the app
 * correctly shows "não foi possível carregar", which makes any step that picks a
 * car impossible. Skipping is honest — failing here would blame the app for
 * someone else's rate limit.
 */
let fipeReachable = null;
async function hasFipe() {
  if (fipeReachable !== null) return fipeReachable;
  try {
    const res = await new Client(server()).get("/api/fipe/brands");
    fipeReachable = res.status === 200 && Array.isArray(res.body) && res.body.length > 0;
  } catch {
    fipeReachable = false;
  }
  return fipeReachable;
}

const NEEDS_FIPE = "catálogo FIPE indisponível (serviço externo limitou as requisições)";

async function pickCar(page, { brand, model, version }) {
  await page.getByRole("button", { name: /Selecione a marca/i }).click();
  await page.getByRole("textbox").fill(brand);
  await page.getByRole("option", { name: brand, exact: true }).click();

  if (isW6()) {
    await page.getByRole("button", { name: /Selecione o modelo$/i }).click();
    await page.getByRole("textbox").fill(model);
    await page
      .getByRole("option", { name: new RegExp(`^${model} \\(`, "i") })
      .first()
      .click();
    await page.getByRole("button", { name: /Selecione motor e câmbio/i }).click();
    await page.getByRole("textbox").fill(version);
    await page
      .getByRole("option", { name: new RegExp(version, "i") })
      .first()
      .click();
  } else {
    // A FIPE lista a versão completa ("CRONOS DRIVE 1.0 6V Flex"), não o modelo
    // genérico: é ela que carrega a transmissão usada no match.
    await page.getByRole("button", { name: /Selecione o modelo e a versão/i }).click();
    await page.getByRole("textbox").fill(model);
    await page
      .getByRole("option", { name: new RegExp(`^${model.toUpperCase()} `) })
      .first()
      .click();
  }
}

/** One browser for the file; a fresh page (and console log) per test. */
let browser;
const pages = [];

test.before(async () => {
  if (!chromium) return;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});

test.after(async () => {
  for (const p of pages) await p.close().catch(() => {});
  await browser?.close().catch(() => {});
});

/**
 * Noise that comes from `next dev`, not from the app.
 *
 * HMR's websocket fails whenever the page is opened by an external client, and
 * the React DevTools banner is a console message by design. Neither is a defect,
 * and letting them fail the suite would train everyone to ignore it.
 */
const DEV_NOISE = [
  /webpack-hmr/i,
  /WebSocket connection to/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /\[Fast Refresh\]/i,
  /*
   * A FIPE pública é um serviço externo e limita requisições (HTTP 429 → a rota
   * responde 502). Isso é indisponibilidade de terceiro, não defeito do app — e
   * um teste que falha quando a FIPE está fora ensina todo mundo a ignorar a
   * suíte. O que o teste verifica é a tela, não a cota alheia.
   */
  /status of 502/i,
  /Failed to load resource.*\/api\/fipe/i,
];

const isNoise = (text) => DEV_NOISE.some((re) => re.test(text));

/** Open a page and collect real console/page errors for the test's duration. */
async function open(pathname = "/") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isNoise(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (!isNoise(String(err))) errors.push(String(err));
  });
  await page.goto(`${server().base}${pathname}`, { waitUntil: "domcontentloaded" });
  pages.push(page);
  return { page, errors };
}

/** Seed two reciprocal posts so the UI has something real to show. */
let seeded = false;
async function seed() {
  if (seeded) return;
  const ana = new Client(server());
  await ana.login({ name: "Ana Beatriz", email: "ana@e2e.local", whatsapp: "+5511911111111" });
  const bruno = new Client(server());
  await bruno.login({ name: "Bruno Lima", email: "bruno@e2e.local", whatsapp: "+5511922222222" });

  await ana.postForm(
    "/api/posts",
    postForm({
      title: "Fiat Argo Drive 2021",
      brand: "Fiat", model: "Argo Drive 1.0", year: 2021, value: 60000,
      mileage: 25000, city: "Campinas - SP",
      wants: [makeWant({ brand: "VW", model: "T-Cross" })],
    })
  );
  await bruno.postForm(
    "/api/posts",
    postForm({
      title: "VW T-Cross 2021",
      brand: "VW - VolksWagen", model: "T-Cross 1.0 TSI", year: 2021, value: 88000,
      mileage: 30000, city: "Campinas - SP",
      wants: [makeWant({ brand: "Fiat", model: "Argo", cashAdjustment: -28000 })],
    })
  );
  seeded = true;
}

const skip = () => !chromium;

/**
 * Authenticate a browser context without driving the login form.
 *
 * The V generation only offers Google in a production build, so the form is not
 * a stable path. Logging in through the API and copying the session cookie
 * tests the same session the app would create, and works for both generations.
 */
async function loginContext(email, name) {
  const api = new Client(server());
  const user = await api.login({ name, email, whatsapp: "+5511911111111" });
  const cookie = api.cookies.get("carmatch-session");

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "carmatch-session", value: cookie, domain: "localhost", path: "/" },
  ]);
  const page = await ctx.newPage();
  pages.push(page);
  return { page, ctx, user };
}

test("home carrega e mostra os anúncios, sem erro de console", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  await seed();
  const { page, errors } = await open("/?sortBy=date"); // evita o onboarding
  await page.waitForSelector("text=Fiat Argo Drive 2021", { timeout: 15000 });
  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});

test("home: o filtro reverso aparece e abre", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("filtro reverso é só da geração W");
  const { page, errors } = await open("/?sortBy=date");
  const toggle = page.getByRole("button", { name: /Quem quer o carro que você já tem/i });
  await toggle.waitFor({ timeout: 15000 });
  await toggle.click();
  await page.waitForSelector('text=Mostra só os anúncios que aceitariam esse carro na troca');
  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});

test("onboarding: link direto mostra resultado de match", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("onboarding é só da geração W");
  await seed();
  const { page, errors } = await open(
    "/boas-vindas?haveBrand=Fiat&haveModel=Argo&haveYear=2021&wantBrand=VW%20-%20VolksWagen&wantModel=T-Cross"
  );
  await page.waitForSelector("text=Match encontrado!", { timeout: 20000 });
  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});

test("onboarding: 'só quero ver quem quer o meu carro' responde sem carro desejado", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("onboarding é só da geração W");
  await seed();
  const { page, errors } = await open("/boas-vindas?haveBrand=Fiat&haveModel=Argo&haveYear=2021");
  await page.waitForSelector("text=/quer seu carro|Ainda não há carros/i", { timeout: 20000 });
  // A tela não deve falar de "dois sentidos" quando só um foi perguntado.
  const body = await page.textContent("body");
  assert.doesNotMatch(body ?? "", /dois sentidos/);
  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});

test("onboarding: a etapa 3 oferece a saída sem carro desejado", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("onboarding é só da geração W");
  if (!(await hasFipe())) return t.skip(NEEDS_FIPE);
  const { page } = await open("/boas-vindas");
  await page.getByRole("button", { name: /Descobrir meus matches/i }).click();
  await page.getByRole("button", { name: /Pular esta etapa/i }).click();
  await page.waitForSelector("text=Qual carro você tem?");

  // Preenche o carro que a pessoa tem.
  await pickCar(page, { brand: "Fiat", model: "Cronos", version: "1.3" });
  await page.getByRole("button", { name: /^Continuar$/ }).click();

  await page.waitForSelector("text=E o que você quer?");
  await page.waitForSelector("text=Só quero ver quem quer o meu carro");
});

test("onboarding: faixa de valor encontra anúncios sem nomear carro", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("onboarding é só da geração W");
  await seed();

  // Argo 60k, T-Cross 88k. A faixa 80–100 pega só o T-Cross.
  const { page, errors } = await open(
    "/boas-vindas?haveBrand=Fiat&haveModel=Argo&haveYear=2021&wantMin=80000&wantMax=100000"
  );
  await page.waitForSelector("text=/T-Cross/", { timeout: 20000 });

  const body = await page.textContent("body");
  assert.match(body ?? "", /R\$ 80\.000 a R\$ 100\.000/, "mostra a faixa escolhida");
  assert.doesNotMatch(body ?? "", /Argo Drive 2021[\s\S]{0,40}Você quer/, "faixa não é um modelo");
  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});

test("onboarding: etapa 3 tem os dois modos e o campo de ano", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("onboarding é só da geração W");
  if (!(await hasFipe())) return t.skip(NEEDS_FIPE);

  const { page } = await open("/boas-vindas");
  await page.getByRole("button", { name: /Descobrir meus matches/i }).click();
  await page.getByRole("button", { name: /Pular esta etapa/i }).click();

  await pickCar(page, { brand: "Fiat", model: "Cronos", version: "1.3" });
  await page.getByRole("button", { name: /^Continuar$/ }).click();

  await page.waitForSelector("text=E o que você quer?");
  // Os dois modos, e o seletor de ano no modo carro.
  await page.getByRole("button", { name: "Faixa de valor" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Carro específico" }).waitFor();
  await page.getByRole("button", { name: /Selecione o ano|Escolha o modelo primeiro/i }).waitFor();

  // Alternar para faixa mostra os campos de valor e esconde o de ano.
  await page.getByRole("button", { name: "Faixa de valor" }).click();
  await page.getByLabel("Valor mínimo").waitFor({ timeout: 10000 });
  await page.getByLabel("Valor máximo").waitFor();
});

test("login: entrar sem senha leva para a página pedida", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("a geração V só oferece Google no build de produção");
  const email = `e2e-login-${Date.now()}@test.local`;
  const { page, errors } = await open("/auth?redirectTo=/my-posts");

  await page.fill('input[aria-label="Nome"]', "Pessoa E2E");
  await page.fill('input[aria-label="E-mail"]', email);
  if (isW()) await page.fill('input[aria-label="WhatsApp"]', "11912345678");
  await page.getByRole("button", { name: /Entrar sem senha/i }).click();

  await page.waitForURL(/\/my-posts/, { timeout: 20000 });
  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});

test("login: sem WhatsApp na geração W o navegador bloqueia o envio", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  if (!isW()) return t.skip("regra só da geração W");
  const { page } = await open("/auth");
  await page.fill('input[aria-label="Nome"]', "Sem Zap");
  await page.fill('input[aria-label="E-mail"]', `semzap-${Date.now()}@test.local`);
  await page.getByRole("button", { name: /Entrar sem senha/i }).click();

  // O campo é `required`: o navegador impede o submit e a URL não muda.
  await page.waitForTimeout(800);
  assert.match(page.url(), /\/auth/);
});

test("anúncio: visitante logado vê o canal de contato certo para a geração", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  await seed();

  const list = await new Client(server()).get("/api/posts?pageSize=10");
  const alvo = list.body.posts.find((p) => p.title.includes("T-Cross"));
  assert.ok(alvo, "fixture deveria conter o T-Cross");

  const { page } = await loginContext("ana@e2e.local", "Ana Beatriz");
  const errors = [];
  page.on("pageerror", (e) => {
    if (!isNoise(String(e))) errors.push(String(e));
  });

  await page.goto(`${server().base}/posts/${alvo.id}`, { waitUntil: "domcontentloaded" });

  if (isW()) {
    const link = page.locator('a[href^="https://wa.me/"]').first();
    await link.waitFor({ timeout: 20000 });
    const href = await link.getAttribute("href");
    assert.ok(href.includes("wa.me"), "é um link de WhatsApp de verdade");
    assert.ok(href.includes("text="), "já leva a mensagem escrita");
  } else {
    // A geração V tem chat interno; o contato é um botão de conversa.
    await page.waitForSelector("text=/Conversar|chat|Conversas/i", { timeout: 20000 });
  }

  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});

test("página de debug carrega", async (t) => {
  if (skip()) return t.skip("navegador indisponível");
  const { page, errors } = await open("/debug");
  await page.waitForSelector("text=Painel de testes");
  assert.equal(errors.length, 0, `erros: ${errors.join(" | ")}`);
});
