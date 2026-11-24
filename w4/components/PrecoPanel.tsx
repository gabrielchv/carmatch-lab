"use client";

import Link from "next/link";
import type { CarPost } from "@/lib/types";
import { formatBRL } from "@/lib/cash";
import { valuate } from "@/lib/preco";
import PrecoBreakdown from "./PrecoBreakdown";
import PrecoScoreBadge from "./PrecoScoreBadge";
import { ArrowRightIcon, SparkIcon } from "./icons";

/**
 * Valuation panel for one listing.
 *
 * Replaces the old "Valor estimado" block: the number alone said nothing, and
 * it was just the owner's opinion. The panel shows the fair value, the band,
 * how the ask compares, and — always reachable — the breakdown that produced
 * it. Computed with the same pure module the API uses, so these can never
 * disagree.
 */
export default function PrecoPanel({ post }: { post: CarPost }) {
  const valuation = valuate({ ...post.car });
  const deltaText =
    valuation.delta === 0
      ? "O pedido está exatamente no valor justo."
      : `R$ ${formatBRL(Math.abs(valuation.delta))} ${
          valuation.delta > 0 ? "acima" : "abaixo"
        } do justo (${(Math.abs(valuation.deltaPct) * 100).toLocaleString(
          "pt-BR",
          { maximumFractionDigits: 1 }
        )}%).`;

  return (
    <section className="card overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            <SparkIcon size={12} />
            Preço justo
          </p>
          <PrecoScoreBadge score={valuation.score} />
        </div>

        <p className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
          R$ {formatBRL(valuation.fairValue)}
        </p>
        <p className="mt-0.5 text-[11.5px] text-ink-500">
          Faixa provável R$ {formatBRL(valuation.low)} – R${" "}
          {formatBRL(valuation.high)}
        </p>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-[11.5px]">
          <span className="text-ink-500">Pedido do dono</span>
          <span className="font-semibold tabular-nums text-ink-800">
            R$ {formatBRL(valuation.ask)}
          </span>
        </div>
        <p className="mt-1.5 text-[11.5px] font-medium leading-snug text-ink-600">
          {deltaText}
        </p>
      </div>

      <PrecoBreakdown valuation={valuation} />

      <Link
        href="/preco"
        className="flex items-center justify-between gap-2 border-t border-ink-100 px-4 py-2.5 text-[11.5px] font-medium text-brand-700 transition-colors hover:bg-brand-50/60"
      >
        Calcular outro carro ou um acerto
        <ArrowRightIcon size={13} />
      </Link>
    </section>
  );
}
