"use client";

import Link from "next/link";
import { shortCashLabel, formatBRL } from "@/lib/cash";
import type { CarPost, User } from "@/lib/types";
import { titleAlreadyNamesCar } from "@/lib/present";
import {
  GaugeIcon,
  MapPinIcon,
  PaletteIcon,
  PhotoIcon,
  SwapIcon,
  WhatsAppIcon,
} from "./icons";
import WhatsAppButton from "./WhatsappButton";
import TrustBadge from "./TrustBadge";
import type { ContactResult } from "@/lib/contact";
import { listingTrust, type ListingTrust, type TrustedPost } from "@/lib/confianca";

export default function PostCard({
  post,
  currentUser,
  matchCount = 0,
  contact,
  owner,
  trust,
}: {
  post: CarPost;
  currentUser?: { id: string; whatsapp?: string } | null;
  matchCount?: number;
  /** Pre-computed WhatsApp payload for this listing, for the signed-in viewer. */
  contact?: ContactResult | null;
  /**
   * The owner record, when the caller has it. /api/posts already sends each
   * post's computed `trust`; this is the fallback for callers that only have
   * the raw post plus the owner (the onboarding preview).
   */
  owner?: Pick<User, "verifications"> | null;
  trust?: ListingTrust | null;
}) {
  const firstVehicle = post.desiredTrade.vehicles?.[0];

  /**
   * Prefer the server's number: it was computed against the stored owner, so
   * the card cannot disagree with the API and with the detail page.
   *
   * When neither the server number nor the owner is available we render no
   * badge at all. Guessing from the dossier alone would show 60% of the real
   * score — a wrong number is worse than an absent one.
   */
  const listing =
    trust ?? (post as TrustedPost).trust ?? (owner ? listingTrust(post, owner) : null);

  const isOwner = currentUser?.id === post.userId;
  const canContact = Boolean(currentUser) && !isOwner;
  const redundantSubtitle = titleAlreadyNamesCar(
    post.title,
    post.car.brand,
    post.car.model
  );

  const wantedLabel = firstVehicle
    ? firstVehicle.vehicleType
      ? firstVehicle.vehicleType
      : `${firstVehicle.brand}${firstVehicle.model ? ` ${firstVehicle.model}` : ""}`
    : "Qualquer carro";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white transition-all hover:border-ink-300 hover:shadow-[0_2px_12px_rgba(20,24,30,0.06)]">
      <Link href={`/posts/${post.id}`} className="flex flex-1 flex-col">
        {/* Image */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-100">
          {post.images.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/uploads/${post.images[0]}`}
              alt={post.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-400">
              <PhotoIcon size={22} />
              <span className="text-[11px]">Sem fotos</span>
            </div>
          )}

          {post.images.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              +{post.images.length - 1}
            </span>
          )}

          {isOwner && matchCount > 0 && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-emerald-700 shadow-sm">
              <SwapIcon size={11} />
              {matchCount} match{matchCount > 1 ? "es" : ""}
            </span>
          )}

          {/*
            Confiança sits on the photo, bottom-left: it has to be visible
            before the title is read, because "who is this person" is the
            question a stranger asks first. The WhatsApp button owns the
            top-right corner, and matches own the top-left.
          */}
          <span className="absolute bottom-2 left-2">
            <TrustBadge trust={listing} className="shadow-sm ring-1 ring-black/5" />
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-2 p-3.5">
          <div>
            <h2 className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink-900">
              {post.title}
            </h2>
            {!redundantSubtitle && (
              <p className="mt-0.5 truncate text-xs text-ink-500">
                {post.car.brand} {post.car.model}
              </p>
            )}
          </div>

          <p className="text-[15px] font-semibold tracking-tight text-ink-900">
            R$ {formatBRL(post.car.estimatedValue)}
          </p>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-500">
            {post.car.mileage !== undefined && (
              <span className="inline-flex items-center gap-1">
                <GaugeIcon size={12} />
                {post.car.mileage.toLocaleString("pt-BR")} km
              </span>
            )}
            {post.car.color && (
              <span className="inline-flex items-center gap-1">
                <PaletteIcon size={12} />
                {post.car.color}
              </span>
            )}
            {post.car.localization && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon size={12} />
                {post.car.localization}
              </span>
            )}
          </div>

          <div className="mt-auto border-t border-dashed border-ink-200 pt-2">
            <p className="flex items-baseline gap-1 text-[11.5px] leading-snug text-ink-500">
              <span className="shrink-0 text-ink-400">Quer</span>
              <span className="truncate font-medium text-brand-600">
                {wantedLabel}
              </span>
            </p>
            <p className="text-[11px] text-ink-500">
              {shortCashLabel(firstVehicle?.cashAdjustment ?? 0)}
              {post.desiredTrade.vehicles.length > 1 && (
                <span className="text-ink-400">
                  {" "}
                  · +{post.desiredTrade.vehicles.length - 1} opção
                  {post.desiredTrade.vehicles.length > 2 ? "ões" : ""}
                </span>
              )}
            </p>
          </div>
        </div>
      </Link>

      {/*
        WhatsApp replaces the old in-app chat. It sits on the image, always
        visible: the phone is where this product lives, and a hover-only button
        is unreachable on a touch screen.
      */}
      {canContact && (
        <div className="absolute right-2.5 top-2.5">
          <WhatsAppButton
            href={contact?.href ?? null}
            label={contact?.matched ? "Match! Chamar" : "Chamar"}
            variant="compact"
            unavailable={contact?.unavailable}
            className="shadow-sm ring-1 ring-black/10"
          />
        </div>
      )}

      {!currentUser && (
        <div className="absolute right-2.5 top-2.5">
          <Link
            href={`/auth?redirectTo=/posts/${post.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 shadow-sm ring-1 ring-black/5 hover:bg-white"
          >
            <WhatsAppIcon size={13} />
            Falar
          </Link>
        </div>
      )}
    </div>
  );
}
