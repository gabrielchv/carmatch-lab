/**
 * The onboarding draft: answers → pre-filled listing.
 *
 * The step that loses people is the one right after "you have matches": the
 * account. If the answers are not carried across the login, the person is asked
 * to type the same car again — and leaves. These tests pin the carry.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LAB } from "../lib/harness.mjs";

const VERSION = process.env.CARMATCH_TEST_VERSION ?? "w1";

const mod = await (async () => {
  try {
    return await import(
      pathToFileURL(path.join(LAB, VERSION, "lib", "onboarding-draft.ts")).href
    );
  } catch {
    return null;
  }
})();

const available = Boolean(mod?.draftUrl && mod?.readDraft);
const SKIP = { skip: available ? false : "esta versão não tem o rascunho do onboarding" };
const t = (name, fn) => test(name, SKIP, fn);

const full = {
  brand: "GM - Chevrolet",
  brandId: "23",
  model: "TRACKER LT 1.8 16V Flex 4x2 Aut.",
  modelCode: "7428",
  year: 2016,
  value: 65128,
  wantBrand: "Hyundai",
  wantModel: "Creta 1.6 Flex 16V Aut.",
  wantYear: 2018,
};

t("a URL leva tudo o que o formulário precisa", () => {
  const url = mod.draftUrl(full);
  assert.match(url, /^\/posts\/new\?/);
  assert.match(url, /fromOnboarding=1/);
  assert.match(url, /modelCode=7428/);
  assert.match(url, /year=2016/);
});

t("ida e volta preserva todos os campos", () => {
  const params = mod.draftParams(full);
  const back = mod.readDraft(params);
  assert.deepEqual(back, full);
});

t("campos vazios não são serializados", () => {
  const params = mod.draftParams({
    brand: "Fiat",
    model: "Argo 1.0",
    brandId: "",
    modelCode: undefined,
    year: undefined,
  });
  assert.equal(params.get("brandId"), null);
  assert.equal(params.get("year"), null);
  // E o que existe continua lá.
  assert.equal(params.get("brand"), "Fiat");
});

t("sem a marcação de origem, não é um rascunho", () => {
  // /posts/new?brand=Fiat&model=Argo é uma URL qualquer, não um rascunho.
  const params = new URLSearchParams("brand=Fiat&model=Argo");
  assert.equal(mod.readDraft(params), null);
});

t("rascunho sem carro é recusado em vez de meio-preenchido", () => {
  assert.equal(mod.readDraft(new URLSearchParams("fromOnboarding=1&brand=Fiat")), null);
  assert.equal(mod.readDraft(new URLSearchParams("fromOnboarding=1&model=Argo")), null);
});

t("número inválido no ano é ignorado, não vira NaN", () => {
  const params = new URLSearchParams(
    "fromOnboarding=1&brand=Fiat&model=Argo&year=abc&value=xyz"
  );
  const draft = mod.readDraft(params);
  assert.equal(draft.year, undefined);
  assert.equal(draft.value, undefined);
});

t("deslogado: passa pelo login levando o rascunho inteiro", () => {
  const href = mod.officializeUrl(full, false);
  assert.match(href, /^\/auth\?redirectTo=/);

  const redirect = decodeURIComponent(href.split("redirectTo=")[1]);
  assert.equal(redirect, mod.draftUrl(full));
  // O rascunho sobrevive ao login, não só a rota.
  assert.match(redirect, /modelCode=7428/);
});

t("logado: vai direto ao formulário", () => {
  assert.equal(mod.officializeUrl(full, true), mod.draftUrl(full));
});

t("sem match é quando faz sentido pedir o cadastro", () => {
  // Com match, o próximo passo é falar com quem já está lá — publicar seria
  // desviar a pessoa da resposta.
  assert.equal(mod.shouldEncouragePublishing("no-match"), true);
  assert.equal(mod.shouldEncouragePublishing("no-posts"), true);
  assert.equal(mod.shouldEncouragePublishing("outbound-only"), true);

  assert.equal(mod.shouldEncouragePublishing("reciprocal"), false);
  assert.equal(mod.shouldEncouragePublishing("inbound-only"), false);
});
