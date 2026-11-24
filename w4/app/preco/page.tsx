"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  EXTRA_ADJUSTMENT,
  EXTRA_KEYS,
  EXTRA_LABELS,
  PRECO_ASSUMPTIONS,
  PRECO_DISCLAIMER,
  recommendedSplit,
  valuate,
  type CarExtras,
  type ExtraKey,
  type Valuation,
} from "@/lib/preco";
import { formatBRL } from "@/lib/cash";
import PrecoBreakdown from "@/components/PrecoBreakdown";
import PrecoScoreBadge from "@/components/PrecoScoreBadge";
import { ArrowRightIcon, SparkIcon, SwapIcon } from "@/components/icons";

/**
 * Preço calculator.
 *
 * Must work logged out: no auth, no FIPE round-trip. Everything is computed
 * locally by `lib/preco.ts`, which is pure — the page is the same model as the
 * API and the listing panel, just with the inputs exposed.
 *
 * Two cars because the product is a swap: one panel values "my car", the other
 * values "the car I want", and the difference is the recommended settlement.
 */

interface CarForm {
  brand: string;
  model: string;
  year: string;
  value: string;
  mileage: string;
  extras: CarExtras;
}

const EMPTY_FORM: CarForm = {
  brand: "",
  model: "",
  year: "",
  value: "",
  mileage: "",
  extras: {},
};

const EXAMPLE_A: CarForm = {
  brand: "Honda",
  model: "Fit EX 1.5",
  year: "2014",
  value: "53211",
  mileage: "108500",
  extras: {},
};

const EXAMPLE_B: CarForm = {
  brand: "Toyota",
  model: "Corolla XEi 2.0",
  year: "2019",
  value: "96000",
  mileage: "45000",
  extras: {},
};

/** Form → the minimal car shape the model needs. */
function draftCar(form: CarForm) {
  const year = Number(form.year);
  const estimatedValue = Number(form.value);
  const mileageRaw = form.mileage.trim();
  const mileage = mileageRaw === "" ? undefined : Number(mileageRaw);

  return {
    brand: form.brand.trim(),
    model: form.model.trim(),
    year,
    estimatedValue,
    mileage:
      mileage !== undefined && Number.isFinite(mileage) ? mileage : undefined,
  };
}

/** Only values a car when the three required fields are usable. */
function valuationFor(
  form: CarForm,
  referenceYear: number
): Valuation | null {
  const car = draftCar(form);
  if (!car.model) return null;
  if (
    !Number.isFinite(car.year) ||
    car.year < 1950 ||
    car.year > referenceYear + 1
  ) {
    return null;
  }
  if (!Number.isFinite(car.estimatedValue) || car.estimatedValue <= 0) {
    return null;
  }

  return valuate({
    ...car,
    extras: form.extras,
    referenceYear,
  });
}

/** "+ R$ 42.507" / "− R$ 12.000" / "R$ 0" */
function signedBRL(value: number): string {
  if (value === 0) return "R$ 0";
  return `${value > 0 ? "+" : "−"} R$ ${formatBRL(Math.abs(value))}`;
}

export default function PrecoPage() {
  const referenceYear = new Date().getFullYear();

  const [carA, setCarA] = useState<CarForm>(EXAMPLE_A);
  const [carB, setCarB] = useState<CarForm>(EXAMPLE_B);

  const valuationA = useMemo(
    () => valuationFor(carA, referenceYear),
    [carA, referenceYear]
  );
  const valuationB = useMemo(
    () => valuationFor(carB, referenceYear),
    [carB, referenceYear]
  );

  const split = useMemo(() => {
    if (!valuationA || !valuationB) return null;
    return recommendedSplit(
      { car: draftCar(carA) },
      { car: draftCar(carB) },
      { referenceYear }
    );
  }, [valuationA, valuationB, carA, carB, referenceYear]);

  const direction = split
    ? split.fromAtoB === 0
      ? "Troca direta, sem dinheiro na diferença."
      : split.fromAtoB > 0
        ? "O carro A paga o carro B."
        : "O carro B paga o carro A."
    : "";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      <header className="max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-brand-200">
          <SparkIcon size={12} />
          Preço · heurística brasileira
        </span>
        <h1 className="mt-3 text-balance text-[26px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[32px]">
          Quanto vale, de verdade?
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          O valor anunciado é o que o dono pediu. O Preço ajusta esse número por
          quilometragem, ano, carroceria e conservação declarada — e mostra a
          conta linha por linha. Funciona sem login.
        </p>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
        <CarCard
          label="Carro A — o seu"
          hint="É ele que entra na troca."
          form={carA}
          onChange={setCarA}
          valuation={valuationA}
          accent
        />
        <CarCard
          label="Carro B — o do outro"
          hint="Opcional: preencha para calcular o acerto."
          form={carB}
          onChange={setCarB}
          valuation={valuationB}
        />
      </div>

      {split && (
        <section className="card mt-5 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <SwapIcon size={15} />
            <h2 className="text-sm font-semibold text-ink-900">
              Acerto recomendado
            </h2>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-start">
            <div className="rounded-lg bg-brand-50/70 p-3 ring-1 ring-brand-200">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                Diferença justa
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink-900">
                R$ {formatBRL(Math.abs(split.fromAtoB))}
              </p>
              <p className="text-[11.5px] font-medium text-brand-800">
                {direction}
              </p>
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-500">
                Faixa provável: {signedBRL(split.low)} a {signedBRL(split.high)}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-[11.5px] leading-relaxed text-ink-600">
                {split.reason}
              </p>
              <div className="mt-2 grid gap-1 text-[11px] text-ink-500 sm:grid-cols-2">
                <p>
                  Carro A vale R${" "}
                  <strong className="font-semibold text-ink-800">
                    {formatBRL(split.valuationA.fairValue)}
                  </strong>
                </p>
                <p>
                  Carro B vale R${" "}
                  <strong className="font-semibold text-ink-800">
                    {formatBRL(split.valuationB.fairValue)}
                  </strong>
                </p>
              </div>
              <p className="mt-2 text-[10.5px] text-ink-400">
                Diferença positiva = A paga B. É a mesma convenção usada nos
                matches do CarMatch.
              </p>
            </div>
          </div>
        </section>
      )}

      <details className="card mt-5 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12px] font-semibold text-ink-700 hover:bg-ink-50/70 [&::-webkit-details-marker]:hidden">
          Premissas do modelo
          <span className="text-[11px] font-normal text-ink-400">
            todas as constantes
          </span>
        </summary>
        <dl className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
          {PRECO_ASSUMPTIONS.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-ink-100 bg-ink-50/50 p-3"
            >
              <dt className="text-[11px] font-semibold text-ink-800">
                {item.title}
              </dt>
              <dd className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
        {PRECO_DISCLAIMER}{" "}
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Ver carros
        </Link>
        <span className="mx-1.5 text-ink-300">·</span>
        <Link
          href="/boas-vindas"
          className="font-medium text-brand-700 hover:underline"
        >
          Descobrir meus matches
          <ArrowRightIcon size={11} className="ml-0.5 inline" />
        </Link>
      </p>
    </div>
  );
}

/* ─── One car form + its live valuation ───────────────────────── */

function CarCard({
  label,
  hint,
  form,
  onChange,
  valuation,
  accent = false,
}: {
  label: string;
  hint: string;
  form: CarForm;
  onChange: (next: CarForm) => void;
  valuation: Valuation | null;
  accent?: boolean;
}) {
  const set = (patch: Partial<CarForm>) => onChange({ ...form, ...patch });

  const toggleExtra = (key: ExtraKey) => {
    onChange({
      ...form,
      extras: { ...form.extras, [key]: !form.extras[key] },
    });
  };

  return (
    <section
      className={`card overflow-hidden ${
        accent ? "ring-1 ring-brand-200" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div>
          <h2 className="text-[13.5px] font-semibold text-ink-900">{label}</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-500">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FORM, extras: {} })}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          Limpar
        </button>
      </div>

      <div className="grid gap-2.5 px-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-700">
            Marca
          </span>
          <input
            type="text"
            value={form.brand}
            onChange={(e) => set({ brand: e.target.value })}
            placeholder="Honda"
            className="input-field"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-700">
            Modelo *
          </span>
          <input
            type="text"
            value={form.model}
            onChange={(e) => set({ model: e.target.value })}
            placeholder="Fit EX 1.5"
            className="input-field"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-700">
            Ano *
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={form.year}
            onChange={(e) => set({ year: e.target.value })}
            placeholder="2014"
            min={1950}
            max={new Date().getFullYear() + 1}
            className="input-field"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-700">
            Valor declarado (R$) *
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={form.value}
            onChange={(e) => set({ value: e.target.value })}
            placeholder="53211"
            min={1}
            className="input-field"
            required
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-700">
            Quilometragem (km)
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={form.mileage}
            onChange={(e) => set({ mileage: e.target.value })}
            placeholder="108500"
            min={0}
            className="input-field"
          />
        </label>
      </div>

      <fieldset className="mt-3 px-4">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          Conservação declarada
        </legend>
        <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {EXTRA_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-[11.5px] text-ink-700 hover:bg-ink-50/70"
            >
              <input
                type="checkbox"
                checked={Boolean(form.extras[key])}
                onChange={() => toggleExtra(key)}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              <span className="flex-1 leading-snug">{EXTRA_LABELS[key]}</span>
              <span className="shrink-0 text-[10.5px] tabular-nums text-ink-400">
                +{(EXTRA_ADJUSTMENT[key] * 100).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="p-4 pt-3">
        {valuation ? (
          <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                  Preço justo
                </span>
                <PrecoScoreBadge score={valuation.score} />
              </div>
              <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-ink-900">
                R$ {formatBRL(valuation.fairValue)}
              </p>
              <p className="text-[11.5px] text-ink-500">
                Faixa R$ {formatBRL(valuation.low)} – R${" "}
                {formatBRL(valuation.high)}
              </p>
              <p className="mt-1 text-[10.5px] text-ink-400">
                {valuation.bodyType === "Outro"
                  ? "Carroceria não identificada"
                  : `Carroceria ${valuation.bodyType}`}{" "}
                · {valuation.expectedMileage.toLocaleString("pt-BR")} km
                esperados
              </p>
            </div>
            <PrecoBreakdown valuation={valuation} defaultOpen />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-3 py-6 text-center text-[11.5px] leading-relaxed text-ink-400">
            Preencha modelo, ano e valor declarado para ver o preço justo.
          </p>
        )}
      </div>
    </section>
  );
}
