/**
 * Posts: creation rules, ownership, and every filter the listing page exposes.
 *
 * The fixture is built through the real HTTP API so the tests exercise the same
 * path a browser would, and the expected results can be computed by hand.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { useServer } from "../lib/server.mjs";
import { Client, postForm, makeWant, TINY_JPEG } from "../lib/harness.mjs";

const server = useServer();
const isW = () => (process.env.CARMATCH_TEST_VERSION ?? "w1").startsWith("w");

/** A logged-in client. */
async function user(email, name = "Pessoa") {
  const api = new Client(server());
  await api.login({ name, email, whatsapp: "+5511912345678" });
  return api;
}

/**
 * The fixture the filter tests run against. Values are deliberately distinct so
 * a wrong filter shows up as a wrong count, not a coincidence.
 */
const FIXTURE = [
  {
    key: "fit",
    title: "Honda Fit EX 2015",
    brand: "Honda", model: "Fit EX 1.5", year: 2015, value: 50000,
    mileage: 60000, city: "São Paulo - SP",
    wants: [makeWant({ brand: "Toyota", model: "Corolla" })],
  },
  {
    key: "corolla",
    title: "Toyota Corolla XEi 2019",
    brand: "Toyota", model: "Corolla XEi 2.0", year: 2019, value: 95000,
    mileage: 40000, city: "São Paulo - SP",
    wants: [makeWant({ brand: "Honda", model: "Fit", cashAdjustment: -40000 })],
  },
  {
    key: "argo",
    title: "Fiat Argo Drive 2021",
    brand: "Fiat", model: "Argo Drive 1.0", year: 2021, value: 60000,
    mileage: 25000, city: "Campinas - SP",
    wants: [makeWant({ brand: "VW", model: "Polo" })],
  },
  {
    key: "renegade",
    title: "Jeep Renegade Sport 2019",
    brand: "Jeep", model: "Renegade Sport 1.8", year: 2019, value: 80000,
    mileage: 55000, city: "Curitiba - PR",
    wants: [makeWant({ brand: "Fiat", model: "Argo" })],
  },
  {
    key: "hb20",
    title: "Hyundai HB20 Vision 2022",
    brand: "Hyundai", model: "HB20 Vision 1.6", year: 2022, value: 75000,
    mileage: 18000, city: "Salvador - BA",
    wants: [makeWant({ brand: "Jeep", model: "Renegade" })],
  },
];

let seeded = false;
const ids = {};

async function seedFixture() {
  if (seeded) return;
  const owner = await user("dono@fixture.local", "Dono");
  for (const item of FIXTURE) {
    const res = await owner.postForm("/api/posts", postForm(item));
    assert.equal(res.status, 201, `fixture ${item.key}: ${JSON.stringify(res.body)}`);
    ids[item.key] = res.body.post.id;
  }
  seeded = true;
}

const list = async (query = "") => {
  const api = new Client(server());
  // Não repetir pageSize quando o teste já manda um: `?pageSize=50&pageSize=2`
  // faz o servidor ler o primeiro valor e o teste passar a medir outra coisa.
  const size = /(^|&)pageSize=/.test(query) ? "" : "pageSize=50";
  const qs = [size, query].filter(Boolean).join("&");
  const res = await api.get(`/api/posts${qs ? `?${qs}` : ""}`);
  assert.equal(res.status, 200);
  return res.body;
};

const titles = (body) => body.posts.map((p) => p.title).sort();

test("POST /api/posts: exige autenticação", async () => {
  const api = new Client(server());
  const res = await api.postForm("/api/posts", postForm());
  assert.equal(res.status, 401);
});

test("POST /api/posts: cria e devolve o anúncio", async () => {
  const api = await user("criador@test.local");
  const res = await api.postForm("/api/posts", postForm({ title: "Meu carro" }));
  assert.equal(res.status, 201);
  assert.equal(res.body.post.title, "Meu carro");
  assert.equal(res.body.post.isActive, true);
  assert.ok(res.body.post.id);
});

test("POST /api/posts: exige WhatsApp na conta (geração W)", async () => {
  if (!isW()) return;
  // Conta criada sem número não existe na W, então simulamos uma conta antiga
  // escrevendo direto no banco.
  const api = await user("semzap@post.local");
  const dataDir = server().dataDir;
  const { readFile, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(dataDir, "users.json");
  const users = JSON.parse(await readFile(file, "utf-8"));
  const target = users.find((u) => u.email === "semzap@post.local");
  delete target.whatsapp;
  await writeFile(file, JSON.stringify(users), "utf-8");

  const res = await api.postForm("/api/posts", postForm());
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "whatsapp_required");
});

test("POST /api/posts: valida os campos obrigatórios", async () => {
  const api = await user("valida@test.local");

  const semAno = postForm();
  semAno.set("year", "0");
  const a = await api.postForm("/api/posts", semAno);
  assert.equal(a.status, 400);
  assert.ok(a.body.fields?.year);

  const semValor = postForm();
  semValor.set("estimatedValue", "0");
  const b = await api.postForm("/api/posts", semValor);
  assert.equal(b.status, 400);
  assert.ok(b.body.fields?.estimatedValue);

  const semTitulo = postForm();
  semTitulo.set("title", "");
  const c = await api.postForm("/api/posts", semTitulo);
  assert.equal(c.status, 400);
  assert.ok(c.body.fields?.title);
});

test("POST /api/posts: exige ao menos uma opção de troca", async () => {
  const api = await user("semtroca@test.local");
  const form = postForm({ wants: [] });
  const res = await api.postForm("/api/posts", form);
  assert.equal(res.status, 400);
  assert.ok(res.body.fields?.vehicles);
});

test("POST /api/posts: aceita imagem válida", async () => {
  const api = await user("comfoto@test.local");
  const res = await api.postForm(
    "/api/posts",
    postForm({ images: [{ name: "foto.jpg", bytes: TINY_JPEG }] })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.post.images.length, 1);
  assert.match(res.body.post.images[0], /\.jpg$/);
});

test("POST /api/posts: rejeita extensão não-imagem", async () => {
  const api = await user("svg@test.local");
  const res = await api.postForm(
    "/api/posts",
    postForm({ images: [{ name: "x.svg", bytes: Buffer.from("<svg/>"), type: "image/svg+xml" }] })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Formato não suportado/);
});

test("POST /api/posts: rejeita .jpg que não é JPEG de verdade", async () => {
  const api = await user("falso@test.local");
  const res = await api.postForm(
    "/api/posts",
    postForm({ images: [{ name: "falso.jpg", bytes: Buffer.from("<html>nao</html>") }] })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error, /não é uma imagem válida/);
});

/* ─── Filtros ─────────────────────────────────────────────────── */

test("filtro q: busca em título, marca, modelo e cidade", async () => {
  await seedFixture();
  assert.ok((await list("q=honda")).posts.some((p) => p.title.includes("Honda")));
  assert.equal((await list("q=corolla")).posts.length, 1);
  assert.equal((await list("q=curitiba")).posts.length, 1, "cidade entra na busca");
  assert.equal((await list("q=zzzznaoexiste")).posts.length, 0);
});

test("filtro minPrice / maxPrice", async () => {
  await seedFixture();
  const caros = await list("minPrice=80000");
  assert.ok(caros.posts.every((p) => p.car.estimatedValue >= 80000));

  const baratos = await list("maxPrice=60000");
  assert.ok(baratos.posts.every((p) => p.car.estimatedValue <= 60000));

  const faixa = await list("minPrice=60000&maxPrice=80000");
  assert.ok(faixa.posts.every((p) => p.car.estimatedValue >= 60000 && p.car.estimatedValue <= 80000));
});

test("filtro brand: case-insensitive e por substring", async () => {
  await seedFixture();
  const r = await list("brand=honda");
  assert.ok(r.posts.length >= 1);
  assert.ok(r.posts.every((p) => p.car.brand.toLowerCase().includes("honda")));
});

test("filtro model: substring", async () => {
  await seedFixture();
  const r = await list("model=renegade");
  assert.ok(r.posts.length >= 1);
  assert.ok(r.posts.every((p) => p.car.model.toLowerCase().includes("renegade")));
});

test("filtro yearMin / yearMax", async () => {
  await seedFixture();
  const novos = await list("yearMin=2020");
  assert.ok(novos.posts.every((p) => p.car.year >= 2020));

  const antigos = await list("yearMax=2016");
  assert.ok(antigos.posts.every((p) => p.car.year <= 2016));
});

test("filtro mileageMin / mileageMax", async () => {
  await seedFixture();
  const rodados = await list("mileageMin=50000");
  assert.ok(rodados.posts.every((p) => (p.car.mileage ?? 0) >= 50000));

  const novos = await list("mileageMax=20000");
  assert.ok(novos.posts.every((p) => (p.car.mileage ?? Infinity) <= 20000));
});

test("filtro localization: estado exato", async () => {
  await seedFixture();
  const sp = await list("localization=São Paulo - SP");
  assert.ok(sp.posts.every((p) => p.car.localization.includes("SP")));
});

test("filtro localization + range: raio pequeno não traz outro estado", async () => {
  await seedFixture();
  const r = await list(`localization=${encodeURIComponent("São Paulo - SP")}&range=50`);
  assert.ok(r.posts.every((p) => !p.car.localization.includes("PR")));
  assert.ok(r.posts.every((p) => !p.car.localization.includes("BA")));
});

test("filtro localization + range grande: alcança vizinhos", async () => {
  await seedFixture();
  const r = await list(`localization=${encodeURIComponent("São Paulo - SP")}&range=500`);
  assert.ok(r.posts.length >= 3, "SP + PR + região entram no raio de 500 km");
});

test("filtro desiredType: só anúncios que aceitam o tipo", async () => {
  const api = await user("tipo@test.local");
  await api.postForm(
    "/api/posts",
    postForm({
      title: "Quer SUV",
      wants: [makeWant({ brand: "", model: "", vehicleType: "SUV" })],
    })
  );
  const r = await list("desiredType=suv");
  assert.ok(r.posts.length >= 1);
  assert.ok(
    r.posts.every((p) => p.desiredTrade.vehicles.some((v) => v.vehicleType === "SUV"))
  );
});

test("ordenação por valor", async () => {
  await seedFixture();
  const desc = await list("sortBy=value&sortOrder=desc");
  const values = desc.posts.map((p) => p.car.estimatedValue);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));

  const asc = await list("sortBy=value&sortOrder=asc");
  const ascValues = asc.posts.map((p) => p.car.estimatedValue);
  assert.deepEqual(ascValues, [...ascValues].sort((a, b) => a - b));
});

test("ordenação por ano e por quilometragem", async () => {
  await seedFixture();

  const ano = await list("sortBy=year&sortOrder=desc");
  const years = ano.posts.map((p) => p.car.year);
  assert.deepEqual(years, [...years].sort((a, b) => b - a));

  const km = await list("sortBy=mileage&sortOrder=asc");
  const kms = km.posts.map((p) => p.car.mileage ?? Infinity);
  assert.deepEqual(kms, [...kms].sort((a, b) => a - b));
});

test("paginação: page/pageSize/hasMore coerentes", async () => {
  await seedFixture();
  const p1 = await list("pageSize=2&page=1");
  assert.equal(p1.posts.length, 2);
  assert.equal(p1.page, 1);
  assert.ok(p1.total >= 5);
  assert.equal(p1.hasMore, true);

  const p2 = await list("pageSize=2&page=2");
  assert.equal(p2.page, 2);
  const ids1 = new Set(p1.posts.map((p) => p.id));
  assert.ok(p2.posts.every((p) => !ids1.has(p.id)), "páginas não se repetem");
});

test("pageSize é limitado no servidor", async () => {
  const r = await list("pageSize=9999");
  assert.ok(r.pageSize <= 48, "um cliente não pode pedir o banco inteiro");
});

test("filtro mine=1: só os anúncios do usuário logado", async () => {
  const api = await user("meus@test.local");
  await api.postForm("/api/posts", postForm({ title: "Só meu" }));

  const res = await api.get("/api/posts?mine=1");
  assert.equal(res.status, 200);
  assert.ok(res.body.posts.length >= 1);
  assert.ok(res.body.posts.every((p) => p.contactInfo?.email === "meus@test.local" || p.title === "Só meu"));
});

test("filtro mine=1 sem login → 401", async () => {
  const api = new Client(server());
  const res = await api.get("/api/posts?mine=1");
  assert.equal(res.status, 401);
});

test("GET /api/posts/[id]: devolve o anúncio", async () => {
  await seedFixture();
  const api = new Client(server());
  const r = await api.get(`/api/posts/${ids.fit}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.post.id, ids.fit);
});

test("GET /api/posts/[id]: id inexistente → 404", async () => {
  const api = new Client(server());
  const r = await api.get("/api/posts/nao-existe");
  assert.equal(r.status, 404);
});

test("PUT: só o dono edita", async () => {
  await seedFixture();
  const outro = await user("intruso@test.local");
  const form = postForm({ title: "Invadido" });
  const r = await outro.putForm(`/api/posts/${ids.fit}`, form);
  assert.equal(r.status, 403);
});

test("PUT: dono edita e a alteração persiste", async () => {
  const api = await user("editor@test.local");
  const criado = await api.postForm("/api/posts", postForm({ title: "Antes" }));
  const id = criado.body.post.id;

  const r = await api.putForm(`/api/posts/${id}`, postForm({ title: "Depois" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.post.title, "Depois");

  const relido = await api.get(`/api/posts/${id}`);
  assert.equal(relido.body.post.title, "Depois");
});

test("PUT: keepImages não aceita arquivo de outro anúncio (exploit bloqueado)", async () => {
  const vitima = await user("vitima@test.local");
  const alvo = await vitima.postForm(
    "/api/posts",
    postForm({ title: "Da vítima", images: [{ name: "v.jpg", bytes: TINY_JPEG }] })
  );
  const imagemDaVitima = alvo.body.post.images[0];

  const atacante = await user("atacante@test.local");
  const meu = await atacante.postForm(
    "/api/posts",
    postForm({ title: "Do atacante", images: [{ name: "a.jpg", bytes: TINY_JPEG }] })
  );
  const meuId = meu.body.post.id;

  const form = postForm({ title: "Do atacante" });
  form.set("keepImages", JSON.stringify([imagemDaVitima]));
  const r = await atacante.putForm(`/api/posts/${meuId}`, form);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.post.images, [], "só pode manter imagens que já eram suas");

  await atacante.del(`/api/posts/${meuId}`);
  const img = await fetch(`${server().base}/uploads/${imagemDaVitima}`);
  assert.equal(img.status, 200, "a foto da vítima continua no ar");
});

test("DELETE: só o dono exclui", async () => {
  const donoApi = await user("dono2@test.local");
  const criado = await donoApi.postForm("/api/posts", postForm({ title: "Apagar" }));
  const id = criado.body.post.id;

  const outro = await user("nao-dono@test.local");
  assert.equal((await outro.del(`/api/posts/${id}`)).status, 403);
  assert.equal((await donoApi.del(`/api/posts/${id}`)).status, 200);
  assert.equal((await donoApi.get(`/api/posts/${id}`)).status, 404);
});

test("DELETE sem login → 401", async () => {
  await seedFixture();
  const api = new Client(server());
  assert.equal((await api.del(`/api/posts/${ids.argo}`)).status, 401);
});
