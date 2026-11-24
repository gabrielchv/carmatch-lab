/**
 * The compatibility rule decides whether two people are ever shown to each
 * other. It has been wrong before (the "Aut" vs "Aut." transmission bug), so it
 * is tested against the shapes FIPE actually produces.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { loadMatching } from "../lib/load.mjs";

const matching = await loadMatching();

const car = (over = {}) => ({
  brand: "Honda",
  model: "Fit EX 1.5",
  year: 2015,
  estimatedValue: 50000,
  ...over,
});

const want = (over = {}) => ({
  brand: "Honda",
  model: "Fit",
  cashAdjustment: 0,
  cashAdjustmentTolerance: 0,
  ...over,
});

test("marca: compara sem diferenciar maiúsculas", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ brand: "honda" })), true);
  assert.equal(matching.vehicleMatchesCar(car(), want({ brand: "HONDA" })), true);
});

test("marca: marca diferente reprova", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ brand: "Toyota" })), false);
});

test("modelo: prefixo casa", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ model: "Fit" })), true);
  assert.equal(matching.vehicleMatchesCar(car(), want({ model: "fit" })), true);
});

test("modelo: substring no meio também casa", () => {
  const c = car({ brand: "Hyundai", model: "HB20 Vision 1.6" });
  assert.equal(matching.vehicleMatchesCar(c, want({ brand: "Hyundai", model: "Vision" })), true);
});

test("modelo: modelo diferente reprova", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ model: "Civic" })), false);
});

test("ano: limites são inclusivos", () => {
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMin: 2015 })), true);
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMax: 2015 })), true);
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMin: 2016 })), false);
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMax: 2014 })), false);
  assert.equal(matching.vehicleMatchesCar(car(), want({ yearMin: 2010, yearMax: 2020 })), true);
});

test("transmissão: reconhece 'Aut.' com ponto", () => {
  const c = car({ model: "Fit EX 1.5 Aut." });
  assert.equal(matching.vehicleMatchesCar(c, want({ transmission: "Automático" })), true);
  assert.equal(matching.vehicleMatchesCar(c, want({ transmission: "Manual" })), false);
});

test("transmissão: reconhece 'Aut' SEM ponto — regressão real do FIPE", () => {
  const c = car({ brand: "Hyundai", model: "HB20 Vision 1.6 Flex 16V Aut" });
  // Marca/modelo sem restrição: o que está sob teste aqui é a transmissão.
  assert.equal(
    matching.vehicleMatchesCar(c, want({ brand: "", model: "", transmission: "Automático" })),
    true
  );
});

test("transmissão: 'Mec' e 'Mec.' ambos contam como manual", () => {
  for (const model of ["Fit LX 1.4 Mec.", "Fit LX 1.4 Mec"]) {
    const c = car({ model });
    assert.equal(matching.vehicleMatchesCar(c, want({ transmission: "Manual" })), true, model);
    assert.equal(matching.vehicleMatchesCar(c, want({ transmission: "Automático" })), false, model);
  }
});

test("transmissão: não confunde 'Automático' com um modelo que só contém 'aut' noutra palavra", () => {
  // "Autorizada" não é transmissão; a regex exige fim de token.
  const c = car({ model: "Fit Autorizada 1.5" });
  assert.equal(matching.vehicleMatchesCar(c, want({ transmission: "Automático" })), false);
});

test("hasAutomaticTransmission / hasManualTransmission: contrato direto", () => {
  assert.equal(matching.hasAutomaticTransmission("Fit 1.5 Aut."), true);
  assert.equal(matching.hasAutomaticTransmission("Fit 1.5 Aut"), true);
  assert.equal(matching.hasAutomaticTransmission("Fit 1.5 Automação"), false);
  assert.equal(matching.hasManualTransmission("Fit 1.5 Mec"), true);
  assert.equal(matching.hasManualTransmission("Fit 1.5 Aut"), false);
});

test("tipo de veículo: modo tipo ignora marca e modelo", () => {
  const c = car({ model: "Renegade Sport 1.8" });
  // "suv" não aparece no nome, então o tipo é indeterminado e o match é permissivo
  assert.equal(matching.vehicleMatchesCar(c, want({ vehicleType: "SUV" })), true);
});

test("tipo de veículo: hatch reconhecido pelo nome", () => {
  const c = car({ model: "Fit Hatch 1.5" });
  assert.equal(matching.vehicleMatchesCar(c, want({ vehicleType: "Hatch" })), true);
  assert.equal(matching.vehicleMatchesCar(c, want({ vehicleType: "Sedan" })), false);
});

test("sem restrição alguma, qualquer carro casa", () => {
  const c = car({ brand: "Qualquer", model: "Coisa", year: 1999 });
  assert.equal(matching.vehicleMatchesCar(c, want({ brand: "", model: "" })), true);
});

test("quilometragem não bloqueia o veículo (é critério de score)", () => {
  // vehicleMatchesCar cuida de marca/modelo/ano; km entra no score, não aqui.
  const c = car({ model: "Fit 1.5", mileage: 300000 });
  assert.equal(matching.vehicleMatchesCar(c, want({ mileageMax: 50000 })), true);
});
