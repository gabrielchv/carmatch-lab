/**
 * `/api/fipe/models?simplified=1` — the endpoint the three-level picker reads.
 *
 * The assertions are about *contract*, not about Chevrolet's current catalogue:
 * FIPE changes monthly, so counting "20 versions of TRACKER" would rot. What
 * must stay true is the shape — every option carries the codes its year lookup
 * needs, every option is labelled uniquely, and the list is shorter than the raw
 * one without losing a single entry.
 *
 * Hits the real FIPE upstream. If the network is unavailable the test skips
 * rather than failing a build for something the code did not do.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { useServer } from "../lib/server.mjs";
import { Client } from "../lib/harness.mjs";

const VERSION = process.env.CARMATCH_TEST_VERSION ?? "w1";
const HAS_ENDPOINT = VERSION === "w6";

if (!HAS_ENDPOINT) {
  test("(w6) FIPE simplificada", (t) => t.skip("só existe na w6"));
} else {
  const server = useServer();
  // O servidor sobe no before() registrado por useServer, entao o client e
  // criado dentro de cada teste — nunca no topo do modulo.
  const api = () => new Client(server());

  const BRAND = "23"; // GM - Chevrolet: the largest list, so simplification shows.

  /* Memoised so each test names what it needs without a global hook. */
  let rawPromise = null;
  let simplifiedPromise = null;
  const getRaw = () => (rawPromise ??= api().req(`/api/fipe/models?brandId=${BRAND}`));
  const getSimplified = () =>
    (simplifiedPromise ??= api().req(`/api/fipe/models?brandId=${BRAND}&simplified=1`));

  test("lista crua continua sendo um array (compatibilidade)", async () => {
    const raw = await getRaw();
    if (raw.status === 502) return; // upstream fora do ar
    assert.equal(raw.status, 200);
    assert.ok(Array.isArray(raw.body), "sem [?simplified=1] a resposta não mudou");
    assert.ok(raw.body.length > 50);
    assert.ok(raw.body.every((m) => "codigo" in m && "nome" in m));
  });

  test("brandId ausente é erro de cliente", async () => {
    const res = await api().req("/api/fipe/models?simplified=1");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /brandId/i);
  });

  test("?simplified=1 devolve linhas e estatísticas", async () => {
    const simplified = await getSimplified();
    if (simplified.status === 502) return;

    assert.equal(simplified.status, 200);
    assert.equal(simplified.body.brandId, BRAND);
    assert.ok(Array.isArray(simplified.body.lines));
    assert.ok(simplified.body.lines.length > 0);
    assert.ok(simplified.body.stats);
  });

  test("simplificar encurta a lista sem perder entradas", async () => {
    const raw = await getRaw();
    const simplified = await getSimplified();
    if (raw.status === 502 || simplified.status !== 200) return;
    const { stats, lines } = simplified.body;
    const options = lines.flatMap((l) => l.versions);

    assert.ok(stats.after < stats.before, "deveria haver redução");
    assert.equal(stats.after, options.length, "stats.after conta o que veio");
    assert.equal(stats.lines, lines.length, "stats.lines conta o que veio");

    // Todo modelo cru aparece em exatamente uma opção.
    const codes = options.flatMap((v) => v.codes);
    assert.equal(new Set(codes).size, codes.length, "nenhum código repetido");
    const rawCodes = new Set(raw.body.map((m) => String(m.codigo)));
    for (const code of rawCodes) {
      assert.ok(codes.includes(code), `código cru ${code} ausente da resposta`);
    }
  });

  test("toda opção traz o código que o seletor de ano vai usar", async () => {
    const simplified = await getSimplified();
    if (simplified.status !== 200) return;
    for (const line of simplified.body.lines) {
      assert.ok(line.key, "linha sem chave");
      assert.ok(line.name, "linha sem nome");
      assert.ok(line.versions.length > 0, `linha ${line.name} vazia`);

      for (const v of line.versions) {
        assert.ok(v.codes.includes(v.code), `${v.label}: código fora de codes`);
        assert.equal(v.codes.length, v.members.length, `${v.label}: codes/members desalinhados`);
        assert.ok(v.fullName, `${v.label}: sem nome FIPE representativo`);
        // Opções que o tokenizador não conseguiu ler mantêm o nome cru da FIPE
        // (é honesto: não dá para afirmar câmbio de um nome ambíguo).
        if (!v.key.startsWith("raw:")) {
          assert.match(v.label, / · (Aut|Mec)\.$/, `${v.label}: rótulo sem câmbio`);
        }
        // null = nome indecomponível: não dá para afirmar câmbio.
        assert.ok(
          v.transmission === null || ["auto", "manual"].includes(v.transmission),
          `${v.label}: câmbio inesperado ${JSON.stringify(v.transmission)}`
        );
      }
    }
  });

  test("rótulos e chaves são únicos dentro da marca", async () => {
    const simplified = await getSimplified();
    if (simplified.status !== 200) return;
    const options = simplified.body.lines.flatMap((l) => l.versions);
    assert.equal(new Set(options.map((v) => v.label)).size, options.length);
    assert.equal(new Set(options.map((v) => v.key)).size, options.length);
  });

  test("nenhuma versão da FIPE fica inalcançável no seletor", async () => {
    // O agrupamento é um atalho, não um corte: cada entrada crua precisa
    // aparecer em `codes`/`members` de alguma opção, porque é por lá que a lista
    // de "Versão exata" do picker é montada.
    const raw = await getRaw();
    const simplified = await getSimplified();
    if (raw.status === 502 || simplified.status !== 200) return;

    const byCode = new Map(raw.body.map((m) => [String(m.codigo), m.nome.trim()]));
    const reachable = new Map();
    for (const line of simplified.body.lines) {
      for (const v of line.versions) {
        assert.equal(v.codes.length, v.members.length, `${v.label}: códigos e nomes desalinhados`);
        v.codes.forEach((code, i) => reachable.set(code, v.members[i]));
      }
    }

    assert.equal(reachable.size, byCode.size, "alguma entrada crua não aparece");
    for (const [code, name] of byCode) {
      assert.equal(reachable.get(code), name, `código ${code} com nome diferente`);
    }
  });

  test("a versão representativa é um nome FIPE que existe", async () => {
    const raw = await getRaw();
    const simplified = await getSimplified();
    if (raw.status === 502 || simplified.status !== 200) return;
    // A FIPE devolve alguns nomes com espaço sobrando; a opção mostra o nome
    // aparado, que é o que o anúncio grava.
    const byCode = new Map(raw.body.map((m) => [String(m.codigo), m.nome.trim()]));
    for (const line of simplified.body.lines) {
      for (const v of line.versions) {
        assert.equal(byCode.get(v.code), v.fullName, v.label);
      }
    }
  });
}
