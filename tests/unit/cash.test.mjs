/**
 * The cash direction is the single most-confused value in a car swap, and it
 * was genuinely inverted in the original code. These tests are the guard.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../lib/load.mjs";

const cash = await load("cash");

const match = (a, b, amount) => ({
  id: "m",
  postAId: a,
  postBId: b,
  score: 70,
  suggestedCashFromA: amount,
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
});

test("viewerDelta: cada lado vê o oposto", () => {
  const m = match("A", "B", 8000);
  assert.equal(cash.viewerDelta(m, "A"), 8000);
  assert.equal(cash.viewerDelta(m, "B"), -8000);
});

test("viewerDelta: soma zero entre os dois lados", () => {
  for (const amount of [0, 500, -500, 12345, -98765]) {
    const m = match("A", "B", amount);
    assert.equal(cash.viewerDelta(m, "A") + cash.viewerDelta(m, "B"), 0);
  }
});

test("viewerCashLabel: 'paga' e 'recebe' nunca aparecem do lado errado", () => {
  const m = match("A", "B", 18826);
  assert.match(cash.viewerCashLabel(m, "A"), /^Você paga R\$ 18\.826/);
  assert.match(cash.viewerCashLabel(m, "B"), /^Você recebe R\$ 18\.826/);
});

test("viewerCashLabel: zero vira troca direta", () => {
  assert.match(cash.viewerCashLabel(match("A", "B", 0), "A"), /Troca direta/);
});

test("ownerCashLabel: fala do anúncio, não do visitante", () => {
  assert.match(cash.ownerCashLabel(5000), /^Paga R\$ 5\.000/);
  assert.match(cash.ownerCashLabel(-5000), /^Recebe R\$ 5\.000/);
  assert.match(cash.ownerCashLabel(0, 0), /Troca direta/);
});

test("ownerCashLabel: mostra a tolerância quando existe", () => {
  assert.match(cash.ownerCashLabel(5000, 500), /± R\$ 500/);
  assert.doesNotMatch(cash.ownerCashLabel(5000, 0), /±/);
});

test("shortCashLabel: sinal explícito e compacto", () => {
  assert.equal(cash.shortCashLabel(18826), "+ R$ 18.826");
  assert.equal(cash.shortCashLabel(-18826), "− R$ 18.826");
  assert.equal(cash.shortCashLabel(0), "troca direta");
});

test("formatBRL: agrupa milhar no padrão brasileiro", () => {
  assert.equal(cash.formatBRL(1234567), "1.234.567");
  assert.equal(cash.formatBRL(0), "0");
  assert.equal(cash.formatBRL(999.6), "1.000", "arredonda como dinheiro");
});
