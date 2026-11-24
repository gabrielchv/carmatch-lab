"use client";

import { useMemo } from "react";
import type { CarDetail } from "@/lib/types";
import { valuateCar, type ValuationLabel } from "@/lib/valuation";
import { formatBRL } from "@/lib/cash";
import ValuationBreakdown from "./ValuationBreakdown";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  InfoIcon,
  ScaleIcon,
} from "./icons";

const LABEL_STYLE: Record<ValuationLabel, string> = {
  justo: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "acima do mercado": "bg-rose-50 text-rose-800 ring-rose-200",
  "bem abaixo do mercado": "bg-sky-50 text-sky-800 ring-sky-200",
};

const CONFIDENCE_STYLE = {
  alta: "text-emerald-700",
  média: "text-brand-700",
  baixa: "text-rose-700",
} as const;

export default function ValuationPanel({
  car,
  heading = "Valor justo · modelo Avalia",
}: {
  car: CarDetail;
  heading?: string;
}) {
  const valuation = useMemo(() => valuateCar(car), [car]);
  const deltaPctLabel = `${(Math.abs(valuation.deltaPct) * 100).toLocaleString(
    "pt-BR",
    { maximumFractionDigits: 1 }
  )}%`;

  const deltaSentence =
    valuation.label === "justo"
      ? `O valor pedido está dentro da faixa justa (diferença de R$ ${formatBRL(
          Math.abs(valuation.delta)
        )}).`
      : valuation.label === "acima do mercado"
        ? `O valor pedido está R$ ${formatBRL(
            valuation.delta
          )} (${deltaPctLabel}) acima do valor justo.`
        : `O valor pedido está R$ ${formatBRL(
            Math.abs(valuation.delta)
          )} (${deltaPctLabel}) abaixo do valor justo — vantagem para o comprador, ou sinal de alerta para quem vende.`;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
          <ScaleIcon size={13} />
          {heading}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${LABEL_STYLE[valuation.label]}`}
        >
          {valuation.label}
        </span>
      </div>

      <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-ink-900">
        R$ {formatBRL(valuation.fairValue)}
      </p>
      <p className="mt-1.5 text-[11.5px] text-ink-500">
        Faixa provável: R$ {formatBRL(valuation.low)} a R${" "}
        {formatBRL(valuation.high)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1 text-ink-500">
          <InfoIcon size={11} />
          Confiança{" "}
          <strong className={CONFIDENCE_STYLE[valuation.confidence]}>
            {valuation.confidence}
          </strong>
        </span>
        <span className="text-ink-400">
          ±{Math.round(valuation.bandPct * 100)}%
        </span>
        <span className="text-ink-400">
          {valuation.bodyType === "Desconhecido"
            ? "segmento não identificado"
            : valuation.bodyType}
        </span>
      </div>

      {!valuation.mileageKnown && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] leading-snug text-rose-800">
          <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
          <span>
            Sem quilometragem informada. A faixa ficou bem mais larga e a
            estimativa é menos confiável — trate o número como ponto de partida,
            não como preço fechado.
          </span>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-2.5">
        <p className="flex items-baseline justify-between gap-2 text-[11.5px] text-ink-600">
          <span>Valor pedido no anúncio</span>
          <span className="font-mono text-[12.5px] font-semibold tabular-nums text-ink-800">
            R$ {formatBRL(valuation.referenceValue)}
          </span>
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-700">
          {deltaSentence}
        </p>
      </div>

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-1 py-1.5 text-[11.5px] font-semibold text-brand-700 hover:text-brand-600">
          Ver como chegamos nesse número
          <ChevronDownIcon
            size={14}
            className="transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-1">
          <ValuationBreakdown valuation={valuation} />
        </div>
        {valuation.notes.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-lg bg-ink-100/60 px-2.5 py-2">
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
      </details>

      <p className="mt-2 text-[10px] leading-snug text-ink-400">
        Modelo heurístico a partir da FIPE, quilometragem e histórico declarado.
        Não é laudo nem garantia de preço.
      </p>
    </div>
  );
}
