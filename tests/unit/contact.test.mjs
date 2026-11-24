/**
 * Contact payload: which message gets built, and the states where no message
 * can be built at all. A dead button with no explanation is the failure mode
 * this guards against.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { load, VERSION } from "../lib/load.mjs";

// W_ONLY_GUARD: lib/contact.ts só existe na geração WhatsApp.
const W_ONLY = VERSION.startsWith("w");
if (!W_ONLY) {
  test("(geração W) funcionalidade ausente na geração V", (t) =>
    t.skip("este módulo só existe na geração W")
  );
} else {

const { buildContact, findMyMatchWith } = await load("contact");

const post = (over = {}) => ({
  id: over.id ?? "p1",
  userId: over.userId ?? "u1",
  title: "t",
  description: "",
  car: {
    brand: "Fiat",
    model: "Cronos",
    year: 2024,
    estimatedValue: 73000,
    ...(over.car ?? {}),
  },
  desiredTrade: { vehicles: [] },
  contactInfo: { whatsapp: over.whatsapp ?? "+5511912345678" },
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  isActive: true,
  ...over,
});

const ORIGIN = "https://carmatch.test";

test("sem match: usa a mensagem de interesse, mais curta", () => {
  const target = post({ id: "alvo", contactInfo: { whatsapp: "+5511999999999" } });
  const c = buildContact({ target, myPosts: [], matches: [], origin: ORIGIN });

  assert.equal(c.matched, false);
  assert.match(c.message, /Vi seu Fiat Cronos \(2024\) no CarMatch/);
  assert.ok(c.href.startsWith("https://wa.me/5511999999999?text="));
  assert.equal(c.unavailable, undefined);
});

test("com match: usa a mensagem completa, com link e acerto", () => {
  const mine = post({ id: "meu", userId: "u-me", car: { brand: "VW", model: "T-Cross", year: 2021, estimatedValue: 88000 } });
  const target = post({ id: "alvo", userId: "u-outro", contactInfo: { whatsapp: "+5511999999999" } });
  const match = {
    id: "m1",
    postAId: "alvo",
    postBId: "meu",
    score: 63,
    suggestedCashFromA: -15599,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const c = buildContact({ target, myPosts: [mine], matches: [match], origin: ORIGIN });

  assert.equal(c.matched, true);
  assert.match(c.message, /Demos match/);
  assert.match(c.message, /https:\/\/carmatch\.test\/posts\/meu/, "link do meu anúncio");
  assert.match(c.message, /Eu pago R\$ 15\.599/, "eu sou o lado B, então eu pago");
  assert.match(c.message, /Compatibilidade: 63%/);
});

test("direção do dinheiro segue quem é A e quem é B", () => {
  const mine = post({ id: "meu", car: { brand: "VW", model: "T-Cross", year: 2021, estimatedValue: 88000 } });
  const target = post({ id: "alvo" });

  // Eu sou o lado A: pago.
  const asA = buildContact({
    target,
    myPosts: [mine],
    matches: [{ id: "m", postAId: "meu", postBId: "alvo", score: 70, suggestedCashFromA: 9000, status: "pending", createdAt: "" }],
    origin: ORIGIN,
  });
  assert.match(asA.message, /Eu pago R\$ 9\.000/);

  // Eu sou o lado B: recebo.
  const asB = buildContact({
    target,
    myPosts: [mine],
    matches: [{ id: "m", postAId: "alvo", postBId: "meu", score: 70, suggestedCashFromA: 9000, status: "pending", createdAt: "" }],
    origin: ORIGIN,
  });
  assert.match(asB.message, /Você me paga R\$ 9\.000/);
});

test("anunciante sem WhatsApp: href null e motivo explícito", () => {
  const target = post({ contactInfo: { whatsapp: "" } });
  const c = buildContact({ target, myPosts: [], matches: [], origin: ORIGIN });
  assert.equal(c.href, null);
  assert.equal(c.unavailable, "no-whatsapp");
});

test("anunciante com WhatsApp inválido: também indisponível, não link quebrado", () => {
  const target = post({ contactInfo: { whatsapp: "123" } });
  const c = buildContact({ target, myPosts: [], matches: [], origin: ORIGIN });
  assert.equal(c.href, null);
  assert.equal(c.unavailable, "no-whatsapp");
});

test("número em formato bagunçado ainda gera link", () => {
  const target = post({ contactInfo: { whatsapp: "(11) 99999-9999" } });
  const c = buildContact({ target, myPosts: [], matches: [], origin: ORIGIN });
  assert.ok(c.href.includes("wa.me/5511999999999"));
});

test("findMyMatchWith: acha o meu anúncio dos dois lados do match", () => {
  const mine = post({ id: "meu" });
  const m = { id: "m", postAId: "alvo", postBId: "meu", score: 1, suggestedCashFromA: 0, status: "pending", createdAt: "" };
  const found = findMyMatchWith("alvo", [mine], [m]);
  assert.equal(found?.myPost.id, "meu");
  assert.equal(found?.match.id, "m");
});

test("findMyMatchWith: ignora match que não envolve o alvo", () => {
  const mine = post({ id: "meu" });
  const m = { id: "m", postAId: "outro", postBId: "meu", score: 1, suggestedCashFromA: 0, status: "pending", createdAt: "" };
  assert.equal(findMyMatchWith("alvo", [mine], [m]), null);
});

test("findMyMatchWith: ignora match entre dois anúncios que não são meus", () => {
  const notMine = post({ id: "nao-meu" });
  const m = { id: "m", postAId: "alvo", postBId: "nao-meu", score: 1, suggestedCashFromA: 0, status: "pending", createdAt: "" };
  assert.equal(findMyMatchWith("alvo", [], [m]), null);
  assert.equal(findMyMatchWith("alvo", [notMine], [m])?.myPost.id, "nao-meu");
});

}
