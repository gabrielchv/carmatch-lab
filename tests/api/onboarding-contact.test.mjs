/**
 * The onboarding preview and the WhatsApp contact payload — the two endpoints
 * that decide what a first-time visitor sees and what a message actually says.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { useServer } from "../lib/server.mjs";
import { Client, postForm, makeWant } from "../lib/harness.mjs";

// W_ONLY_GUARD: onboarding e contato por WhatsApp só existem na geração W.
const W_ONLY = (process.env.CARMATCH_TEST_VERSION ?? "w1").startsWith("w");
if (!W_ONLY) {
  test("(geração W) onboarding e contato", (t) =>
    t.skip("estas rotas só existem na geração W")
  );
} else {

const server = useServer();
const isW = () => (process.env.CARMATCH_TEST_VERSION ?? "w1").startsWith("w");

async function user(email, name = "Pessoa") {
  const api = new Client(server());
  await api.login({ name, email, whatsapp: "+5511912345678" });
  return api;
}

let fixture = null;

/**
 * Two posts, arranged so all four preview outcomes are reachable:
 *  · "corolla" wants a Honda Fit  (so it accepts my Fit)
 *  · "fit"     wants a Toyota Corolla (so it accepts the Corolla I might want)
 */
async function seed() {
  if (fixture) return fixture;
  const api = await user("dono@preview.local", "Dono");

  const a = await api.postForm(
    "/api/posts",
    postForm({
      title: "Toyota Corolla XEi 2019",
      brand: "Toyota", model: "Corolla XEi 2.0", year: 2019, value: 95000,
      mileage: 40000, city: "São Paulo - SP",
      wants: [makeWant({ brand: "Honda", model: "Fit", cashAdjustment: -45000, cashAdjustmentTolerance: 2000 })],
    })
  );
  const b = await api.postForm(
    "/api/posts",
    postForm({
      title: "Honda Fit EX 2015",
      brand: "Honda", model: "Fit EX 1.5", year: 2015, value: 50000,
      mileage: 60000, city: "São Paulo - SP",
      wants: [makeWant({ brand: "Toyota", model: "Corolla", cashAdjustment: 45000, cashAdjustmentTolerance: 2000 })],
    })
  );

  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  fixture = { corolla: a.body.post, fit: b.body.post, owner: api };
  return fixture;
}

const preview = (body) => new Client(server()).postJson("/api/onboarding/preview", body);

test("preview: os dois lados se querem → reciprocal", async () => {
  await seed();
  const r = await preview({
    have: { brand: "Honda", model: "Fit", year: 2015 },
    want: { brand: "Toyota", model: "Corolla" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, "reciprocal");
  assert.equal(r.body.matches.length, 1);
  assert.equal(r.body.wantSkipped, false);
});

test("preview: só entrada → inbound-only", async () => {
  await seed();
  const r = await preview({
    have: { brand: "Honda", model: "Fit", year: 2015 },
    want: { brand: "Jeep", model: "Renegade" },
  });
  assert.equal(r.body.outcome, "inbound-only");
  assert.equal(r.body.theyWantMine.length, 1);
  assert.equal(r.body.matches.length, 0);
});

test("preview: sem carro desejado → wantSkipped e só a direção de entrada", async () => {
  if (!isW()) return;
  await seed();
  const r = await preview({ have: { brand: "Honda", model: "Fit", year: 2015 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.wantSkipped, true);
  assert.equal(r.body.outcome, "inbound-only");
  assert.equal(r.body.theyWantMine.length, 1);
  assert.equal(r.body.iWantTheirs.length, 0, "sem querer nada, não há direção de saída");
  assert.equal(r.body.matches.length, 0, "sem querer nada, não existe match");
});

test("preview: sem carro desejado e ninguém querendo → no-match", async () => {
  if (!isW()) return;
  await seed();
  const r = await preview({ have: { brand: "Ferrari", model: "F8" } });
  assert.equal(r.body.wantSkipped, true);
  assert.equal(r.body.outcome, "no-match");
});

/* ─── Faixa de valor (API) ─────────────────────────────────────── */

test("preview: faixa de valor responde no modo price", async () => {
  if (!isW()) return;
  await seed();
  const r = await preview({
    have: { brand: "Honda", model: "Fit", year: 2015 },
    wantRange: { min: 90000, max: 100000 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.wantMode, "price");
  assert.equal(r.body.wantSkipped, false);
  // O Corolla do fixture custa 95.000 e está na faixa. Ele também aceita meu
  // Fit, então aparece como match — o bucket depende da direção de entrada,
  // não da faixa.
  const todos = [...r.body.matches, ...r.body.iWantTheirs];
  assert.ok(
    todos.some((p) => p.title.includes("Corolla")),
    "o anúncio na faixa deveria aparecer em algum dos dois grupos"
  );
});

test("preview: faixa fora de qualquer anúncio não inventa resultado", async () => {
  if (!isW()) return;
  await seed();
  const r = await preview({
    have: { brand: "Honda", model: "Fit", year: 2015 },
    wantRange: { min: 500000, max: 900000 },
  });
  assert.equal(r.body.wantMode, "price");
  assert.equal(r.body.iWantTheirs.length, 0);
});

test("preview: só teto funciona", async () => {
  if (!isW()) return;
  await seed();
  const r = await preview({
    have: { brand: "Honda", model: "Fit", year: 2015 },
    wantRange: { max: 60000 },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.iWantTheirs.some((p) => p.car.estimatedValue <= 60000));
  assert.ok(r.body.iWantTheirs.every((p) => p.car.estimatedValue <= 60000));
});

test("preview: min > max → 400", async () => {
  const r = await preview({
    have: { brand: "Honda", model: "Fit" },
    wantRange: { min: 90000, max: 60000 },
  });
  assert.equal(r.status, 400);
});

test("preview: faixa sem nenhum limite útil → 400", async () => {
  const r = await preview({
    have: { brand: "Honda", model: "Fit" },
    wantRange: { min: 0, max: 0 },
  });
  assert.equal(r.status, 400);
});

test("preview: nenhum anúncio na área → no-posts (não 'nenhum match')", async () => {
  await seed();
  // O banco tem anúncios, mas nenhum na região pedida: o universo é vazio.
  const r = await preview({
    have: { brand: "Honda", model: "Fit" },
    want: { brand: "Toyota", model: "Corolla" },
    city: "Manaus - AM",
    radiusKm: 50,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.considered, 0);
  assert.equal(r.body.outcome, "no-posts");
});

test("preview: falta o carro que a pessoa tem → 400", async () => {
  const r = await preview({ want: { brand: "Toyota", model: "Corolla" } });
  assert.equal(r.status, 400);
});

test("preview: carro desejado incompleto → 400 (não vira 'sem carro desejado')", async () => {
  const r = await preview({
    have: { brand: "Honda", model: "Fit" },
    want: { brand: "Toyota" },
  });
  assert.equal(r.status, 400);
});

test("preview: corpo inválido → 400", async () => {
  const api = new Client(server());
  const res = await fetch(`${server().base}/api/onboarding/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{quebrado",
  });
  assert.equal(res.status, 400);
});

test("preview: é público (funciona deslogado)", async () => {
  await seed();
  const r = await preview({
    have: { brand: "Honda", model: "Fit" },
    want: { brand: "Toyota", model: "Corolla" },
  });
  assert.equal(r.status, 200);
});

test("preview: filtro de área reduz o universo", async () => {
  await seed();
  const r = await preview({
    have: { brand: "Honda", model: "Fit", year: 2015 },
    want: { brand: "Toyota", model: "Corolla" },
    city: "Salvador - BA",
    radiusKm: 50,
  });
  assert.equal(r.body.considered, 0, "os anúncios estão em SP");
});

/* ─── Contato / WhatsApp ─────────────────────────────────────── */

test("contact: anônimo → 401 com code login-required", async () => {
  const { fit } = await seed();
  const api = new Client(server());
  const r = await api.get(`/api/posts/${fit.id}/contact`);
  assert.equal(r.status, 401);
  assert.equal(r.body.code, "login-required");
});

test("contact: no próprio anúncio → 400 com code self", async () => {
  const { fit, owner } = await seed();
  const r = await owner.get(`/api/posts/${fit.id}/contact`);
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "self");
});

test("contact: anúncio inexistente → 404", async () => {
  const api = await user("quem@test.local");
  const r = await api.get("/api/posts/nao-existe/contact");
  assert.equal(r.status, 404);
});

test("contact: com match devolve link wa.me e mensagem completa", async () => {
  const { fit } = await seed();
  const comprador = await user("comprador@test.local", "Comprador");

  // Um anúncio do comprador que casa com o Fit.
  await comprador.postForm(
    "/api/posts",
    postForm({
      title: "Corolla do comprador",
      brand: "Toyota", model: "Corolla XEi 2.0", year: 2019, value: 95000,
      wants: [makeWant({ brand: "Honda", model: "Fit", cashAdjustment: -45000 })],
    })
  );

  const r = await comprador.get(`/api/posts/${fit.id}/contact`);
  assert.equal(r.status, 200);
  assert.equal(r.body.matched, true);
  assert.ok(r.body.href.startsWith("https://wa.me/"));
  assert.match(r.body.message, /Demos match/);
  assert.match(r.body.message, /https?:\/\/[^/]+\/posts\//);
  assert.equal(r.body.ownerName, "Dono");
});

test("contact: sem match usa a mensagem de interesse", async () => {
  const { fit } = await seed();
  const curioso = await user("curioso@test.local");
  const r = await curioso.get(`/api/posts/${fit.id}/contact`);
  assert.equal(r.status, 200);
  assert.equal(r.body.matched, false);
  assert.match(r.body.message, /Vi seu Honda Fit/);
  assert.doesNotMatch(r.body.message, /Demos match/);
});

test("contact: anunciante sem número → href null e motivo", async () => {
  const semNumero = await user("semnumero@test.local");
  const criado = await semNumero.postForm("/api/posts", postForm({ title: "Sem número" }));
  const id = criado.body.post.id;

  // Remove o número direto no banco: é o estado de uma conta antiga.
  const { readFile, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(server().dataDir, "posts.json");
  const posts = JSON.parse(await readFile(file, "utf-8"));
  posts.find((p) => p.id === id).contactInfo.whatsapp = "";
  await writeFile(file, JSON.stringify(posts), "utf-8");

  const outro = await user("outro@test.local");
  const r = await outro.get(`/api/posts/${id}/contact`);
  assert.equal(r.status, 200);
  assert.equal(r.body.href, null);
  assert.equal(r.body.unavailable, "no-whatsapp");
});

test("contact: a mensagem leva o link absoluto do anúncio do remetente", async () => {
  const { fit } = await seed();
  const comprador = await user("link@test.local");
  const meu = await comprador.postForm(
    "/api/posts",
    postForm({ title: "Meu Corolla", brand: "Toyota", model: "Corolla XEi", year: 2019, value: 95000, wants: [makeWant({ brand: "Honda", model: "Fit" })] })
  );
  const r = await comprador.get(`/api/posts/${fit.id}/contact`);
  assert.match(r.body.message, new RegExp(`/posts/${meu.body.post.id}`));
});

}
