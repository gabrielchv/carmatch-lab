/**
 * "Quem quer o carro que eu já tenho" — the reverse filter.
 *
 * Its own server because the fixture must be exact: a single permissive
 * vehicle-type want would otherwise match every car, which is correct
 * behaviour for the engine but useless for asserting a specific result.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { useServer } from "../lib/server.mjs";
import { Client, postForm, makeWant } from "../lib/harness.mjs";

// W_ONLY_GUARD: o filtro reverso só existe na geração WhatsApp.
const W_ONLY = (process.env.CARMATCH_TEST_VERSION ?? "w1").startsWith("w");
if (!W_ONLY) {
  test("(geração W) filtro reverso", (t) => t.skip("só existe na geração W"));
} else {

const server = useServer();
const isW = () => (process.env.CARMATEST ?? process.env.CARMATCH_TEST_VERSION ?? "w1").startsWith("w");

/**
 * A w6 trata acabamento como detalhe, não como carro: LT e LTZ com o mesmo
 * motor e câmbio são a mesma troca. É o que permite a lista curta de versões
 * sem inventar match — a equivalência é conferida aqui, não só no unitário.
 */
const SIMPLIFIED_FIPE = (process.env.CARMATCH_TEST_VERSION ?? "w1") === "w6";

async function user(email) {
  const api = new Client(server());
  await api.login({ name: "Dono", email, whatsapp: "+5511912345678" });
  return api;
}

let ready = false;

/** Three posts, each accepting a different car, and nothing permissive. */
async function seed() {
  if (ready) return;
  const api = await user("reverso@fixture.local");

  const posts = [
    {
      title: "Aceita Fiat Argo",
      wants: [makeWant({ brand: "Fiat", model: "Argo" })],
    },
    {
      title: "Aceita Honda Fit",
      wants: [makeWant({ brand: "Honda", model: "Fit" })],
    },
    {
      title: "Aceita Honda Fit 2020+",
      wants: [makeWant({ brand: "Honda", model: "Fit", yearMin: 2020, yearMax: 2026 })],
    },
  ];

  for (const p of posts) {
    const res = await api.postForm("/api/posts", postForm(p));
    assert.equal(res.status, 201, JSON.stringify(res.body));
  }
  ready = true;
}

const list = async (query) => {
  const api = new Client(server());
  const res = await api.get(`/api/posts?pageSize=50&${query}`);
  assert.equal(res.status, 200);
  return res.body;
};

test("encontra os anúncios que aceitam o carro informado", async () => {
  if (!isW()) return;
  await seed();
  const r = await list("wantsBrand=Honda&wantsModel=Fit");
  assert.equal(r.posts.length, 2, "os dois anúncios que aceitam Fit");
  assert.ok(r.posts.every((p) => p.title.startsWith("Aceita Honda Fit")));
});

test("carro que ninguém quer devolve vazio", async () => {
  if (!isW()) return;
  await seed();
  const r = await list("wantsBrand=Ferrari&wantsModel=F8");
  assert.equal(r.posts.length, 0);
});

test("marca sozinha amplia o resultado", async () => {
  if (!isW()) return;
  await seed();
  const soMarca = await list("wantsBrand=Fiat");
  assert.ok(soMarca.posts.length >= 1);

  const marcaEmodelo = await list("wantsBrand=Fiat&wantsModel=Argo");
  assert.ok(marcaEmodelo.posts.length <= soMarca.posts.length);
});

test("ano informado respeita o limite do anúncio", async () => {
  if (!isW()) return;
  await seed();

  const antigo = await list("wantsBrand=Honda&wantsModel=Fit&wantsYear=2015");
  assert.equal(antigo.posts.length, 1, "só o anúncio sem restrição de ano");

  const novo = await list("wantsBrand=Honda&wantsModel=Fit&wantsYear=2022");
  assert.equal(novo.posts.length, 2, "o que exige 2020+ também entra");
});

test("sem ano informado, o limite de ano do anúncio é ignorado", async () => {
  if (!isW()) return;
  await seed();
  const r = await list("wantsBrand=Honda&wantsModel=Fit");
  assert.equal(r.posts.length, 2, "o anúncio 2020+ não pode ser excluído por um ano que ninguém informou");
});

test("anúncio que exige transmissão continua encontrável (regressão)", async () => {
  if (!W_ONLY) return;
  // O bug: o anúncio pedia "Automático" e o filtro mandava só "TRACKER", que
  // nunca contém "Aut." — todo anúncio com transmissão ficava invisível.
  const api = await user("transmissao@fixture.local");
  const criado = await api.postForm(
    "/api/posts",
    postForm({
      title: "Quer Tracker automático",
      wants: [makeWant({ brand: "GM - Chevrolet", model: "TRACKER", transmission: "Automático" })],
    })
  );
  assert.equal(criado.status, 201, JSON.stringify(criado.body));

  // Marca + modelo geral (sem versão): a transmissão do anúncio é ignorada.
  const soModelo = await list("wantsBrand=GM - Chevrolet&wantsModel=TRACKER");
  assert.ok(
    soModelo.posts.some((p) => p.id === criado.body.post.id),
    "um anúncio que exige automático deve aparecer mesmo sem a versão"
  );
});

test("versão completa da FIPE casa pela transmissão", async () => {
  if (!W_ONLY) return;
  const automatico = await list(
    "wantsBrand=GM - Chevrolet&wantsModel=TRACKER&wantsVersion=" +
      encodeURIComponent("TRACKER LT 1.8 16V Flex 4x2 Aut.")
  );
  assert.ok(automatico.posts.length >= 1, "versão automática deve casar com o anúncio automático");

  const manual = await list(
    "wantsBrand=GM - Chevrolet&wantsModel=TRACKER&wantsVersion=" +
      encodeURIComponent("TRACKER 1.0 Turbo 12V Flex Mec.")
  );
  assert.equal(
    manual.posts.filter((p) => p.title === "Quer Tracker automático").length,
    0,
    "versão manual não pode casar com anúncio que exige automático"
  );
});

test("versão completa restringe corretamente dentro da mesma marca/modelo", async () => {
  if (!W_ONLY) return;
  const api = await user("versao@fixture.local");
  const soLtz = await api.postForm(
    "/api/posts",
    postForm({
      title: "Só quer LTZ",
      wants: [makeWant({ brand: "GM - Chevrolet", model: "TRACKER LTZ 1.8 16V Flex 4x2 Aut." })],
    })
  );
  assert.equal(soLtz.status, 201);

  const comoLtz = await list(
    "wantsBrand=GM - Chevrolet&wantsModel=TRACKER&wantsVersion=" +
      encodeURIComponent("TRACKER LTZ 1.8 16V Flex 4x2 Aut.")
  );
  assert.ok(comoLtz.posts.some((p) => p.id === soLtz.body.post.id));

  // Uma versão diferente não deve casar com quem pediu LTZ — exceto na w6, onde
  // LT e LTZ do mesmo motor/câmbio são o mesmo carro de propósito.
  const comoLt = await list(
    "wantsBrand=GM - Chevrolet&wantsModel=TRACKER&wantsVersion=" +
      encodeURIComponent("TRACKER LT 1.8 16V Flex 4x2 Aut.")
  );
  const acertosLt = comoLt.posts.filter((p) => p.id === soLtz.body.post.id).length;
  if (SIMPLIFIED_FIPE) {
    assert.equal(acertosLt, 1, "na w6, LT e LTZ do mesmo motor são a mesma troca");
  } else {
    assert.equal(acertosLt, 0, "LT não pode satisfazer quem pediu LTZ");
  }

  // O que continua separando carros na w6 é o motor: um Tracker 1.0 Turbo não
  // pode satisfazer quem pediu um 1.8.
  const outroMotor = await list(
    "wantsBrand=GM - Chevrolet&wantsModel=TRACKER&wantsVersion=" +
      encodeURIComponent("TRACKER 1.0 Turbo 12V Flex Aut.")
  );
  assert.equal(
    outroMotor.posts.filter((p) => p.id === soLtz.body.post.id).length,
    0,
    "motor diferente não pode casar"
  );
});

test("o filtro reverso combina com os outros filtros", async () => {
  if (!isW()) return;
  await seed();
  const r = await list("wantsBrand=Honda&wantsModel=Fit&maxPrice=1000");
  assert.equal(r.posts.length, 0, "preço máximo continua valendo junto");
});

test("sem nome de carro, o filtro não é aplicado", async () => {
  if (!isW()) return;
  await seed();
  const todos = await list("");
  const semFiltro = await list("wantsBrand=&wantsModel=");
  assert.equal(semFiltro.posts.length, todos.posts.length);
});

}
