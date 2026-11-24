/**
 * WhatsApp is the only contact channel in the W generation: a wrong number
 * format or an inverted cash direction is not a cosmetic bug, it is a message
 * that reaches nobody or states the wrong price. These tests pin the format
 * rules and the sentence construction.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { load, VERSION } from "../lib/load.mjs";

// W_ONLY_GUARD: lib/whatsapp.ts só existe na geração WhatsApp.
const W_ONLY = VERSION.startsWith("w");
if (!W_ONLY) {
  test("(geração W) funcionalidade ausente na geração V", (t) =>
    t.skip("este módulo só existe na geração W")
  );
} else {

const wa = await load("whatsapp");

test("normalizeWhatsapp: aceita os formatos que um brasileiro digita", async (t) => {
  const cases = [
    ["(11) 91234-5678", "+5511912345678"],
    ["11912345678", "+5511912345678"],
    ["11 91234 5678", "+5511912345678"],
    ["+55 11 91234-5678", "+5511912345678"],
    ["+5511912345678", "+5511912345678"],
    ["5511912345678", "+5511912345678"],
    ["011 91234-5678", "+5511912345678"],
    ["  11-91234-5678  ", "+5511912345678"],
    ["(11) 3456-7890", "+551134567890"],
  ];
  for (const [input, expected] of cases) {
    await t.test(input, () => {
      assert.equal(wa.normalizeWhatsapp(input), expected);
    });
  }
});

test("normalizeWhatsapp: rejeita o que não é número brasileiro", async (t) => {
  const bad = ["", "   ", "abc", "123", "123456789012345", null, undefined, "+1 555 0100"];
  for (const input of bad) {
    await t.test(String(input), () => {
      assert.equal(wa.normalizeWhatsapp(input), null);
    });
  }
});

test("normalizeWhatsapp: é idempotente", () => {
  const once = wa.normalizeWhatsapp("(11) 91234-5678");
  assert.equal(wa.normalizeWhatsapp(once), once);
});

test("whatsappDigits: só dígitos, no formato do wa.me", () => {
  assert.equal(wa.whatsappDigits("+55 (11) 91234-5678"), "5511912345678");
});

test("formatWhatsapp: legível, e devolve a entrada quando não reconhece", () => {
  assert.equal(wa.formatWhatsapp("+5511912345678"), "+55 (11) 91234-5678");
  assert.equal(wa.formatWhatsapp("+551134567890"), "+55 (11) 3456-7890");
  assert.equal(wa.formatWhatsapp("abc"), "abc");
});

test("whatsappLink: monta wa.me com a mensagem codificada", () => {
  const link = wa.whatsappLink("(11) 91234-5678", "Oi, tudo bem?");
  assert.equal(link, "https://wa.me/5511912345678?text=Oi%2C%20tudo%20bem%3F");
});

test("whatsappLink: devolve null quando o número é inválido", () => {
  assert.equal(wa.whatsappLink("abc", "oi"), null);
  assert.equal(wa.whatsappLink("", "oi"), null);
});

test("cashSentence: a direção do dinheiro nunca se inverte", () => {
  assert.match(wa.cashSentence(15000), /^Eu pago R\$ 15\.000/);
  assert.match(wa.cashSentence(-15000), /^Você me paga R\$ 15\.000/);
  assert.match(wa.cashSentence(0), /sem dinheiro/);
});

test("shortCarName: marca modelo ano, curto o bastante para o celular", () => {
  const name = wa.shortCarName({
    brand: "Honda",
    model: "Fit EX/S 1.5 Flex/Flexone 16V 5p Aut.",
    year: 2015,
    estimatedValue: 1,
  });
  assert.equal(name, "Honda Fit EX/S 1.5 (2015)");
});

test("buildMatchMessage: contém tudo que a pessoa precisa para decidir", () => {
  const msg = wa.buildMatchMessage({
    recipientName: "Fernanda Alves",
    myCar: { brand: "VW", model: "T-Cross 1.0", year: 2021, estimatedValue: 88000 },
    theirCar: { brand: "Fiat", model: "Cronos Drive", year: 2024, estimatedValue: 73000 },
    myPostUrl: "https://carmatch.test/posts/abc",
    cashFromMe: -15599,
    score: 63,
  });

  assert.match(msg, /Oi, Fernanda!/, "cumprimenta pelo primeiro nome");
  assert.match(msg, /Demos match no CarMatch/);
  assert.match(msg, /Meu carro: VW T-Cross 1\.0 \(2021\)/);
  assert.match(msg, /https:\/\/carmatch\.test\/posts\/abc/, "leva o link do anúncio");
  assert.match(msg, /Aceito seu Fiat Cronos Drive \(2024\)/);
  assert.match(msg, /Você me paga R\$ 15\.599/, "a direção do dinheiro está explícita");
  assert.match(msg, /Compatibilidade: 63%/);
  assert.match(msg, /Vamos fazer negócio\?/);
});

test("buildMatchMessage: sem nome do destinatário ainda cumprimenta", () => {
  const msg = wa.buildMatchMessage({
    myCar: { brand: "A", model: "B", year: 2020, estimatedValue: 1 },
    theirCar: { brand: "C", model: "D", year: 2021, estimatedValue: 1 },
    myPostUrl: "https://x/y",
    cashFromMe: 1000,
  });
  assert.match(msg, /^Oi!/);
  assert.doesNotMatch(msg, /Compatibilidade/, "sem score não inventa percentual");
  assert.match(msg, /Eu pago R\$ 1\.000/);
});

test("buildMatchMessage: sem score significativo não mostra 0%", () => {
  const msg = wa.buildMatchMessage({
    myCar: { brand: "A", model: "B", year: 2020, estimatedValue: 1 },
    theirCar: { brand: "C", model: "D", year: 2021, estimatedValue: 1 },
    myPostUrl: "https://x/y",
    cashFromMe: 0,
    score: 0,
  });
  assert.doesNotMatch(msg, /Compatibilidade/);
});

test("buildInterestMessage: mais curta, e sem afirmar match", () => {
  const msg = wa.buildInterestMessage({
    recipientName: "Carlos",
    myCar: { brand: "Fiat", model: "Argo", year: 2021, estimatedValue: 1 },
    theirCar: { brand: "Jeep", model: "Renegade", year: 2019, estimatedValue: 1 },
  });
  assert.match(msg, /Oi, Carlos!/);
  assert.match(msg, /Vi seu Jeep Renegade \(2019\) no CarMatch/);
  assert.match(msg, /Tenho um Fiat Argo \(2021\) e topo trocar/);
  // "CarMatch" contém "match": a asserção precisa ser sobre a frase, não a palavra.
  assert.doesNotMatch(msg, /Demos match/i, "sem match, não finge que houve");
});

test("buildInterestMessage: sem carro próprio, ainda é coerente", () => {
  const msg = wa.buildInterestMessage({
    theirCar: { brand: "Jeep", model: "Renegade", year: 2019, estimatedValue: 1 },
  });
  assert.match(msg, /Tenho interesse em trocar/);
  assert.doesNotMatch(msg, /Tenho um/);
});

test("buildInterestMessage: não deixa linha vazia quando falta o link", () => {
  const msg = wa.buildInterestMessage({
    theirCar: { brand: "Jeep", model: "Renegade", year: 2019, estimatedValue: 1 },
  });
  assert.doesNotMatch(msg, /\n\n\n/, "sem linhas em branco duplicadas");
});

test("postUrl: normaliza barra final", () => {
  assert.equal(wa.postUrl("https://x.test/", "abc"), "https://x.test/posts/abc");
  assert.equal(wa.postUrl("https://x.test", "abc"), "https://x.test/posts/abc");
});

test("cashFromViewer: positivo = o visitante paga, dos dois lados", () => {
  const match = { postAId: "A", postBId: "B", suggestedCashFromA: 1000 };
  assert.equal(wa.cashFromViewer(match, "A"), 1000);
  assert.equal(wa.cashFromViewer(match, "B"), -1000);
});

}
