import Link from "next/link";
import type { CarPost, Match } from "@/lib/types";
import { SCORE_PERFEITO } from "@/lib/match-score";
import { viewerCashLabel, formatBRL } from "@/lib/cash";
import { ArrowRightIcon, GaugeIcon, MapPinIcon, PhotoIcon } from "./icons";

interface MatchCardProps {
  match: Match;
  otherPost: CarPost | null;
  /** The viewer's OWN post in this match — decides who pays whom. */
  viewerPostId: string;
  /** Abre a sala de negociação (Troca Fechada) a partir deste match. */
  onOpenDeal?: (match: Match) => void;
  openingDeal?: boolean;
}

/**
 * One matched listing.
 *
 * The money sentence is derived by `viewerCashLabel`, which knows which side
 * the viewer is on. The previous version computed it inline and inverted the
 * sign for one of the two participants.
 */
export default function MatchCard({
  match,
  otherPost,
  viewerPostId,
  onOpenDeal,
  openingDeal = false,
}: MatchCardProps) {
  if (!otherPost) return null;

  const isPerfect = match.score >= SCORE_PERFEITO;
  const cashLabel = viewerCashLabel(match, viewerPostId);

  const accent = isPerfect
    ? {
        card: "border-emerald-200 bg-emerald-50/50",
        badge: "bg-emerald-100 text-emerald-800",
        label: "Match perfeito",
        bar: "bg-emerald-500",
      }
    : {
        card: "border-ink-200 bg-white",
        badge: "bg-brand-50 text-brand-700",
        label: "Match similar",
        bar: "bg-brand-500",
      };

  return (
    <div className={`rounded-xl border p-3.5 ${accent.card}`}>
      <div className="flex items-start gap-3">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100">
          {otherPost.images.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/uploads/${otherPost.images[0]}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-400">
              <PhotoIcon size={16} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${accent.badge}`}
            >
              {accent.label} · {match.score}%
            </span>
          </div>

          <Link
            href={`/posts/${otherPost.id}`}
            className="mt-1 block truncate text-[13px] font-semibold text-ink-900 hover:text-brand-600"
          >
            {otherPost.title}
          </Link>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-500">
            <span>R$ {formatBRL(otherPost.car.estimatedValue)}</span>
            {otherPost.car.mileage !== undefined && (
              <span className="inline-flex items-center gap-0.5">
                <GaugeIcon size={11} />
                {otherPost.car.mileage.toLocaleString("pt-BR")} km
              </span>
            )}
            {otherPost.car.localization && (
              <span className="inline-flex items-center gap-0.5">
                <MapPinIcon size={11} />
                {otherPost.car.localization}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score bar — makes "76%" mean something at a glance. */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-200/70">
        <div
          className={`h-full rounded-full ${accent.bar}`}
          style={{ width: `${Math.min(100, Math.max(0, match.score))}%` }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-ink-700">{cashLabel}</p>
        <div className="flex shrink-0 items-center gap-3">
          {onOpenDeal && (
            <button
              type="button"
              onClick={() => onOpenDeal(match)}
              disabled={openingDeal}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
            >
              {openingDeal ? "Abrindo..." : "Abrir negociação"}
            </button>
          )}
          <Link
            href={`/posts/${otherPost.id}`}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"
          >
            Ver anúncio
            <ArrowRightIcon size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
