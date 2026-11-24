"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DealPostView, DealStage, DealView } from "@/lib/types";
import { formatBRL } from "@/lib/cash";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CarIcon,
  ClockIcon,
  FileCheckIcon,
  PhotoIcon,
  SwapIcon,
} from "@/components/icons";

function stageTone(stage: DealStage): string {
  if (stage === "concluida") {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  }
  if (stage === "cancelada") {
    return "bg-red-50 text-red-700 ring-red-200";
  }
  return "bg-brand-50 text-brand-700 ring-brand-200";
}

function MiniCar({
  post,
  label,
  highlight,
}: {
  post: DealPostView;
  label: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 rounded-lg border p-2.5 ${
        highlight ? "border-emerald-200 bg-emerald-50/40" : "border-ink-200 bg-white"
      }`}
    >
      <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md bg-ink-100">
        {post.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/uploads/${post.image}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-400">
            <PhotoIcon size={15} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          {label}
        </p>
        <p className="truncate text-[12px] font-semibold text-ink-900">
          {post.title}
        </p>
        <p className="text-[11px] text-ink-500">
          R$ {formatBRL(post.car.estimatedValue)}
          {post.car.year > 0 ? ` · ${post.car.year}` : ""}
        </p>
      </div>
    </div>
  );
}

function DealListCard({ deal }: { deal: DealView }) {
  const viewerPost = deal.viewerSide === "A" ? deal.postA : deal.postB;
  const otherPost = deal.viewerSide === "A" ? deal.postB : deal.postA;

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${stageTone(deal.stage)}`}
          >
            {deal.stage === "cancelada" ? "Cancelada" : deal.stageLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-400">
            <ClockIcon size={11} />
            {new Date(deal.updatedAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        </div>
        <span className="text-[12px] font-semibold text-ink-700">
          {deal.progress}%
        </span>
      </div>

      <div className="grid gap-2 px-4 pt-3 sm:grid-cols-2">
        <MiniCar post={viewerPost} label="Você" highlight />
        <MiniCar post={otherPost} label="A outra parte" highlight={false} />
      </div>

      <div className="px-4 pt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full ${
              deal.stage === "cancelada" ? "bg-red-400" : "bg-brand-600"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, deal.progress))}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] font-medium text-ink-700">
          {deal.viewerCash.label}
        </p>
      </div>

      <div className="px-4 pt-2">
        {deal.stage === "cancelada" ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[11.5px] text-red-700">
            {deal.cancelReason ?? "Negociação cancelada."}
          </p>
        ) : deal.stage === "concluida" ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">
            Troca fechada. Documentos, contrato e transferência concluídos.
          </p>
        ) : deal.blockers.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">
            Tudo pronto para avançar de etapa.
          </p>
        ) : (
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[11.5px] font-semibold text-amber-800">
              <AlertTriangleIcon size={12} />
              {deal.blockers.length} pendência
              {deal.blockers.length === 1 ? "" : "s"} para avançar
            </p>
            <ul className="mt-1 space-y-0.5">
              {deal.blockers.slice(0, 3).map((blocker) => (
                <li key={blocker.taskId} className="text-[11px] text-amber-800">
                  {blocker.sideLabel}: {blocker.title}
                </li>
              ))}
              {deal.blockers.length > 3 && (
                <li className="text-[11px] text-amber-700">
                  + {deal.blockers.length - 3} outra
                  {deal.blockers.length - 3 === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-3">
        <span className="inline-flex items-center gap-1 text-[11px] text-ink-400">
          <CarIcon size={12} />
          Os dois carros desta troca
        </span>
        <Link
          href={`/negociacoes/${deal.id}`}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-600"
        >
          Abrir sala
          <ArrowRightIcon size={13} />
        </Link>
      </div>
    </article>
  );
}

export default function DealsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<DealView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Ask who we are before calling an auth-only endpoint: blind-calling
        // /api/deals while signed out logs a red 401 in the console for every
        // visitor, before the redirect even lands.
        const meRes = await fetch("/api/auth/me");
        const me = meRes.ok ? await meRes.json() : { user: null };
        if (!me.user) {
          router.replace("/auth?redirectTo=/negociacoes");
          return;
        }

        const res = await fetch("/api/deals");
        if (res.status === 401) {
          router.replace("/auth?redirectTo=/negociacoes");
          return;
        }
        if (!res.ok) throw new Error("deals failed");
        const data = (await res.json()) as { deals: DealView[] };
        if (!cancelled) setDeals(data.deals);
      } catch {
        if (!cancelled) setError("Não foi possível carregar suas negociações.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="skeleton mb-2 h-6 w-44" />
        <div className="skeleton mb-6 h-3 w-72" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="skeleton h-56 rounded-[var(--radius-card)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-sm text-ink-600">{error}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="btn-ghost mt-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const active = (deals ?? []).filter((deal) => deal.stage !== "cancelada");
  const cancelled = (deals ?? []).filter((deal) => deal.stage === "cancelada");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
            Troca Fechada
          </p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink-900">
            Negociações
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-500">
            O match é o começo. Aqui vocês conduzem vistoria, documentos,
            contrato e transferência no Detran até a troca estar fechada.
          </p>
        </div>
        <Link href="/my-posts" className="btn-ghost !text-[12.5px]">
          Ver meus matches
        </Link>
      </div>

      {active.length === 0 && cancelled.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <FileCheckIcon size={20} />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-800">
            Nenhuma negociação aberta
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
            Abra uma negociação a partir de um match em Meus anúncios. A sala
            organiza cada exigência da troca, dos dois lados.
          </p>
          <Link href="/my-posts" className="btn-primary mt-5 !text-[12.5px]">
            <SwapIcon size={14} />
            Ir para meus anúncios
          </Link>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          {active.map((deal) => (
            <DealListCard key={deal.id} deal={deal} />
          ))}

          {cancelled.length > 0 && (
            <details className="rounded-[var(--radius-card)] border border-ink-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-[12.5px] font-semibold text-ink-600">
                Canceladas ({cancelled.length})
              </summary>
              <div className="space-y-4 border-t border-ink-100 p-4">
                {cancelled.map((deal) => (
                  <DealListCard key={deal.id} deal={deal} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
