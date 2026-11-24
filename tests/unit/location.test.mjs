/**
 * Location parsing and proximity. A wrong parse silently hides listings from
 * an entire state, which looks like "the site is empty" rather than a bug.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../lib/load.mjs";

const loc = await load("location-utils");
const adj = await load("brazil-adjacency");

test("parseLocalization: formatos reais que o app grava", async (t) => {
  const cases = [
    ["São Paulo - SP", { city: "São Paulo", state: "SP" }],
    ["São Paulo, SP", { city: "São Paulo", state: "SP" }],
    ["Campinas-SP", { city: "Campinas", state: "SP" }],
    ["SP", { city: "", state: "SP" }],
    ["sp", { city: "", state: "SP" }],
    ["", { city: "", state: "" }],
  ];
  for (const [input, expected] of cases) {
    await t.test(JSON.stringify(input), () => {
      assert.deepEqual(loc.parseLocalization(input), expected);
    });
  }
});

test("parseLocalization: cidade com hífen no nome não quebra", () => {
  const r = loc.parseLocalization("Embu-Guaçu - SP");
  assert.equal(r.state, "SP");
  assert.equal(r.city, "Embu-Guaçu");
});

test("isInProximity: mesmo estado, raio zero, casa", () => {
  assert.equal(loc.isInProximity("Campinas - SP", "SP", null, 0), true);
});

test("isInProximity: estado diferente, raio zero, reprova", () => {
  assert.equal(loc.isInProximity("Curitiba - PR", "SP", null, 0), false);
});

test("isInProximity: mesmo estado e cidade exata", () => {
  assert.equal(loc.isInProximity("São Paulo - SP", "SP", "São Paulo", 0), true);
});

test("isInProximity: cidade diferente no mesmo estado reprova no modo exato", () => {
  assert.equal(loc.isInProximity("Campinas - SP", "SP", "São Paulo", 0), false);
});

test("isInProximity: anúncio sem estado é excluído do filtro", () => {
  assert.equal(loc.isInProximity("", "SP", null, 100), false);
  assert.equal(loc.isInProximity("Lugar Nenhum", "SP", null, 100), false);
});

test("isInProximity: raio grande inclui estado vizinho", () => {
  // PR é vizinho de SP
  assert.equal(loc.isInProximity("Curitiba - PR", "SP", null, 200), true);
});

test("isInProximity: raio enorme inclui o país inteiro", () => {
  assert.equal(loc.isInProximity("Manaus - AM", "SP", null, 900), true);
});

test("getNearbyStates: degraus de distância", () => {
  assert.deepEqual(loc.getNearbyStates("SP", 0, false), ["SP"]);
  assert.deepEqual(loc.getNearbyStates("SP", 100, false), ["SP"]);
  const near = loc.getNearbyStates("SP", 200, false);
  assert.ok(near.includes("SP") && near.includes("PR") && near.includes("RJ"));
  const region = loc.getNearbyStates("SP", 600, false);
  assert.ok(region.includes("MG") && region.includes("ES"), "região Sudeste inteira");
  assert.deepEqual(loc.getNearbyStates("SP", 900, false), [], "todo o Brasil = sem filtro");
});

test("adjacência: relação é simétrica para todos os pares declarados", () => {
  const ufs = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
  for (const a of ufs) {
    for (const b of ufs) {
      if (adj.areAdjacent(a, b)) {
        assert.equal(adj.areAdjacent(b, a), true, `${a}->${b} deveria ser simétrico`);
      }
    }
  }
});

test("adjacência: um estado é adjacente a si mesmo", () => {
  assert.equal(adj.areAdjacent("SP", "SP"), true);
});

test("adjacência: estados sem fronteira não são adjacentes", () => {
  assert.equal(adj.areAdjacent("SP", "AM"), false);
  assert.equal(adj.areAdjacent("RS", "BA"), false);
});
