"use client";

import { useState } from "react";
import Link from "next/link";
import type { CarDetail } from "@/lib/types";
import {
  EXTRA_OPTIONS,
  valuateCar,
  type VehicleExtras,
} from "@/lib/valuation";
import { formatBRL } from "@/lib/cash";
import ValuationBreakdown from "./ValuationBreakdown";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalculatorIcon,
  InfoIcon,
  ScaleIcon,
} from "./icons";

interface Preset {
  label: string;
  brand: string;
  model: string;
  year: number;
  reference: number;
  mileage: number;
}

const PRESETS: Preset[] = [
  {
    label: "Honda Fit 2018",
    brand: "Honda",
    model: "Fit EX/S 1.5 Flex/Flexone 16V 5p Aut.",
    year: 2018,
    reference: 72900,
    mileage: 78000,
  },
  {
    label: "Toyota Corolla 2020",
    brand: "Toyota",
    model: "Corolla XEi 2.0 Flex 16V Aut.",
    year: 2020,
    reference: 112000,
    mileage: 150000,
  },
  {
    label: "Fiat Uno 2013",
    brand: "Fiat",
    model: "Uno Mille Grazie 1.0 Fire Flex 8v 4p",
    year: 2013,
    reference: 42680,
    mileage: 54000,
  },
  {
    label: "Chevrolet S10 2019",
    brand: "Chevrolet",
    model: "S10 Pick-Up LT 2.8 Diesel",
    year: 2019,
    reference: 210000,
    mileage: 120000,
  },
];

const LABEL_STYLE = {
  justo: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "acima do mercado": "bg-rose-50 text-rose-800 ring-rose-200",
  "bem abaixo do mercado": "bg-sky-50 text-sky-800 ring-sky-200",
} as const;

const CONFIDENCE_STYLE = {
  alta: "text-emerald-700",
  média: "text-brand-700",
  baixa: "text-rose-700",
} as const;

function signedBRL(value: number): string {
  if (value === 0) return "R$ 0";
  return `${value > 0 ? "+" : "−"} R$ ${formatBRL(Math.abs(value))}`;
}

export default function AvaliarClient() {
  const referenceYear = new Date().getFullYear();

  const [brand, setBrand] = useState("Honda");
  const [model, setModel] = useState("Fit EX/S 1.5 Flex/Flexone 16V 5p Aut.");
  const [year, setYear] = useState("2018");
  const [reference, setReference] = useState("72900");
  const [mileage, setMileage] = useState("78000");
  const [mileageUnknown, setMileageUnknown] = useState(false);
  const [extras, setExtras] = useState<VehicleExtras>({
    singleOwner: true,
    fullServiceHistory: true,
  });

  const referenceValue = Number(reference);
  const yearValue = Number(year);
  const mileageValue = Number(mileage);

  const car: CarDetail | null =
    Number.isFinite(referenceValue) &&
    referenceValue > 0 &&
    Number.isFinite(yearValue) &&
    yearValue >= 1950
      ? {
          brand: brand.trim() || "Marca não informada",
          model: model.trim() || "Modelo não informado",
          year: yearValue,
          estimatedValue: referenceValue,
          mileage:
            mileageUnknown || !Number.isFinite(mileageValue)
              ? undefined
              : Math.max(0, mileageValue),
        }
      : null;

  const valuation = car
    ? valuateCar(car, { extras, referenceYear })
    : null;

  const toggleExtra = (key: keyof VehicleExtras) => {
    setExtras((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyPreset = (preset: Preset) => {
    setBrand(preset.brand);
    setModel(preset.model);
    setYear(String(preset.year));
    setReference(String(preset.reference));
    setMileage(String(preset.mileage));
    setMileageUnknown(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-7">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
          <CalculatorIcon size={12} />
          Calculadora de valor justo
        </p>
        <h1 className="mt-3 text-balance text-[28px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[34px]">
          A troca fecha quando o número é justo.
          <span className="text-brand-600"> A gente mostra o número.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
          A FIPE é uma referência, não o preço da negociação. Ajustamos o valor
          pela quilometragem real, idade, segmento e histórico declarado — e
          mostramos cada ajuste em reais. Nenhum número aparece sem explicação.
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
          Exemplos:
        </span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
        {/* ── Form ── */}
        <section className="card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
            <ScaleIcon size={15} className="text-brand-600" />
            Dados do carro
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-500">
            Use o valor da Tabela FIPE como ponto de partida.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label
                htmlFor="aval-brand"
                className="mb-1 block text-[11px] font-medium text-ink-600"
              >
                Marca
              </label>
              <input
                id="aval-brand"
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex.: Honda"
                className="input-field"
              />
            </div>

            <div className="col-span-2">
              <label
                htmlFor="aval-model"
                className="mb-1 block text-[11px] font-medium text-ink-600"
              >
                Modelo / versão
              </label>
              <input
                id="aval-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex.: Fit EX 1.5 Aut."
                className="input-field"
              />
            </div>

            <div>
              <label
                htmlFor="aval-year"
                className="mb-1 block text-[11px] font-medium text-ink-600"
              >
                Ano
              </label>
              <input
                id="aval-year"
                type="number"
                inputMode="numeric"
                min={1950}
                max={referenceYear + 1}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="input-field font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="aval-ref"
                className="mb-1 block text-[11px] font-medium text-ink-600"
              >
                Valor de referência (R$)
              </label>
              <input
                id="aval-ref"
                type="number"
                inputMode="numeric"
                min={1}
                step={100}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="input-field font-mono"
              />
            </div>

            <div className="col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="aval-km"
                  className="text-[11px] font-medium text-ink-600"
                >
                  Quilometragem (km)
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-ink-500">
                  <input
                    type="checkbox"
                    checked={mileageUnknown}
                    onChange={(e) => setMileageUnknown(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--color-brand-600)]"
                  />
                  Não sei
                </label>
              </div>
              <input
                id="aval-km"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={mileage}
                disabled={mileageUnknown}
                onChange={(e) => setMileage(e.target.value)}
                className="input-field font-mono disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400"
              />
              {mileageUnknown && (
                <p className="mt-1 flex items-start gap-1 text-[10.5px] leading-snug text-rose-700">
                  <AlertTriangleIcon size={11} className="mt-0.5 shrink-0" />
                  Sem km, a faixa alarga: o modelo não inventa um ajuste de uso.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Histórico documentado
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-ink-400">
              Itens declarados pelo dono. São um prêmio pequeno e explícito, não
              uma verificação.
            </p>
            <div className="mt-2 space-y-1.5">
              {EXTRA_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                    extras[option.key]
                      ? "border-brand-300 bg-brand-50/60"
                      : "border-ink-200 bg-white hover:bg-ink-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(extras[option.key])}
                    onChange={() => toggleExtra(option.key)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand-600)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-medium text-ink-800">
                      {option.label}
                      <span className="ml-1 font-mono text-[10.5px] text-brand-700">
                        +{(option.pct * 100).toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </span>
                    </span>
                    <span className="block text-[10px] leading-snug text-ink-500">
                      {option.why}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-ink-100/70 px-2.5 py-2 text-[10px] leading-snug text-ink-500">
            <InfoIcon size={12} className="mt-0.5 shrink-0" />
            Modelo heurístico: não substitui vistoria, laudo cautelar nem a
            negociação real entre as partes.
          </p>
        </section>

        {/* ── Result ── */}
        <section aria-live="polite">
          {valuation ? (
            <div className="card overflow-hidden">
              <div className="border-b border-ink-100 bg-gradient-to-br from-brand-50 via-white to-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
                    Valor justo estimado
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ring-1 ${LABEL_STYLE[valuation.label]}`}
                  >
                    {valuation.label}
                  </span>
                </div>

                <p className="mt-1.5 text-[36px] font-bold leading-none tracking-tight text-ink-900">
                  R$ {formatBRL(valuation.fairValue)}
                </p>
                <p className="mt-2 text-[12px] text-ink-600">
                  Faixa provável:{" "}
                  <span className="font-mono font-semibold text-ink-800">
                    R$ {formatBRL(valuation.low)}
                  </span>{" "}
                  a{" "}
                  <span className="font-mono font-semibold text-ink-800">
                    R$ {formatBRL(valuation.high)}
                  </span>
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                  <span>
                    Confiança{" "}
                    <strong className={CONFIDENCE_STYLE[valuation.confidence]}>
                      {valuation.confidence}
                    </strong>
                  </span>
                  <span>±{Math.round(valuation.bandPct * 100)}%</span>
                  <span>
                    {valuation.bodyType === "Desconhecido"
                      ? "segmento não identificado"
                      : valuation.bodyType}
                  </span>
                  {valuation.actualMileage !== null && (
                    <span>
                      {valuation.actualMileage.toLocaleString("pt-BR")} km
                      informados
                    </span>
                  )}
                </div>

                {!valuation.mileageKnown && (
                  <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] leading-snug text-rose-800">
                    <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
                    <span>
                      Estimativa menos confiável: sem quilometragem, a faixa
                      alarga e o ajuste de uso não pode ser calculado. Não trate
                      esse número como preço fechado.
                    </span>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Stat
                    label="Referência"
                    value={`R$ ${formatBRL(valuation.referenceValue)}`}
                  />
                  <Stat
                    label="Ajuste do modelo"
                    value={signedBRL(valuation.fairValue - valuation.referenceValue)}
                  />
                  <Stat
                    label="Pedido vs. justo"
                    value={signedBRL(valuation.delta)}
                    tone={valuation.delta > 0 ? "negative" : valuation.delta < 0 ? "positive" : "neutral"}
                  />
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-semibold text-ink-900">
                    Como o número foi montado
                  </h2>
                  <span className="text-[10.5px] text-ink-400">
                    cada linha soma para o valor justo
                  </span>
                </div>
                <div className="mt-2">
                  <ValuationBreakdown valuation={valuation} />
                </div>

                {valuation.notes.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-ink-100/60 px-3 py-2">
                    {valuation.notes.map((note) => (
                      <li
                        key={note}
                        className="flex items-start gap-1.5 text-[10.5px] leading-snug text-ink-500"
                      >
                        <InfoIcon size={11} className="mt-0.5 shrink-0" />
                        {note}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/comparar"
                    className="btn-primary !text-[12px]"
                  >
                    Comparar dois carros na troca
                    <ArrowRightIcon size={13} />
                  </Link>
                  <Link href="/" className="btn-ghost !text-[12px]">
                    Ver anúncios
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="card flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <CalculatorIcon size={26} className="text-ink-300" />
              <p className="mt-3 text-sm font-semibold text-ink-700">
                Informe marca, modelo, ano e valor de referência
              </p>
              <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-500">
                Assim que houver um valor válido, o cálculo aparece aqui com a
                faixa de confiança e o detalhamento em reais.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-700"
        : "text-ink-800";
  return (
    <div className="rounded-lg border border-ink-200 bg-white/80 px-2.5 py-2">
      <p className="text-[9.5px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate font-mono text-[12px] font-semibold tabular-nums ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}
