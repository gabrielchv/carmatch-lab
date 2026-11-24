"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  buildRodaInviteMessage,
  type RodaRing,
  type RodaParticipant,
  type RodaStats,
} from "@/lib/roda";
import { whatsappLink } from "@/lib/whatsapp";
import { formatBRL } from "@/lib/cash";
import { MapPinIcon, SwapIcon, ArrowRightIcon } from "./icons";
import WhatsAppButton from "./WhatsappButton";

/**
 * Public ring board.
 *
 * Rings are derived, not stored: the page asks `/api/roda` and renders whatever
 * cycles exist right now. The only action is the WhatsApp invitation, because
 * there is no in-app chat and no server-side group to join.
 */

interface RodaResponse {
  rings: RodaRing[];
  count: number;
  stats: RodaStats;
}

function cashLabel(delta: number): string {
  if (delta > 0) return `paga R$ ${formatBRL(delta)}`;
  if (delta < 0) return `recebe R$ ${formatBRL(Math.abs(delta))}`;
  return "troca direta";
}

function cashTone(delta: number): string {
  if (delta > 0) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (delta < 0) return "bg-brand-50 text-brand-700 ring-brand-200";
  return "bg-ink-100 text-ink-600 ring-ink-200";
}

export default function RodaView() {
  const [data, setData] = useState<RodaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/roda")
      .then(async (res) => {
        if (!res.ok) throw new Error("Falha ao carregar rodas");
        return (await res.json()) as RodaResponse;
      })
      .then((payload) => {
        if (cancelled) return;
        // Set in the async callback (not synchronously in the effect body) so
        // the link built for WhatsApp points at the real deployment origin.
        setOrigin(window.location.origin);
        setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar as rodas agora.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      <header className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-brand-200">
          <SwapIcon size={12} />
          Troca em círculo
        </span>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight text-ink-900 sm:text-[32px]">
          Roda
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
          Três, quatro ou cinco pessoas que se completam. Cada uma quer o carro
          da próxima — então todo mundo troca de uma vez, sem precisar vender o
          próprio carro.
        </p>
        {data && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
            <span className="chip">{data.rings.length} roda{data.rings.length === 1 ? "" : "s"}</span>
            <span className="chip">{data.stats.posts} anúncios</span>
            <span className="chip">{data.stats.edges} desejos cruzados</span>
            {data.stats.truncated && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                Busca limitada — mostrando as primeiras rodas
              </span>
            )}
          </div>
        )}
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="card p-5">
              <div className="skeleton h-5 w-36" />
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="skeleton h-28 w-full" />
                <div className="skeleton h-28 w-full" />
                <div className="skeleton h-28 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : data && data.rings.length > 0 ? (
        <div className="space-y-5">
          {data.rings.map((ring) => (
            <RingCard key={ring.id} ring={ring} origin={origin} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}

      <section className="mt-10 rounded-[var(--radius-card)] border border-ink-200 bg-white p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">
          Como uma roda nasce
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <HowTo
            step="1"
            title="A quer o carro de B"
            text="Cada anúncio diz o que aceita na troca. Esses desejos viram setas."
          />
          <HowTo
            step="2"
            title="B quer o de C, C quer o de A"
            text="Quando as setas voltam ao começo, fecha um círculo de 3 a 5 pessoas."
          />
          <HowTo
            step="3"
            title="A conta fecha no grupo"
            text="As diferenças em dinheiro se anulam. A conversa acontece no WhatsApp."
          />
        </div>
      </section>
    </div>
  );
}

/* ─── Ring card ─────────────────────────────────────────────────── */

function RingCard({ ring, origin }: { ring: RodaRing; origin: string }) {
  const firstName =
    ring.participants[0]?.ownerName?.trim().split(/\s+/)[0] || "primeira pessoa";
  const message = buildRodaInviteMessage(ring, origin);
  const first = ring.participants[0];
  const href = first ? whatsappLink(first.ownerWhatsapp ?? "", message) : null;

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-gradient-to-r from-brand-50/70 to-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white">
            <SwapIcon size={11} />
            Roda de {ring.size}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-500">Força</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${ring.score}%` }}
              />
            </div>
            <span className="text-[11.5px] font-semibold text-ink-700">
              {ring.score}/100
            </span>
          </div>
        </div>

        <p className="text-[11px] text-ink-500">
          {Math.abs(ring.rawCashResidual) < 0.5
            ? "As diferenças já somam zero"
            : `Acerto bruto de R$ ${formatBRL(Math.abs(ring.rawCashResidual))} · tolerância R$ ${formatBRL(ring.cashToleranceBudget)}`}
        </p>
      </header>

      <div className="p-4">
        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-stretch">
          {ring.participants.map((participant, i) => (
            <Fragment key={participant.postId}>
              <ParticipantCard participant={participant} position={i + 1} />
              <Connector
                last={i === ring.participants.length - 1}
                firstOwner={firstName}
              />
            </Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-ink-100 bg-ink-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-[11px] leading-relaxed text-ink-500">
          O WhatsApp não cria grupos por link. Esta mensagem é um convite: cada
          pessoa responde e <strong className="font-semibold text-ink-700">você</strong>{" "}
          cria o grupo com todos.
        </p>
        <WhatsAppButton
          href={href}
          label="Fechar a roda no WhatsApp"
          unavailable={href ? undefined : "no-whatsapp"}
        />
      </div>
    </article>
  );
}

function ParticipantCard({
  participant,
  position,
}: {
  participant: RodaParticipant;
  position: number;
}) {
  return (
    <Link
      href={`/posts/${participant.postId}`}
      className="group min-w-0 flex-1 basis-0 rounded-xl border border-ink-200 bg-white p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          {position}º
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${cashTone(
            participant.cashDelta
          )}`}
        >
          {cashLabel(participant.cashDelta)}
        </span>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[12.5px] font-semibold leading-snug text-ink-900">
        {participant.car.brand} {participant.car.model}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-ink-500">
        {participant.car.year} · {participant.ownerName ?? "Anunciante"}
      </p>

      <p className="mt-1.5 text-[13px] font-semibold text-ink-900">
        R$ {formatBRL(participant.value)}
      </p>

      {participant.city && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-ink-400">
          <MapPinIcon size={11} />
          {participant.city}
        </p>
      )}
    </Link>
  );
}

function Connector({ last, firstOwner }: { last: boolean; firstOwner: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 lg:w-9">
      {last ? (
        <span
          className="inline-flex flex-col items-center gap-0.5 rounded-full bg-brand-50 px-2 py-1 text-[9.5px] font-medium text-brand-700 ring-1 ring-brand-200"
          title={`Fecha o círculo voltando para ${firstOwner}`}
        >
          <SwapIcon size={12} />
          <span className="hidden xl:inline">volta</span>
        </span>
      ) : (
        <ArrowRightIcon
          size={16}
          className="rotate-90 text-brand-500 lg:rotate-0"
        />
      )}
    </div>
  );
}

/* ─── Empty / education ─────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <SwapIcon size={20} />
      </div>
      <p className="mt-3 text-sm font-semibold text-ink-800">
        Ainda não há uma roda fechada
      </p>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-500">
        Uma roda aparece quando A quer o carro de B, B quer o carro de C e C
        quer o carro de A. Publique o seu e diga o que aceita — quanto mais
        anúncios, mais círculos se fecham.
      </p>
      <Link href="/posts/new" className="btn-primary mt-5 !text-[12.5px]">
        Anunciar meu carro
        <ArrowRightIcon size={14} />
      </Link>
    </div>
  );
}

function HowTo({
  step,
  title,
  text,
}: {
  step: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
        {step}
      </span>
      <p className="mt-2 text-[12.5px] font-semibold text-ink-800">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">{text}</p>
    </div>
  );
}
