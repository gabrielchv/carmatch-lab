"use client";

import Link from "next/link";
import type { Chain } from "@/lib/chains";
import type { CarPost, DesiredVehicle } from "@/lib/types";
import { formatBRL } from "@/lib/cash";
import {
  ArrowRightIcon,
  CarIcon,
  CheckIcon,
  MapPinIcon,
  SwapIcon,
} from "./icons";

export interface ChainOwner {
  id: string;
  name: string;
}

export interface ChainWithOwners extends Chain {
  owners: Record<string, ChainOwner | null>;
}

/** Positive delta = this participant pays; negative = receives. */
function cashDeltaLabel(delta: number): string {
  if (Math.abs(delta) < 1) return "sem dinheiro";
  return delta > 0
    ? `paga R$ ${formatBRL(delta)}`
    : `recebe R$ ${formatBRL(Math.abs(delta))}`;
}

function wantLabel(want: DesiredVehicle): string {
  if (want.vehicleType) return `${want.vehicleType} (qualquer modelo)`;
  const name = [want.brand, want.model].filter(Boolean).join(" ").trim();
  return name || "qualquer carro";
}

interface Point {
  x: number;
  y: number;
}

/** Evenly spaced points on a circle, starting at 12 o'clock. */
function ringPositions(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    return {
      x: 50 + 35 * Math.cos(angle),
      y: 50 + 35 * Math.sin(angle),
    };
  });
}

function shortenLine(from: Point, to: Point, pad: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: from.x + ux * pad,
    y1: from.y + uy * pad,
    x2: to.x - ux * pad,
    y2: to.y - uy * pad,
  };
}

function ChainThumb({ post, size = 34 }: { post: CarPost; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-100 text-ink-400"
      style={{ width: size * 1.35, height: size }}
    >
      {post.images.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/uploads/${post.images[0]}`}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <CarIcon size={Math.round(size * 0.55)} />
      )}
    </span>
  );
}

/** Decorative ring. The interactive, accessible version is the list below. */
function ChainRing({ chain }: { chain: ChainWithOwners }) {
  const positions = ringPositions(chain.posts.length);
  const markerId = `arrow-${chain.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[400px]" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-brand-400" />
          </marker>
        </defs>
        {positions.map((point, index) => {
          const next = positions[(index + 1) % positions.length];
          const line = shortenLine(point, next, 14);
          return (
            <line
              key={index}
              {...line}
              className="stroke-brand-300"
              strokeWidth="0.9"
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
      </svg>

      {/* Aggregate score in the hole of the ring. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-2xl font-bold tracking-tight text-brand-700">
          {chain.score}
          <span className="text-xs font-semibold text-ink-400">/100</span>
        </p>
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
          corrente de {chain.size}
        </p>
      </div>

      {positions.map((point, index) => {
        const post = chain.posts[index];
        const owner = chain.owners[post.id];
        const delta = chain.cashDeltas[index] ?? 0;
        return (
          <div
            key={post.id}
            className="absolute w-[104px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-ink-200 bg-white p-1.5 shadow-sm"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            <div className="flex items-center gap-1">
              <ChainThumb post={post} size={26} />
              <span className="truncate text-[10px] font-semibold text-ink-800">
                {owner?.name?.split(" ")[0] ?? "Dono"}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-tight text-ink-900">
              {post.title}
            </p>
            <p className="truncate text-[9px] text-ink-400">
              {post.car.localization ?? "Local não informado"}
            </p>
            <p className="truncate text-[9.5px] text-ink-500">
              R$ {formatBRL(post.car.estimatedValue)}
            </p>
            <p
              className={`mt-0.5 truncate text-[9.5px] font-semibold ${
                delta > 0
                  ? "text-amber-700"
                  : delta < 0
                    ? "text-emerald-700"
                    : "text-ink-400"
              }`}
            >
              {cashDeltaLabel(delta)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function ChainCard({ chain }: { chain: ChainWithOwners }) {
  const feasible = chain.feasible;

  return (
    <article
      className={`overflow-hidden rounded-[var(--radius-card)] border bg-white ${
        feasible ? "border-brand-200" : "border-amber-200"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white">
              <SwapIcon size={12} />
              Corrente de {chain.size}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                feasible
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
              }`}
            >
              {feasible ? <CheckIcon size={11} /> : null}
              {feasible ? "Corrente fechada" : "Caixa não fecha"}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
            Cada pessoa quer o carro da seguinte. Ninguém precisa querer o carro
            de quem quer o seu.
          </p>
        </div>

        <div className="text-right">
          <p className="text-xl font-bold tracking-tight text-ink-900">
            {chain.score}
            <span className="text-[11px] font-semibold text-ink-400">/100</span>
          </p>
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-400">
            compatibilidade
          </p>
        </div>
      </header>

      {/* Score bar keeps the aggregate number legible at a glance. */}
      <div className="h-1 w-full bg-ink-100">
        <div
          className={`h-full ${feasible ? "bg-brand-500" : "bg-amber-400"}`}
          style={{ width: `${Math.min(100, Math.max(0, chain.score))}%` }}
        />
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="hidden md:block">
          <ChainRing chain={chain} />
        </div>

        <div className="min-w-0">
          <ol className="space-y-1">
            {chain.posts.map((post, index) => {
              const nextPost = chain.posts[(index + 1) % chain.posts.length];
              const nextOwner = chain.owners[nextPost.id];
              const edge = chain.edges[index];
              const delta = chain.cashDeltas[index] ?? 0;
              const owner = chain.owners[post.id];
              const last = index === chain.posts.length - 1;

              return (
                <li key={post.id}>
                  <div className="flex items-start gap-2.5 rounded-xl border border-ink-100 bg-ink-50/50 p-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10.5px] font-bold text-brand-700">
                      {index + 1}
                    </span>

                    <ChainThumb post={post} size={38} />

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/posts/${post.id}`}
                        className="line-clamp-1 text-[12.5px] font-semibold text-ink-900 hover:text-brand-700"
                      >
                        {post.title}
                      </Link>
                      <p className="truncate text-[11px] text-ink-500">
                        {owner?.name ?? "Anunciante"}
                        {post.car.localization ? (
                          <span className="inline-flex items-center gap-0.5">
                            {" · "}
                            <MapPinIcon size={10} />
                            {post.car.localization}
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[11.5px] font-semibold text-ink-800">
                          R$ {formatBRL(post.car.estimatedValue)}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            delta > 0
                              ? "bg-amber-50 text-amber-700"
                              : delta < 0
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-ink-100 text-ink-500"
                          }`}
                        >
                          {cashDeltaLabel(delta)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-ink-500">
                    {last ? (
                      <SwapIcon size={11} className="shrink-0 text-brand-500" />
                    ) : (
                      <ArrowRightIcon size={11} className="shrink-0 text-brand-500" />
                    )}
                    <span className="truncate">
                      {last ? "fecha o ciclo querendo " : "quer "}
                      <span className="font-semibold text-brand-700">
                        {wantLabel(edge.want)}
                      </span>
                      {" de "}
                      <span className="font-medium text-ink-700">
                        {nextOwner?.name ?? "outro anunciante"}
                      </span>
                      <span className="text-ink-400">
                        {" "}
                        · compat. {edge.score}%
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          {!feasible && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
              {chain.reasons[0] ??
                "O caixa não fecha dentro das tolerâncias informadas."}
            </div>
          )}

          {chain.warnings.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              {chain.warnings[0]}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-ink-200 pt-2.5">
            <p className="text-[11px] text-ink-500">
              {feasible
                ? `Caixa equilibrado · total R$ ${formatBRL(chain.totalCash)}`
                : `Faixa de caixa: R$ ${formatBRL(chain.cashLowerBound)} a R$ ${formatBRL(chain.cashUpperBound)}`}
            </p>
            <p className="text-[11px] font-medium text-ink-500">
              {chain.size} participantes · {chain.edges.length} trocas
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
