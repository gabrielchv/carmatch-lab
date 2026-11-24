"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ChainCard, { type ChainWithOwners } from "@/components/ChainCard";
import {
  ArrowRightIcon,
  CarIcon,
  MapPinIcon,
  SparkIcon,
  SwapIcon,
} from "@/components/icons";

interface ChainsResponse {
  chains: ChainWithOwners[];
  count: number;
  detected: number;
  limits: {
    minLength: number;
    maxLength: number;
    maxSteps: number;
    maxChains: number;
  };
}

export default function CorrentesPage() {
  const [data, setData] = useState<ChainsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/chains");
        if (!res.ok) throw new Error("chains failed");
        const json = (await res.json()) as ChainsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar as correntes. Tente novamente.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const feasible = data?.chains.filter((chain) => chain.feasible) ?? [];
  const pending = data?.chains.filter((chain) => !chain.feasible) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink-900">
            Correntes de troca
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            Ninguém precisa querer o seu carro. A corrente fecha quando três a
            cinco pessoas querem, cada uma, o carro da seguinte — e a última
            quer o carro da primeira.
          </p>
        </div>

        {data && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-[12.5px] font-semibold text-white">
              <SwapIcon size={13} />
              {data.count} corrente{data.count === 1 ? "" : "s"}{" "}
              {data.count === 1 ? "possível" : "possíveis"}
            </span>
            {data.detected > data.count && (
              <span className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700 ring-1 ring-amber-200">
                {data.detected - data.count} sem caixa equilibrado
              </span>
            )}
          </div>
        )}
      </div>

      <ChainExplainer />

      {loading ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="skeleton h-72 rounded-[var(--radius-card)]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
          {error}
        </div>
      ) : feasible.length === 0 && pending.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-6 space-y-5">
          {feasible.length === 0 && (
            <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-800">
              Encontramos {pending.length} ciclo
              {pending.length === 1 ? "" : "s"}, mas nenhum fecha o caixa dentro
              das tolerâncias dos anúncios. Ajustar a diferença em dinheiro de um
              dos participantes pode fechar a corrente.
            </div>
          )}

          {feasible.map((chain) => (
            <ChainCard key={chain.id} chain={chain} />
          ))}

          {pending.length > 0 && (
            <details className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink-800">
                Ciclos detectados com caixa pendente ({pending.length})
              </summary>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                A corrente de carros existe, mas a soma dos ajustes de dinheiro
                não fecha. Estes ciclos ficam visíveis para transparência e para
                mostrar onde um ajuste de tolerância resolveria.
              </p>
              <div className="mt-3 space-y-4">
                {pending.map((chain) => (
                  <ChainCard key={chain.id} chain={chain} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ChainExplainer() {
  const steps = [
    {
      icon: <CarIcon size={15} />,
      title: "Você oferece",
      text: "Seu carro entra na corrente com o valor estimado.",
    },
    {
      icon: <ArrowRightIcon size={15} />,
      title: "Você quer o próximo",
      text: "Cada participante aponta para o carro que aceita receber.",
    },
    {
      icon: <MapPinIcon size={15} />,
      title: "A corrente fecha",
      text: "O último quer o carro do primeiro. Todos trocam ao mesmo tempo.",
    },
  ];

  return (
    <section className="mt-5 grid gap-2 rounded-[var(--radius-card)] border border-brand-100 bg-brand-50/60 p-3 sm:grid-cols-3">
      {steps.map((step) => (
        <div key={step.title} className="flex items-start gap-2 rounded-lg bg-white/70 p-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            {step.icon}
          </span>
          <div>
            <p className="text-[11.5px] font-semibold text-ink-800">{step.title}</p>
            <p className="text-[11px] leading-snug text-ink-500">{step.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-brand-200 bg-white px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <SparkIcon size={22} />
      </div>
      <p className="mt-3 text-sm font-semibold text-ink-800">
        Nenhuma corrente fechada no momento
      </p>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-500">
        Uma corrente é um ciclo de 3 a 5 pessoas em que cada uma quer o carro da
        seguinte — e a última quer o carro da primeira —, então todos trocam
        mesmo sem um par recíproco.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/posts/new" className="btn-primary !text-[12.5px]">
          Anunciar meu carro
          <ArrowRightIcon size={14} />
        </Link>
        <Link href="/" className="btn-ghost !text-[12.5px]">
          Ver todos os carros
        </Link>
      </div>
      <p className="mx-auto mt-4 max-w-sm text-[11px] leading-relaxed text-ink-400">
        Quanto mais anúncios com desejos diferentes, maior a chance de uma
        corrente fechar.
      </p>
    </div>
  );
}
