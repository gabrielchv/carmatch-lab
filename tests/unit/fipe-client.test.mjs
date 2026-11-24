/**
 * The FIPE client against a deliberately broken upstream.
 *
 * The whole point of this file is the failure paths: the app broke with a
 * generic "Não foi possível carregar os modelos" because a `429` from the free
 * FIPE quota was returned as if it were data, and `.modelos.sort()` threw a
 * TypeError inside the route.
 *
 * A local HTTP server plays the misbehaving upstream: it can answer 429 once and
 * then succeed, answer 429 forever, or answer 200 with the wrong shape. No
 * network, no quota, and the retry timings are short by design.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";

const VERSION = process.env.CARMATCH_TEST_VERSION ?? "w1";
import { pathToFileURL } from "node:url";
import { LAB } from "../lib/harness.mjs";

/** Load the module with a base URL pointing at the fake server. */
async function loadClient(base, fallback = "off") {
  process.env.FIPE_API_BASE = base;
  // Off by default here: these tests are about the *primary* failure path.
  process.env.FIPE_FALLBACK_BASE = fallback;
  const mod = await import(
    pathToFileURL(path.join(LAB, VERSION, "lib", "fipe-api.ts")).href
  );
  return mod;
}

/**
 * Capability, not existence: every version has a lib/fipe-api.ts, but only the
 * one with typed failures and a retry policy behaves like this. A version whose
 * client returns error bodies as data would fail these assertions — correctly,
 * because that is the defect being pinned.
 */
const hasClient = await (async () => {
  try {
    const mod = await import(
      pathToFileURL(path.join(LAB, VERSION, "lib", "fipe-api.ts")).href
    );
    return typeof mod.FipeUnavailableError === "function";
  } catch {
    return false;
  }
})();

const SKIP = { skip: hasClient ? false : "esta versão não tem lib/fipe-api.ts com retry" };

/** Start a throwaway HTTP server and return its base plus a stop(). */
async function fakeFipe(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    handler(req, res, requests.length);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

test("429 na primeira tentativa é repetido e a segunda vence", SKIP, async () => {
  const fake = await fakeFipe((req, res, n) => {
    if (n === 1) return json(res, 429, { error: "limite de taxa excedido" });
    return json(res, 200, { modelos: [{ codigo: 1, nome: "Gol 1.0" }] });
  });
  try {
    const { fetchFipeModels } = await loadClient(fake.base);
    const models = await fetchFipeModels("59");

    assert.equal(models.length, 1);
    assert.equal(models[0].nome, "Gol 1.0");
    assert.equal(fake.requests.length, 2, "a primeira resposta 429 foi repetida");
  } finally {
    await fake.stop();
  }
});

test("429 permanente vira FipeUnavailableError, não TypeError", SKIP, async () => {
  const fake = await fakeFipe((req, res) => json(res, 429, { error: "limite" }));
  try {
    const { fetchFipeModels, FipeUnavailableError } = await loadClient(fake.base);

    // O bug original: o corpo {error} era lido como se fosse {modelos} e
    // `.sort()` estourava com "Cannot read properties of undefined".
    await assert.rejects(
      () => fetchFipeModels("59"),
      (err) => {
        assert.ok(err instanceof FipeUnavailableError, `esperava erro tipado, veio ${err}`);
        assert.equal(err.status, 429);
        return true;
      }
    );
  } finally {
    await fake.stop();
  }
});

test("429 é respeitado: o cliente tenta mais de uma vez antes de desistir", SKIP, async () => {
  const fake = await fakeFipe((req, res) => json(res, 429, { error: "limite" }));
  try {
    const { fetchFipeModels } = await loadClient(fake.base);
    await assert.rejects(() => fetchFipeModels("59"));
    // Duas: uma tentativa cobriria uma rajada; insistir três vezes só faria o
    // usuário esperar segundos para ouvir o mesmo "limite excedido".
    assert.equal(fake.requests.length, 2, "duas tentativas antes de desistir");
  } finally {
    await fake.stop();
  }
});

test("404 é definitivo: não insiste e não vira 'indisponível'", SKIP, async () => {
  const fake = await fakeFipe((req, res) => json(res, 404, { error: "não encontrado" }));
  try {
    const { fetchFipeModels, FipeUnavailableError } = await loadClient(fake.base);
    await assert.rejects(
      () => fetchFipeModels("999"),
      (err) => {
        assert.ok(err instanceof FipeUnavailableError);
        assert.equal(err.status, 404);
        return true;
      }
    );
    assert.equal(fake.requests.length, 1, "4xx de cliente não deve ser repetido");
  } finally {
    await fake.stop();
  }
});

test("corpo 200 sem `modelos` é erro tipado, não crash", SKIP, async () => {
  const fake = await fakeFipe((req, res) => json(res, 200, { error: "algo estranho" }));
  try {
    const { fetchFipeModels, FipeUnavailableError } = await loadClient(fake.base);
    await assert.rejects(
      () => fetchFipeModels("59"),
      (err) => err instanceof FipeUnavailableError
    );
  } finally {
    await fake.stop();
  }
});

test("HTML no lugar de JSON não derruba o cliente", SKIP, async () => {
  const fake = await fakeFipe((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>manutenção</html>");
  });
  try {
    const { fetchFipeModels, FipeUnavailableError } = await loadClient(fake.base);
    await assert.rejects(
      () => fetchFipeModels("59"),
      (err) => err instanceof FipeUnavailableError
    );
  } finally {
    await fake.stop();
  }
});

test("marcas: lista vazia é aceita, formato errado não", SKIP, async () => {
  const empty = await fakeFipe((req, res) => json(res, 200, []));
  try {
    const { fetchFipeBrands, FipeUnavailableError } = await loadClient(empty.base);
    assert.deepEqual(await fetchFipeBrands(), []);
    assert.ok(FipeUnavailableError);
  } finally {
    await empty.stop();
  }

  const wrong = await fakeFipe((req, res) => json(res, 200, { marcas: [] }));
  try {
    const { fetchFipeBrands, FipeUnavailableError } = await loadClient(wrong.base);
    await assert.rejects(
      () => fetchFipeBrands(),
      (err) => err instanceof FipeUnavailableError
    );
  } finally {
    await wrong.stop();
  }
});

test("preço: corpo sem Valor é recusado", SKIP, async () => {
  const fake = await fakeFipe((req, res) => json(res, 200, { Modelo: "Gol" }));
  try {
    const { fetchFipePrice, FipeUnavailableError } = await loadClient(fake.base);
    await assert.rejects(
      () => fetchFipePrice("59", "1", "2020-1"),
      (err) => err instanceof FipeUnavailableError
    );
  } finally {
    await fake.stop();
  }
});

/* ─── Second source (BrasilAPI shape) ─────────────────────────── */

test("primária fora: a segunda fonte entrega as marcas", SKIP, async () => {
  const primary = await fakeFipe((req, res) => json(res, 429, { error: "limite" }));
  const secondary = await fakeFipe((req, res) =>
    json(res, 200, [
      { nome: "Ford", valor: "22" },
      { nome: "VW - VolksWagen", valor: "59" },
    ])
  );
  try {
    const { fetchFipeBrands } = await loadClient(primary.base, secondary.base);
    const brands = await fetchFipeBrands();

    assert.deepEqual(
      brands.map((b) => [b.codigo, b.nome]),
      [
        ["22", "Ford"],
        ["59", "VW - VolksWagen"],
      ]
    );
    assert.ok(secondary.requests.length > 0, "a segunda fonte foi consultada");
  } finally {
    await primary.stop();
    await secondary.stop();
  }
});

test("primária fora: a segunda fonte entrega modelos com os mesmos códigos", SKIP, async () => {
  const primary = await fakeFipe((req, res) => json(res, 429, { error: "limite" }));
  const secondary = await fakeFipe((req, res) =>
    json(res, 200, [
      { modelo: "AMAROK 2.0 TDI", valor: "5585" },
      { modelo: "GOL 1.0", valor: "9001" },
    ])
  );
  try {
    const { fetchFipeModels } = await loadClient(primary.base, secondary.base);
    const models = await fetchFipeModels("59");

    assert.deepEqual(
      models.map((m) => [m.codigo, m.nome]),
      [
        [5585, "AMAROK 2.0 TDI"],
        [9001, "GOL 1.0"],
      ]
    );
    assert.equal(typeof models[0].codigo, "number", "código precisa ser numérico");
  } finally {
    await primary.stop();
    await secondary.stop();
  }
});

test("404 na primária NÃO cai para a segunda fonte", SKIP, async () => {
  // Um 404 diz que a marca não existe. Perguntar a outra fonte poderia criar
  // um anúncio contra um modelo que o catálogo principal não tem.
  const primary = await fakeFipe((req, res) => json(res, 404, { error: "não existe" }));
  const secondary = await fakeFipe((req, res) =>
    json(res, 200, [{ modelo: "Inventado", valor: "1" }])
  );
  try {
    const { fetchFipeModels, FipeUnavailableError } = await loadClient(
      primary.base,
      secondary.base
    );
    await assert.rejects(
      () => fetchFipeModels("999"),
      (err) => err instanceof FipeUnavailableError && err.status === 404
    );
    assert.equal(secondary.requests.length, 0, "a segunda fonte não deve ser chamada");
  } finally {
    await primary.stop();
    await secondary.stop();
  }
});

test("as duas fontes fora: o erro continua sendo de indisponibilidade", SKIP, async () => {
  const primary = await fakeFipe((req, res) => json(res, 429, { error: "limite" }));
  const secondary = await fakeFipe((req, res) => json(res, 503, { message: "fora" }));
  try {
    const { fetchFipeModels, FipeUnavailableError } = await loadClient(
      primary.base,
      secondary.base
    );
    await assert.rejects(
      () => fetchFipeModels("59"),
      (err) => err instanceof FipeUnavailableError
    );
  } finally {
    await primary.stop();
    await secondary.stop();
  }
});

test("a segunda fonte não pode devolver lixo", SKIP, async () => {
  const primary = await fakeFipe((req, res) => json(res, 429, { error: "limite" }));
  const secondary = await fakeFipe((req, res) => json(res, 200, { modelos: [] }));
  try {
    const { fetchFipeModels, FipeUnavailableError } = await loadClient(
      primary.base,
      secondary.base
    );
    await assert.rejects(
      () => fetchFipeModels("59"),
      (err) => err instanceof FipeUnavailableError
    );
  } finally {
    await primary.stop();
    await secondary.stop();
  }
});

test("depois de um 429, a próxima chamada não bate na fonte de novo", SKIP, async () => {
  // Sem o disjuntor, cada marca pagaria os mesmos segundos de retry para
  // aprender a mesma coisa — 8s por marca no seletor.
  const fake = await fakeFipe((req, res) => json(res, 429, { error: "limite" }));
  try {
    const { fetchFipeModels } = await loadClient(fake.base);
    await assert.rejects(() => fetchFipeModels("59"));
    const afterFirst = fake.requests.length;
    assert.equal(afterFirst, 2);

    await assert.rejects(() => fetchFipeModels("22"));
    assert.equal(fake.requests.length, afterFirst, "a fonte está em descanso");
  } finally {
    await fake.stop();
  }
});
