/**
 * The FIPE simplification, tested against the shapes the catalogue actually
 * produces — not invented names.
 *
 * Two things are being protected here:
 *
 *  1. **The list stays honest.** Every option shown to the user must correspond
 *     to real FIPE entries, must carry the code its year/price lookup needs, and
 *     must never mix two different engines into one label.
 *  2. **The matcher agrees with the list.** Picking "Tracker 1.8 Flex · Aut."
 *     must match a listing stored as "TRACKER LTZ 1.8 16V Flex 4x2 Aut." — that
 *     equivalence is the whole reason a shorter list is safe.
 *
 * Only w6 ships lib/car-simplify.ts, so this file skips itself elsewhere.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { load, loadMatching } from "../lib/load.mjs";

let simplify = null;
try {
  simplify = await load("car-simplify");
} catch {
  simplify = null;
}

const available = Boolean(simplify);
const SKIP = { skip: available ? false : "esta versão não tem lib/car-simplify.ts" };
const t = (name, fn) => test(name, SKIP, fn);

/* ─── Fixtures: real FIPE names, trimmed to the interesting shapes ─── */

const cronos = [
  { codigo: 1, nome: "CRONOS DRIVE 1.3 8V Flex Aut." },
  { codigo: 2, nome: "CRONOS DRIVE 1.3 8V Flex" },
  { codigo: 3, nome: "CRONOS PRECISION 1.8 16V Flex Aut." },
  { codigo: 4, nome: "CRONOS 1.3 8V Flex Aut." },
];

const tracker = [
  { codigo: 10, nome: "TRACKER LT 1.8 16V Flex 4x2 Aut." },
  { codigo: 11, nome: "TRACKER LTZ 1.8 16V Flex 4x2 Aut." },
  { codigo: 12, nome: "TRACKER 1.2 Turbo 12V Flex Aut." },
  { codigo: 13, nome: "TRACKER 1.2 Turbo Flex Aut." },
  { codigo: 14, nome: "TRACKER 1.2 Turbo 16V Flex Aut." },
];

const hb20 = [
  { codigo: 20, nome: "HB20 Vision 1.6 Flex 16V Aut" },
  { codigo: 21, nome: "HB20 Comfort 1.6 Flex 16V Aut" },
  { codigo: 22, nome: "HB20 1.6 Flex 16V Aut" },
  { codigo: 23, nome: "HB20 1.6 Flex 16V Mec" },
];

const troublemakers = [
  { codigo: 30, nome: "S10 Blazer Std. 2.5 Diesel Turbo" },
  { codigo: 31, nome: "S10 Pick-Up Std. 2.5 Diesel Turbo" },
  { codigo: 32, nome: "S10 P-Up H.Country 2.8 4x4 CD Dies.Aut." },
  { codigo: 33, nome: "Hilux 4x2 2.4 Diesel" },
  { codigo: 34, nome: "HILUX CD 4x4 2.4 Diesel" },
  { codigo: 35, nome: "COROLLA CROSS GR-S 2.0 16V Flex Aut." },
  { codigo: 36, nome: "COROLLA GLi 1.8 16V Aut." },
  { codigo: 37, nome: "Gol TSi 1.8/ 1.8Mi" },
  { codigo: 38, nome: "Astra 2.0 8V/ CD 2.0 8V Hatchback 5p Aut" },
  { codigo: 39, nome: "A-20 Custom/ C-20 S 4.1" },
  { codigo: 40, nome: "Gol 1.6" },
  { codigo: 41, nome: "500 Cabrio Dualogic Flex 1.4 8V" },
  { codigo: 42, nome: "PALIO WEEKEND ELX 1.4 8V Flex" },
  { codigo: 43, nome: "PALIO ELX 1.4 8V Flex" },
];

const all = [...cronos, ...tracker, ...hb20, ...troublemakers];

/* ─── tokenize ─────────────────────────────────────────────────── */

t("tokenize: decimal do motor é preservado inteiro", () => {
  // Splitting "1.0" into "1" and "0" was the bug that made every signature
  // unparseable; the engine token must survive.
  assert.deepEqual(simplify.tokenize("TRACKER 1.0 Turbo"), ["tracker", "1.0", "turbo"]);
  assert.deepEqual(simplify.tokenize("2.8 Diesel"), ["2.8", "diesel"]);
});

t("tokenize: abreviações coladas se separam", () => {
  for (const name of ["S10 2.8 4x4 CD Dies.Aut.", "Astra 2.0 Hatchback 5p Aut.4p", "Fox 1.0 T.Flex"]) {
    const tokens = simplify.tokenize(name);
    assert.ok(!tokens.includes("."), name);
    assert.ok(!tokens.some((x) => x.startsWith(".")), name);
  }
  assert.deepEqual(simplify.tokenize("S10 2.8 Dies.Aut."), ["s10", "2.8", "dies", "aut"]);
});

t("tokenize: acentos e parênteses não viram família", () => {
  assert.deepEqual(simplify.tokenize("Peugeot 208 (Feline)"), ["peugeot", "208", "feline"]);
  assert.deepEqual(simplify.tokenize("CÂMBIO 1.6"), ["cambio", "1.6"]);
});

t("tokenize: o separador · do rótulo não vira token", () => {
  assert.deepEqual(simplify.tokenize("Tracker 1.8 Flex · Aut."), [
    "tracker",
    "1.8",
    "flex",
    "aut",
  ]);
});

/* ─── signatureOf ──────────────────────────────────────────────── */

t("signatureOf: lê família, motor, câmbio e tração de nomes reais", () => {
  const sig = simplify.signatureOf("TRACKER LT 1.8 16V Flex 4x2 Aut.");
  assert.equal(sig.family, "tracker");
  assert.equal(sig.line, "tracker");
  assert.equal(sig.displacement, "1.8");
  assert.equal(sig.fuel, "flex");
  assert.equal(sig.drivetrain, "2wd");
  assert.equal(sig.valve, "16v");
  assert.equal(sig.transmission, "auto");
});

t("signatureOf: aspiração antes do motor também conta (Gol TSi)", () => {
  // FIPE põe fato mecânico antes da cilindrada com frequência; ler só a cauda
  // separava o mesmo carro em dois.
  const sig = simplify.signatureOf("Gol TSi 1.6");
  assert.equal(sig.family, "gol");
  assert.match(sig.aspiration, /tsi/);
});

t("signatureOf: tração antes do motor também conta (Hilux 4x4)", () => {
  assert.equal(simplify.signatureOf("HILUX CD 4x4 2.4 Diesel").drivetrain, "4wd");
  assert.equal(simplify.signatureOf("Hilux 4x2 2.4 Diesel").drivetrain, "2wd");
});

t("signatureOf: Dualogic e Tiptronic contam como automático", () => {
  assert.equal(simplify.signatureOf("500 Cabrio Dualogic Flex 1.4 8V").transmission, "auto");
  assert.equal(simplify.signatureOf("Golf GT 2.0 Mi T. Flex 8V 4p Tiptronic").transmission, "auto");
});

t("signatureOf: sem câmbio declarado é manual (convenção FIPE)", () => {
  assert.equal(simplify.signatureOf("HB20 1.6 Flex 16V").transmission, "manual");
});

t("signatureOf: sub-modelo continua na família (Corolla Cross ≠ Corolla)", () => {
  assert.equal(simplify.signatureOf("COROLLA CROSS GR-S 2.0 16V Flex Aut.").family, "corolla cross");
  assert.equal(simplify.signatureOf("COROLLA GLi 1.8 16V Aut.").family, "corolla");
  // ...mas navega sob a mesma linha.
  assert.equal(simplify.signatureOf("COROLLA CROSS GR-S 2.0 16V Flex Aut.").line, "corolla");
});

t("signatureOf: número de edição não vira nome de carro", () => {
  // "TRACKER 100 Anos" não é um "Tracker 100".
  assert.equal(simplify.signatureOf("TRACKER 100 Anos 1.2 Turbo Flex Aut.").family, "tracker");
  // Mas o número do modelo continua inteiro: Peugeot 2008 não é "Peugeot".
  assert.equal(simplify.signatureOf("2008 Griffe 1.0 Turbo 200 5p Aut.").family, "2008");
});

t("signatureOf: nome sem cilindrada é indecomponível", () => {
  assert.equal(simplify.signatureOf("Gol Special"), null);
  assert.equal(simplify.signatureOf("Fiat Uno"), null);
  assert.equal(simplify.signatureOf(""), null);
  // Com cilindrada, o mesmo nome é legível.
  assert.ok(simplify.signatureOf("Gol 1.6"));
});

t("signatureOf: nome com duas cilindradas separadas por barra é indecomponível", () => {
  // "1.0/ Super 1.0" e "2.0 8V/ CD 2.0 8V" nomeiam dois carros numa string.
  // Adivinhar qual metade o anúncio quis dizer seria pior que não agrupar.
  assert.equal(simplify.signatureOf("Gol TSi 1.8/ 1.8Mi"), null);
  assert.equal(simplify.signatureOf("Astra 2.0 8V/ CD 2.0 8V Hatchback 5p Aut"), null);
});

/* ─── sameCar ──────────────────────────────────────────────────── */

const sameCarCases = [
  // [a, b, esperado, porquê]
  ["CRONOS DRIVE 1.3 8V Flex Aut.", "CRONOS 1.3 8V Flex Aut.", true, "só o acabamento muda"],
  ["TRACKER LT 1.8 16V Flex 4x2 Aut.", "TRACKER LTZ 1.8 16V Flex 4x2 Aut.", true, "LT vs LTZ"],
  ["TRACKER 1.2 Turbo 12V Flex Aut.", "TRACKER 1.2 Turbo Flex Aut.", true, "ausência de válvulas não contradiz"],
  ["TRACKER 1.2 Turbo 12V Flex Aut.", "TRACKER 1.2 Turbo 16V Flex Aut.", false, "motores diferentes"],
  ["ONIX HATCH Joy 1.0 8V Flex 5p Mec.", "ONIX HATCH LT 1.0 8V Flex 5p Mec.", true, "Joy vs LT"],
  ["HB20 Vision 1.6 Flex 16V Aut", "HB20 Comfort 1.6 Flex 16V Aut", true, "Vision vs Comfort"],
  ["HB20 1.6 Flex 16V Aut", "HB20 1.6 Flex 16V Mec", false, "câmbio diferente"],
  ["COROLLA GLi 1.8 16V Aut.", "COROLLA CROSS XRE 2.0 16V Flex Aut.", false, "carros diferentes"],
  ["Hilux 4x2 2.4 Diesel", "HILUX CD 4x4 2.4 Diesel", false, "tração diferente"],
  ["S10 Pick-Up LT 2.8 TDI 4x4 CD Diesel Aut", "S10 Pick-Up WT 2.8 TDI 4x4 CD Diesel Aut", true, "LT vs WT"],
  ["S10 Pick-Up LT 2.8 TDI 4x4 CD Diesel Aut", "S10 Pick-Up LS 2.8 TDI 4x4 CD Dies. Mec.", false, "câmbio diferente"],
  ["S10 Blazer Std. 2.5 Diesel Turbo", "S10 Pick-Up Std. 2.5 Diesel Turbo", false, "Blazer é outro carro"],
];

for (const [a, b, expected, why] of sameCarCases) {
  t(`sameCar: ${why}`, () => {
    assert.equal(simplify.sameCar(a, b), expected);
    assert.equal(simplify.sameCar(b, a), expected, "a regra precisa ser simétrica");
  });
}

t("sameCar: nomes indecomponíveis nunca são considerados o mesmo carro", () => {
  assert.equal(simplify.sameCar("Gol Special", "Gol Special"), false);
  assert.equal(simplify.sameCar("Gol TSi 1.8/ 1.8Mi", "Gol 1.8"), false);
});

t("sameCar: é reflexivo para todo nome decomponível da amostra", () => {
  for (const { nome } of all) {
    if (!simplify.signatureOf(nome)) continue;
    assert.equal(simplify.sameCar(nome, nome), true, nome);
  }
});

/* ─── simplifyModels ──────────────────────────────────────────── */

t("simplifyModels: agrupa trims que são o mesmo carro", () => {
  const options = simplify.simplifyModels(cronos);
  const oneThreeAuto = options.find((o) => o.label.includes("1.3") && o.transmission === "auto");
  assert.ok(oneThreeAuto, "deve existir a opção 1.3 automática");
  assert.deepEqual(oneThreeAuto.codes, ["1", "4"]);
  assert.equal(oneThreeAuto.fullName, "CRONOS DRIVE 1.3 8V Flex Aut.");
  assert.equal(oneThreeAuto.members.length, 2);
});

t("simplifyModels: 4 versões CRONOS viram 3 opções", () => {
  assert.equal(simplify.simplifyModels(cronos).length, 3);
});

t("simplifyModels: câmbio separa opções", () => {
  const options = simplify.simplifyModels(cronos);
  const transmissions = options.map((o) => o.transmission).sort();
  assert.deepEqual(transmissions, ["auto", "auto", "manual"]);
});

t("simplifyModels: válvulas conflitantes não são fundidas", () => {
  const options = simplify.simplifyModels(tracker);
  const turbo12 = options.filter((o) => o.label.includes("1.2"));
  // 12V, 16V e a sem-válvula: três afirmações diferentes, três opções.
  assert.equal(turbo12.length, 3);
});

t("simplifyModels: combustível conflitante não é fundido", () => {
  const options = simplify.simplifyModels([
    { codigo: 50, nome: "Hilux 2.8 Diesel" },
    { codigo: 51, nome: "Hilux 2.8 Flex" },
  ]);
  assert.equal(options.length, 2);
});

t("simplifyModels: tração separa opções", () => {
  const options = simplify.simplifyModels([
    { codigo: 60, nome: "Hilux 2.4 4x2 Diesel" },
    { codigo: 61, nome: "Hilux 2.4 4x4 Diesel" },
  ]);
  assert.equal(options.length, 2);
  assert.ok(options.every((o) => o.members.length === 1));
});

t("simplifyModels: nome indecomponível vira uma opção própria, intocada", () => {
  const options = simplify.simplifyModels([
    { codigo: 70, nome: "Gol Special" },
    { codigo: 71, nome: "Gol 1.6" },
  ]);
  const raw = options.find((o) => o.codes.includes("70"));
  assert.equal(raw.label, "Gol Special");
  assert.deepEqual(raw.members, ["Gol Special"]);
  // E não foi fundido com o 1.6.
  assert.notDeepEqual(raw.codes, ["70", "71"]);
});

t("simplifyModels: código representativo pertence ao grupo", () => {
  for (const option of simplify.simplifyModels(all)) {
    assert.ok(
      option.codes.includes(option.code),
      `${option.label}: código ${option.code} fora de ${option.codes.join(",")}`
    );
    assert.ok(option.codes.length >= 1);
    assert.equal(option.codes.length, option.members.length);
  }
});

t("simplifyModels: nenhuma opção mistura carros diferentes", () => {
  // O invariante mais importante: todos os membros de uma opção têm que ser o
  // mesmo carro pela mesma regra que o matcher usa.
  for (const option of simplify.simplifyModels(all)) {
    // Options the tokeniser could not read were never merged, so there is no
    // claim to check — and `sameCar` refuses to compare them by design.
    if (option.key.startsWith("raw:")) continue;
    for (const member of option.members) {
      assert.equal(
        simplify.sameCar(option.members[0], member),
        true,
        `${option.label} misturou "${option.members[0]}" com "${member}"`
      );
    }
  }
});

t("simplifyModels: rótulos são únicos dentro de uma marca", () => {
  const labels = simplify.simplifyModels(all).map((o) => o.label);
  assert.equal(new Set(labels).size, labels.length);
});

t("simplifyModels: chaves são únicas (React e URLs dependem disso)", () => {
  const keys = simplify.simplifyModels(all).map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length);
});

t("simplifyModels: potência só aparece no rótulo quando é o que separa", () => {
  // Dois Civics 1.7 16V idênticos exceto pela potência: sem a potência no
  // rótulo, o usuário veria duas opções com o mesmo nome.
  const options = simplify.simplifyModels([
    { codigo: 80, nome: "Civic Sedan LX 1.7 16V 115cv Mec. 4p" },
    { codigo: 81, nome: "Civic Sedan EX 1.7 16v 130cv Mec. 4p" },
  ]);
  assert.equal(options.length, 2);
  assert.notEqual(options[0].label, options[1].label);
  assert.ok(options.some((o) => /115CV/.test(o.label)));
  assert.ok(options.some((o) => /130CV/.test(o.label)));

  // Sem conflito de potência, nada de ruído no rótulo.
  const single = simplify.simplifyModels([{ codigo: 82, nome: "Civic 1.7 16V 115cv Mec." }]);
  assert.ok(!/115CV/.test(single[0].label));
});

t("simplifyModels: barra só é ambígua quando separa dois motores", () => {
  // "FlexPower/EconoFlex" é um carro com dois nomes de marketing.
  const flexPower = simplify.simplifyModels([
    { codigo: 90, nome: "COBALT LT 1.4 8V FlexPower/EconoFlex 4p" },
    { codigo: 91, nome: "COBALT LTZ 1.4 8V FlexPower/EconoFlex 4p" },
  ]);
  assert.equal(flexPower.length, 1, "mesmo carro, um só nome comercial");
});

t("simplifyModels: a saída é ordenada e determinística", () => {
  const a = simplify.simplifyModels(all).map((o) => o.label);
  const b = simplify.simplifyModels([...all].reverse()).map((o) => o.label);
  assert.deepEqual(a, b);
  const sorted = [...a].sort((x, y) => x.localeCompare(y, "pt-BR"));
  assert.deepEqual(a, sorted);
});

t("simplifyModels: o rótulo mostra o câmbio e não repete o acabamento", () => {
  for (const option of simplify.simplifyModels(tracker)) {
    assert.match(option.label, / · (Aut|Mec)\.$/);
    for (const trim of ["LT ", "LTZ "]) {
      assert.ok(!option.label.startsWith(`Tracker ${trim}`), option.label);
    }
  }
});

t("simplifyModels: nada é perdido — todo código de entrada aparece na saída", () => {
  const seen = new Set(simplify.simplifyModels(all).flatMap((o) => o.codes));
  for (const { codigo } of all) assert.ok(seen.has(String(codigo)), `código ${codigo} sumiu`);
});

/**
 * Round-trip through the picker: what the form stores must match the car the
 * picker showed. This is the invariant that caught raw options being labelled
 * "Manual" and "Bi-Turbo" splitting from "BiTurbo".
 */
t("round-trip: toda opção casa com o próprio nome FIPE", async () => {
  const { parseSimplifiedPayload } = await import("../../../w6/lib/fipe-utils.ts").catch(
    () => ({})
  );
  if (!parseSimplifiedPayload) return; // sem o módulo, nada a verificar

  const payload = {
    brandId: "x",
    stats: { before: all.length, after: 0, lines: 0 },
    lines: simplify.groupByLine(simplify.simplifyModels(all)).map((l) => ({
      key: l.key,
      name: l.name,
      versions: l.versions.map((v) => ({ ...v })),
    })),
  };
  const parsed = parseSimplifiedPayload(payload);

  const misses = [];
  for (const line of Object.keys(parsed.versionsByGeneralModel)) {
    for (const v of parsed.versionsByGeneralModel[line]) {
      const ok = matching.vehicleMatchesCar(
        { brand: "X", model: v.fullName, year: 2010, estimatedValue: 50000 },
        {
          brand: "X",
          model: line,
          version: v.version,
          transmission: v.transmission,
          cashAdjustment: 0,
          cashAdjustmentTolerance: 0,
        }
      );
      if (!ok) misses.push(`${line} | ${v.version} | ${v.transmission} -> ${v.fullName}`);
    }
  }
  assert.deepEqual(misses, [], `opções que não casam consigo mesmas:\n${misses.join("\n")}`);
});

t("aspiração: BiTurbo e Bi-Turbo são o mesmo motor", () => {
  assert.equal(
    simplify.sameCar("GT-R 3.8 V6 BiTurbo Aut.", "GT-R 3.8 Bi-Turbo V6 Aut."),
    true
  );
});

/* ─── Body style and family rules ─────────────────────────────── */

t("carroceria: hatch e sedan são carros diferentes, não acabamentos", () => {
  // Antes desta regra, "ONIX HATCH" e "ONIX SEDAN Plus" viravam uma opção só,
  // e o dono de um sedan publicava um anúncio com o nome e o preço do hatch.
  const options = simplify.simplifyModels([
    { codigo: 200, nome: "ONIX HATCH 1.0 12V Flex 5p Mec." },
    { codigo: 201, nome: "ONIX HATCH LT 1.0 12V Flex 5p Mec." },
    { codigo: 202, nome: "ONIX SEDAN Plus 1.0 12V Mec." },
    { codigo: 203, nome: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec." },
  ]);
  assert.equal(options.length, 2, "duas carrocerias, duas opções");
  const hatch = options.find((o) => o.codes.includes("200"));
  const sedan = options.find((o) => o.codes.includes("202"));
  assert.deepEqual(hatch.codes, ["200", "201"]);
  assert.deepEqual(sedan.codes, ["202", "203"]);
  assert.match(hatch.label, /Hatch/);
  assert.match(sedan.label, /Sedan/);
});

t("carroceria: nomes do mesmo carro continuam juntos", () => {
  const options = simplify.simplifyModels([
    { codigo: 210, nome: "COROLLA GLi 1.8 16V Aut." },
    { codigo: 211, nome: "COROLLA XEi 1.8 16V Aut." },
  ]);
  assert.equal(options.length, 1, "mesmo motor, mesmo câmbio, mesmo carro");
  assert.equal(options[0].codes.length, 2);
});

t("carroceria: plus é sedan só na linha Onix", () => {
  // Na Onix, "Plus" nomeia o sedan; noutras linhas pode ser um acabamento.
  const options = simplify.simplifyModels([
    { codigo: 220, nome: "Polo Plus 1.0 Flex 12V Mec." },
    { codigo: 221, nome: "Polo 1.0 Flex 12V Mec." },
  ]);
  assert.equal(options.length, 1, "em Polo, Plus não separa carroceria");
});

t("carroceria: dois estilos num nome só é ambíguo, não é fundido", () => {
  // "500 Cabrio/500 Coupe Gucci" nomeia dois carros com preços diferentes.
  assert.equal(simplify.signatureOf("500 Cabrio/500 Coupe Gucci/Flex 1.4 Aut."), null);
  // Repetir o mesmo estilo não é ambiguidade: é a mesma van escrita duas vezes.
  const van = simplify.signatureOf("Jumper 2.0 Cargo Furgão 16V TB Diesel");
  assert.ok(van, "Cargo Furgão é uma van só");
  assert.equal(van.body, "van");
});

t("família: a primeira palavra FIPE é sempre o modelo", () => {
  // "City" estava na lista de acabamentos, então o Honda CITY virava 12 opções
  // ilegíveis; "Pulse" e "Joy" abriam linhas fantasma.
  assert.equal(simplify.signatureOf("CITY Hatchback EX 1.5 Flex 16V Aut.").family, "city");
  assert.equal(simplify.signatureOf("CITY Hatchback EX 1.5 Flex 16V Aut.").line, "city");
  assert.equal(simplify.signatureOf("Pulse 1.0 200 Turbo Flex Aut.").family, "pulse");
  assert.equal(simplify.signatureOf("JOY Hatch 1.0 8V Flex Mec.").family, "joy");
});

t("família: a mesma palavra vira acabamento quando não é a primeira", () => {
  // "Palio City" é um Palio, não um City.
  assert.equal(simplify.signatureOf("Palio City 1.0 4p").family, "palio");
  assert.equal(simplify.signatureOf("Siena City 1.0 4p").family, "siena");
  // Sem cilindrada no nome, nada é afirmado.
  assert.equal(simplify.signatureOf("Siena City 4p"), null);
  assert.equal(simplify.signatureOf("SANDERO STEPWAY Flex 1.6 16V 5p").family, "sandero");
});

t("família: Honda City deixa de ser opção crua", () => {
  const options = simplify.simplifyModels([
    { codigo: 230, nome: "CITY Hatchback EX 1.5 Flex 16V Aut." },
    { codigo: 231, nome: "CITY Hatchback LX 1.5 Flex 16V Aut." },
  ]);
  assert.equal(options.length, 1);
  assert.ok(!options[0].key.startsWith("raw:"), "deveria ter sido decomposto");
  assert.equal(options[0].line, "city");
  assert.match(options[0].label, /Hatch/);
});

/* ─── groupByLine / stats ─────────────────────────────────────── */

t("groupByLine: Corolla Cross navega sob a linha Corolla", () => {
  const lines = simplify.groupByLine(simplify.simplifyModels(troublemakers));
  const corolla = lines.find((l) => l.key === "corolla");
  assert.ok(corolla, "linha corolla deve existir");
  assert.ok(corolla.versions.some((v) => v.label.startsWith("Corolla Cross")));
  assert.ok(corolla.versions.some((v) => v.label.startsWith("Corolla ")));
});

t("groupByLine: linhas mais povoadas vêm primeiro", () => {
  const lines = simplify.groupByLine(simplify.simplifyModels(all));
  const counts = lines.map((l) => l.versions.length);
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i - 1] >= counts[i], `ordem quebrada em ${lines[i].name}`);
  }
});

t("groupByLine: nomes e chaves de linha são únicos", () => {
  // Um nome indecomponível ("ASTRA 2.0/ 2.0 ...") não pode abrir uma segunda
  // linha "Astra" ao lado da linha real.
  const merged = simplify.simplifyModels([
    ...all,
    { codigo: 99, nome: "ASTRA 2.0/ 2.0 Hatchback 5p Aut" },
    { codigo: 98, nome: "Astra 2.0 8V/ CD 2.0 8V Hatchback 5p" },
  ]);
  const lines = simplify.groupByLine(merged);
  assert.equal(new Set(lines.map((l) => l.key)).size, lines.length);
  assert.equal(new Set(lines.map((l) => l.name)).size, lines.length);
});

t("groupByLine: toda versão aparece em exatamente uma linha", () => {
  const options = simplify.simplifyModels(all);
  const lines = simplify.groupByLine(options);
  const total = lines.reduce((n, l) => n + l.versions.length, 0);
  assert.equal(total, options.length);
  for (const line of lines) {
    for (const v of line.versions) assert.equal(v.line, line.key);
  }
});

t("simplifyStats: os números contam a mesma história da lista", () => {
  const stats = simplify.simplifyStats(tracker);
  const options = simplify.simplifyModels(tracker);
  const lines = simplify.groupByLine(options);
  assert.equal(stats.before, tracker.length);
  assert.equal(stats.after, options.length);
  assert.equal(stats.lines, lines.length);
  assert.equal(stats.reducedBy, stats.before - stats.after);
  assert.ok(stats.after <= stats.before);
});

t("simplifyStats: agrupar nunca aumenta a lista", () => {
  for (const fixture of [cronos, tracker, hb20, troublemakers]) {
    const stats = simplify.simplifyStats(fixture);
    assert.ok(stats.after <= stats.before);
  }
});

/* ─── Integração com o matcher ────────────────────────────────── */

const matching = available ? await loadMatching() : null;

const car = (over = {}) => ({
  brand: "GM - Chevrolet",
  model: "TRACKER LTZ 1.8 16V Flex 4x2 Aut.",
  year: 2015,
  estimatedValue: 90000,
  ...over,
});

const want = (over = {}) => ({
  brand: "GM - Chevrolet",
  model: "Tracker",
  version: "1.8 Flex",
  cashAdjustment: 0,
  cashAdjustmentTolerance: 0,
  ...over,
});

t("matcher: carro anunciado satisfaz a versão simplificada", () => {
  // É isto que a lista curta promete: escolher "Tracker 1.8 Flex" alcança o
  // anúncio gravado como "TRACKER LTZ 1.8 16V Flex 4x2 Aut.".
  assert.equal(matching.vehicleMatchesCar(car(), want()), true);
});

t("matcher: motor diferente não casa", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ version: "1.2 Turbo Flex" })), false);
});

t("matcher: câmbio diferente não casa", () => {
  assert.equal(
    matching.vehicleMatchesCar(car(), want({ version: "1.8 Flex Mec" })),
    false,
    "a versão diz mecânica, o carro é automático"
  );
});

t("matcher: o formato que o formulário grava casa", () => {
  // O formulário grava model = linha ("Tracker"), version = motor
  // ("1.8 Flex 16V") e transmission num campo separado ("Automático").
  assert.equal(
    matching.vehicleMatchesCar(
      car(),
      want({ model: "Tracker", version: "1.8 Flex 16V", transmission: "Automático" })
    ),
    true
  );
  // ...e o oposto: anunciar mecânico não alcança quem pediu automático.
  assert.equal(
    matching.vehicleMatchesCar(
      car({ model: "TRACKER LT 1.8 16V Flex 4x2 Mec." }),
      want({ model: "Tracker", version: "1.8 Flex 16V", transmission: "Automático" })
    ),
    false
  );
});

t("matcher: limites de ano continuam valendo na via precisa", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMin: 2016 })), false);
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMax: 2014 })), false);
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMin: 2010, yearMax: 2020 })), true);
});

t("matcher: marca errada continua reprovando", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ brand: "Fiat" })), false);
});

t("matcher: nome completo em `model` (onboarding) casa pelo mesmo carro", () => {
  // O preview do onboarding manda o nome simplificado inteiro em `model`, sem
  // campo `version`. Sem isto, "tracker 1.8 flex" era comparado por substring
  // com "TRACKER LT 1.8 16V Flex 4x2 Aut." e o onboarding respondia "nenhum".
  assert.equal(
    matching.vehicleMatchesCar(car(), want({ model: "Tracker 1.8 Flex", version: undefined })),
    true
  );
  assert.equal(
    matching.vehicleMatchesCar(car(), want({ model: "Tracker 1.2 Turbo Flex", version: undefined })),
    false
  );
});

t("matcher: desejo só por marca mantém o comportamento antigo", () => {
  assert.equal(
    matching.vehicleMatchesCar(car(), want({ model: "Tracker", version: undefined })),
    true
  );
  assert.equal(
    matching.vehicleMatchesCar(car(), want({ model: "Onix", version: undefined })),
    false
  );
});

t("matcher: nome indecomponível cai no heurístico, não quebra", () => {
  const legacyCar = car({ model: "Gol Special 1.6" });
  assert.equal(
    matching.vehicleMatchesCar(legacyCar, want({ brand: "GM - Chevrolet", model: "Gol", version: "Special" })),
    true,
    "substring ainda resolve nomes que o tokenizador não lê"
  );
});
