/**
 * The bridge between the simplified list and the rest of the app.
 *
 * `parseSimplifiedPayload` turns the three-level payload back into the shape the
 * listing form already understood, and the `find*` helpers answer the question
 * that matters at edit time: "this listing was saved as TRACKER LT 1.8 16V Flex
 * 4x2 Aut. — which of these options is that?"
 *
 * That question is where a real bug lived: the simplified option exposes only a
 * *representative* code and name, so a lookup that checks just those silently
 * substituted a different trim — and saving wrote the substituted car over the
 * user's own. These tests pin the membership rule.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { load } from "../lib/load.mjs";

let utils = null;
try {
  utils = await load("fipe-utils");
} catch {
  utils = null;
}

const {
  parseSimplifiedPayload,
  findVersionByCode,
  findVersionByName,
  versionsForLine,
} = utils ?? {};

const available = Boolean(parseSimplifiedPayload && findVersionByCode);
const SKIP = { skip: available ? false : "esta versão não tem a FIPE simplificada" };
const t = (name, fn) => test(name, SKIP, fn);

/* ─── A payload shaped like the route's ───────────────────────── */

const payload = {
  brandId: "23",
  stats: { before: 5, after: 4, lines: 2 },
  lines: [
    {
      key: "onix",
      name: "Onix",
      versions: [
        {
          key: "onix|1.0|flex|hatch|manual",
          label: "Onix 1.0 Flex Hatch 12V · Mec.",
          line: "onix",
          family: "onix",
          transmission: "manual",
          codes: ["A1", "A2"],
          members: ["ONIX HATCH 1.0 12V Flex 5p Mec.", "ONIX HATCH LT 1.0 12V Flex 5p Mec."],
          code: "A1",
          fullName: "ONIX HATCH 1.0 12V Flex 5p Mec.",
        },
        {
          key: "onix|1.0|flex|sedan|manual",
          label: "Onix 1.0 Flex Sedan 12V · Mec.",
          line: "onix",
          family: "onix",
          transmission: "manual",
          codes: ["B1"],
          members: ["ONIX SEDAN Plus 1.0 12V Mec."],
          code: "B1",
          fullName: "ONIX SEDAN Plus 1.0 12V Mec.",
        },
      ],
    },
  ],
};

/* ─── parseSimplifiedPayload ──────────────────────────────────── */

t("payload: mantém todos os códigos e membros de cada opção", () => {
  const parsed = parseSimplifiedPayload(payload);
  const onix = versionsForLine(parsed, "Onix");
  assert.equal(onix.length, 2);
  assert.deepEqual(onix[0].codes, ["A1", "A2"]);
  assert.deepEqual(onix[0].members, payload.lines[0].versions[0].members);
});

t("payload: o rótulo da versão perde o nome da linha", () => {
  const parsed = parseSimplifiedPayload(payload);
  const onix = versionsForLine(parsed, "Onix");
  // A linha já está no campo anterior; repetir "Onix" seria ruído.
  assert.equal(onix[0].version, "1.0 Flex Hatch 12V");
  assert.equal(onix[1].version, "1.0 Flex Sedan 12V");
});

t("payload: sub-modelo continua visível dentro da linha", () => {
  // "Corolla Cross" sob a linha "Corolla": o rótulo tem que manter "Cross".
  const parsed = parseSimplifiedPayload({
    brandId: "56",
    stats: { before: 2, after: 2, lines: 1 },
    lines: [
      {
        key: "corolla",
        name: "Corolla",
        versions: [
          {
            key: "k1",
            label: "Corolla Cross 2.0 Flex · Aut.",
            line: "corolla",
            family: "corolla cross",
            transmission: "auto",
            codes: ["C1"],
            members: ["COROLLA CROSS GR-S 2.0 16V Flex Aut."],
            code: "C1",
            fullName: "COROLLA CROSS GR-S 2.0 16V Flex Aut.",
          },
        ],
      },
    ],
  });
  const versions = versionsForLine(parsed, "Corolla");
  assert.equal(versions[0].version, "Cross 2.0 Flex");
});

t("payload: linha com hífen no nome não quebra o prefixo", () => {
  // "A-10" tem um "-" que uma regex ingênua trata como intervalo.
  const parsed = parseSimplifiedPayload({
    brandId: "23",
    stats: { before: 1, after: 1, lines: 1 },
    lines: [
      {
        key: "a-10",
        name: "A-10",
        versions: [
          {
            key: "k",
            label: "A-10 2.5 · Mec.",
            line: "a-10",
            family: "a-10",
            transmission: "manual",
            codes: ["D1"],
            members: ["A-10 2.5"],
            code: "D1",
            fullName: "A-10 2.5",
          },
        ],
      },
    ],
  });
  assert.equal(versionsForLine(parsed, "A-10")[0].version, "2.5");
});

t("payload: câmbio nulo continua nulo (nome indecomponível)", () => {
  const parsed = parseSimplifiedPayload({
    brandId: "23",
    stats: { before: 1, after: 1, lines: 1 },
    lines: [
      {
        key: "marea",
        name: "Marea",
        versions: [
          {
            key: "raw:9",
            label: "Marea City",
            line: "marea",
            family: "marea",
            transmission: null,
            codes: ["9"],
            members: ["Marea City"],
            code: "9",
            fullName: "Marea City",
          },
        ],
      },
    ],
  });
  assert.equal(versionsForLine(parsed, "Marea")[0].transmission, null);
});

/* ─── findVersionByCode / ByName ─────────────────────────────── */

t("findVersionByCode: acha pelo código representativo", () => {
  const parsed = parseSimplifiedPayload(payload);
  assert.equal(findVersionByCode(parsed, "A1")?.fullName, "ONIX HATCH 1.0 12V Flex 5p Mec.");
});

t("findVersionByCode: acha por um membro, não só pelo representante", () => {
  // Este é o bug: o anúncio guardou "A2", que não é o código representativo.
  // Procurar só por modelCode devolvia undefined e o formulário caía noutro
  // carro.
  const parsed = parseSimplifiedPayload(payload);
  const hit = findVersionByCode(parsed, "A2");
  assert.ok(hit, "código de membro precisa ser encontrado");
  assert.equal(hit.modelCode, "A1");
  assert.ok(hit.codes.includes("A2"));
});

t("findVersionByCode: código inexistente devolve undefined", () => {
  const parsed = parseSimplifiedPayload(payload);
  assert.equal(findVersionByCode(parsed, "ZZZ"), undefined);
});

t("findVersionByName: acha por um nome de membro, ignorando caixa", () => {
  const parsed = parseSimplifiedPayload(payload);
  const hit = findVersionByName(parsed, "onix hatch lt 1.0 12v flex 5p mec.");
  assert.ok(hit);
  assert.equal(hit.modelCode, "A1");
});

t("findVersionByName: sedan não é confundido com hatch", () => {
  const parsed = parseSimplifiedPayload(payload);
  assert.equal(findVersionByName(parsed, "ONIX SEDAN Plus 1.0 12V Mec.")?.modelCode, "B1");
});

t("findVersionByName: espaços sobrando não impedem o match", () => {
  // A própria FIPE devolve nomes com espaço no fim.
  const parsed = parseSimplifiedPayload(payload);
  assert.ok(findVersionByName(parsed, "  ONIX HATCH 1.0 12V Flex 5p Mec.  "));
});

t("findVersionByName: nome desconhecido devolve undefined em vez de chutar", () => {
  const parsed = parseSimplifiedPayload(payload);
  assert.equal(findVersionByName(parsed, "Ferrari Roma"), undefined);
});

/* ─── versionsForLine ─────────────────────────────────────────── */

t("versionsForLine: aceita a palavra crua em maiúsculas", () => {
  // O anúncio antigo guardou "ONIX"; a linha simplificada se chama "Onix".
  const parsed = parseSimplifiedPayload(payload);
  assert.equal(versionsForLine(parsed, "ONIX").length, 2);
});

t("versionsForLine: linha inexistente devolve lista vazia", () => {
  const parsed = parseSimplifiedPayload(payload);
  assert.deepEqual(versionsForLine(parsed, "Ferrari"), []);
  assert.deepEqual(versionsForLine(null, "Onix"), []);
  assert.deepEqual(versionsForLine(parsed, ""), []);
});

/* ─── Every FIPE version stays reachable ──────────────────────── */

t("cada opção expõe todas as suas versões FIPE, na mesma ordem dos códigos", () => {
  const parsed = parseSimplifiedPayload(payload);
  const onix = versionsForLine(parsed, "Onix");
  for (const option of onix) {
    assert.equal(option.codes.length, option.members.length);
    assert.ok(option.codes.length >= 1);
  }
  assert.deepEqual(onix[0].codes, ["A1", "A2"]);
  assert.deepEqual(onix[0].members, [
    "ONIX HATCH 1.0 12V Flex 5p Mec.",
    "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
  ]);
});

t("todo código de versão exata resolve de volta para a própria opção", () => {
  // É o que a UI faz ao abrir uma lista: agrupar por motor, mas conseguir
  // voltar do código exato para o grupo que o contém.
  const parsed = parseSimplifiedPayload(payload);
  for (const versions of Object.values(parsed.versionsByGeneralModel)) {
    for (const option of versions) {
      for (const code of option.codes) {
        const hit = findVersionByCode(parsed, code);
        assert.ok(hit, `código ${code} inalcançável`);
        assert.equal(hit.modelCode, option.modelCode, `código ${code} caiu noutra opção`);
      }
    }
  }
});

t("memberVersionLabel: tira o nome da linha sem repetir o modelo", () => {
  // O formulário grava modelo e versão separados; repetir "Gol" na versão
  // criaria "Gol Gol …" e a família deixaria de casar com o carro real.
  assert.equal(utils.memberVersionLabel("GOL 1.0 Plus 8v 2p", "Gol"), "1.0 Plus 8v 2p");
  assert.equal(
    utils.memberVersionLabel("COROLLA CROSS XRE 2.0 16V Flex Aut.", "Corolla"),
    "CROSS XRE 2.0 16V Flex Aut."
  );
  // Sem prefixo reconhecível, o nome fica inteiro em vez de virar vazio.
  assert.equal(utils.memberVersionLabel("Gol 1.0", "Onix"), "Gol 1.0");
  assert.equal(utils.memberVersionLabel("", "Gol"), "");
});

t("memberVersionLabel: linha com hífen não é tratada como regex", () => {
  assert.equal(utils.memberVersionLabel("A-10 2.5", "A-10"), "2.5");
  assert.equal(utils.memberVersionLabel("C-20 4.1", "C-20"), "4.1");
});
