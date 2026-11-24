/**
 * The onboarding preview is the first thing a stranger sees. Every branch of
 * it — including "I don't know what I want" — has its own wording and its own
 * way of being wrong.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { load, VERSION } from "../lib/load.mjs";

// W_ONLY_GUARD: lib/onboarding.ts só existe na geração WhatsApp.
const W_ONLY = VERSION.startsWith("w");
if (!W_ONLY) {
  test("(geração W) funcionalidade ausente na geração V", (t) =>
    t.skip("este módulo só existe na geração W")
  );
} else {

const { previewMatches } = await load("onboarding");

const post = (over = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  userId: "u1",
  title: "t",
  description: "",
  car: {
    brand: "Fiat",
    model: "Cronos Drive 1.0",
    year: 2024,
    estimatedValue: 73000,
    mileage: 20000,
    localization: "São Paulo - SP",
    ...(over.car ?? {}),
  },
  desiredTrade: { vehicles: over.wants ?? [] },
  contactInfo: { whatsapp: "+5511912345678" },
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  isActive: over.isActive ?? true,
});

const wantCronos = {
  brand: "Fiat",
  model: "Cronos",
  cashAdjustment: 0,
  cashAdjustmentTolerance: 1000,
};

test("recíproco: os dois lados se querem → matches", () => {
  const posts = [
    post({
      id: "outro",
      car: { brand: "VW", model: "T-Cross 1.0", year: 2021, estimatedValue: 88000 },
      wants: [{ brand: "Fiat", model: "Cronos", cashAdjustment: -15000, cashAdjustmentTolerance: 1000 }],
    }),
  ];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    want: { brand: "VW", model: "T-Cross" },
  });
  assert.equal(r.outcome, "reciprocal");
  assert.equal(r.matches.length, 1);
  assert.equal(r.theyWantMine.length, 0);
  assert.equal(r.iWantTheirs.length, 0);
  assert.equal(r.wantSkipped, false);
});

test("só entrada: querem o meu, eu não quero o deles → inbound-only", () => {
  const posts = [
    post({
      car: { brand: "Jeep", model: "Renegade 1.8", year: 2019, estimatedValue: 69000 },
      wants: [wantCronos],
    }),
  ];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    want: { brand: "Toyota", model: "Corolla" },
  });
  assert.equal(r.outcome, "inbound-only");
  assert.equal(r.theyWantMine.length, 1);
  assert.equal(r.matches.length, 0);
});

test("só saída: eu quero o deles, ninguém quer o meu → outbound-only", () => {
  const posts = [
    post({
      car: { brand: "VW", model: "T-Cross 1.0", year: 2021, estimatedValue: 88000 },
      wants: [{ brand: "Honda", model: "Civic", cashAdjustment: 0, cashAdjustmentTolerance: 0 }],
    }),
  ];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    want: { brand: "VW", model: "T-Cross" },
  });
  assert.equal(r.outcome, "outbound-only");
  assert.equal(r.iWantTheirs.length, 1);
  assert.equal(r.matches.length, 0);
});

test("sem querer nada: só 'quem quer o meu' → wantSkipped e inbound-only", () => {
  const posts = [
    post({ car: { brand: "Jeep", model: "Renegade", year: 2019 }, wants: [wantCronos] }),
    post({ car: { brand: "Fiat", model: "Argo", year: 2021 }, wants: [wantCronos] }),
  ];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos", year: 2024 } });
  assert.equal(r.wantSkipped, true);
  assert.equal(r.outcome, "inbound-only");
  assert.equal(r.theyWantMine.length, 2);
  assert.equal(r.iWantTheirs.length, 0, "sem carro desejado não existe direção de saída");
  assert.equal(r.matches.length, 0);
});

test("sem querer nada e ninguém querendo: no-match, não outbound-only", () => {
  const posts = [post({ car: { brand: "Jeep", model: "Renegade" }, wants: [] })];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos", year: 2024 } });
  assert.equal(r.wantSkipped, true);
  assert.equal(r.outcome, "no-match");
});

test("sem querer nada não inventa matches mesmo quando o carro é desejado", () => {
  // O anúncio quer exatamente o meu carro. Sem um 'want', isso é inbound, não
  // match — chamar de match prometeria reciprocidade que não foi perguntada.
  const posts = [post({ car: { brand: "Jeep", model: "Renegade" }, wants: [wantCronos] })];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos", year: 2024 } });
  assert.equal(r.matches.length, 0);
  assert.equal(r.theyWantMine.length, 1);
});

/* ─── Faixa de valor como alternativa ao carro ─────────────────── */

/**
 * Anúncio que NÃO aceita o meu carro (quer um Jeep), para isolar a pergunta de
 * saída: só a faixa de valor pode trazê-lo para `iWantTheirs`.
 */
const postNoValor = (valor, over = {}) =>
  post({
    car: { brand: "VW", model: "Polo", year: 2021, estimatedValue: valor },
    wants: [{ brand: "Jeep", model: "Renegade", cashAdjustment: 0, cashAdjustmentTolerance: 0 }],
    ...over,
  });

test("faixa de valor: entra quando o valor do anúncio está dentro", () => {
  const posts = [postNoValor(85000)];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    wantRange: { min: 80000, max: 120000 },
  });
  assert.equal(r.wantMode, "price");
  assert.equal(r.iWantTheirs.length, 1);
});

test("faixa de valor: fica de fora quando o valor está fora", () => {
  const posts = [postNoValor(50000)];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    wantRange: { min: 80000, max: 120000 },
  });
  assert.equal(r.iWantTheirs.length, 0);
});

test("faixa de valor: só teto é uma resposta válida", () => {
  const posts = [postNoValor(55000), postNoValor(95000)];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    wantRange: { max: 60000 },
  });
  assert.equal(r.wantMode, "price");
  assert.equal(r.iWantTheirs.length, 1, "só o de 55 mil entra no teto de 60");
});

test("faixa de valor: só piso é uma resposta válida", () => {
  const posts = [postNoValor(55000), postNoValor(95000)];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    wantRange: { min: 90000 },
  });
  assert.equal(r.iWantTheirs.length, 1, "só o de 95 mil entra no piso de 90");
});

test("faixa de valor: limites são inclusivos", () => {
  const posts = [postNoValor(80000), postNoValor(120000)];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    wantRange: { min: 80000, max: 120000 },
  });
  assert.equal(r.iWantTheirs.length, 2);
});

test("faixa de valor também gera match quando o outro lado aceita meu carro", () => {
  const posts = [
    post({
      car: { brand: "VW", model: "Polo", year: 2021, estimatedValue: 85000 },
      wants: [wantCronos], // aceita meu Cronos e está na faixa
    }),
  ];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    wantRange: { min: 80000, max: 120000 },
  });
  assert.equal(r.outcome, "reciprocal");
  assert.equal(r.matches.length, 1);
  assert.equal(r.wantMode, "price");
});

test("carro específico tem precedência sobre a faixa se os dois vierem", () => {
  // O carro é a afirmação mais específica: o anúncio é um Polo de 73 mil, fora
  // da faixa 80–120, mas é o modelo Polo, que é o que a pessoa pediu.
  const posts = [postNoValor(73000)];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    want: { brand: "VW", model: "Polo" },
    wantRange: { min: 80000, max: 120000 },
  });
  assert.equal(r.wantMode, "car");
  assert.equal(r.iWantTheirs.length, 1, "casou pelo modelo, não pela faixa");
});

test("sem carro e sem faixa → none, e a pergunta não é feita", () => {
  const posts = [postNoValor(85000)];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos", year: 2024 } });
  assert.equal(r.wantMode, "none");
  assert.equal(r.wantSkipped, true);
  assert.equal(r.iWantTheirs.length, 0);
});

test("lista vazia → no-posts (e não 'nenhum match')", () => {
  const r = previewMatches([], {
    have: { brand: "Fiat", model: "Cronos" },
    want: { brand: "VW", model: "T-Cross" },
  });
  assert.equal(r.outcome, "no-posts");
  assert.equal(r.considered, 0);
});

test("anúncios inativos são ignorados", () => {
  const posts = [post({ wants: [wantCronos], isActive: false })];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos", year: 2024 } });
  assert.equal(r.considered, 0);
  assert.equal(r.outcome, "no-posts");
});

test("ano desconhecido não rejeita anúncio por causa do ano", () => {
  // O anúncio exige ano >= 2022, mas o visitante não informou o ano do carro.
  // Usar um ano-placeholder reprovaria um match que existe de verdade.
  const posts = [
    post({
      car: { brand: "Jeep", model: "Renegade", year: 2020 },
      wants: [{ ...wantCronos, yearMin: 2022, yearMax: 2026 }],
    }),
  ];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos" } });
  assert.equal(r.theyWantMine.length, 1, "sem ano informado, o limite de ano é ignorado");
});

test("ano informado respeita o limite", () => {
  const posts = [
    post({
      car: { brand: "Jeep", model: "Renegade", year: 2020 },
      wants: [{ ...wantCronos, yearMin: 2022, yearMax: 2026 }],
    }),
  ];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos", year: 2019 } });
  assert.equal(r.theyWantMine.length, 0);
});

test("filtro de área: cidade/estado diferente é excluído quando há raio", () => {
  const posts = [
    post({ car: { brand: "Jeep", model: "Renegade", localization: "Salvador - BA" }, wants: [wantCronos] }),
  ];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    city: "São Paulo - SP",
    radiusKm: 100,
  });
  assert.equal(r.considered, 0);
});

test("filtro de área: mesmo estado passa sem raio", () => {
  const posts = [
    post({ car: { brand: "Jeep", model: "Renegade", localization: "Campinas - SP" }, wants: [wantCronos] }),
  ];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    city: "São Paulo - SP",
  });
  assert.equal(r.considered, 1);
});

test("filtro de área: anúncio sem localização é mantido (não dá para provar que é longe)", () => {
  const p = post({ wants: [wantCronos] });
  delete p.car.localization;
  const r = previewMatches([p], {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    city: "São Paulo - SP",
    radiusKm: 50,
  });
  assert.equal(r.considered, 1);
});

test("ordenação: mais valioso primeiro, em todas as listas", () => {
  const posts = [
    post({ id: "a", car: { brand: "Jeep", model: "Renegade", estimatedValue: 50000 }, wants: [wantCronos] }),
    post({ id: "b", car: { brand: "Jeep", model: "Renegade", estimatedValue: 90000 }, wants: [wantCronos] }),
  ];
  const r = previewMatches(posts, { have: { brand: "Fiat", model: "Cronos", year: 2024 } });
  assert.deepEqual(r.theyWantMine.map((p) => p.id), ["b", "a"]);
});

test("considered conta o que passou pelo filtro de área, não o total", () => {
  const posts = [
    post({ car: { brand: "Jeep", model: "Renegade", localization: "São Paulo - SP" }, wants: [wantCronos] }),
    post({ car: { brand: "Jeep", model: "Renegade", localization: "Salvador - BA" }, wants: [wantCronos] }),
  ];
  const r = previewMatches(posts, {
    have: { brand: "Fiat", model: "Cronos", year: 2024 },
    city: "São Paulo - SP",
    radiusKm: 50,
  });
  assert.equal(r.considered, 1);
  assert.equal(r.theyWantMine.length, 1);
});

}
