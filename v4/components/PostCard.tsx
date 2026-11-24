"use client";

import Link from "next/link";
import { useChat } from "@/lib/chat-context";
import { shortCashLabel, formatBRL } from "@/lib/cash";
import type { CarPost } from "@/lib/types";
import { titleAlreadyNamesCar } from "@/lib/present";
import {
  ChatIcon,
  GaugeIcon,
  MapPinIcon,
  PaletteIcon,
  PhotoIcon,
  SwapIcon,
} from "./icons";

export default function PostCard({
  post,
  currentUser,
  matchCount = 0,
}: {
  post: CarPost;
  currentUser?: { id: string } | null;
  matchCount?: number;
}) {
  const firstVehicle = post.desiredTrade.vehicles?.[0];
  const { startConversation } = useChat();

  const isOwner = currentUser?.id === post.userId;
  const canChat = currentUser && !isOwner;
  const redundantSubtitle = titleAlreadyNamesCar(
    post.title,
    post.car.brand,
    post.car.model
  );

  const handleChat = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await startConversation(post.id);
  };

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
        Chat used to appear only on `group-hover`, so it was unreachable on
        touch devices — the exact place a car-swap listing gets read.
      */}
      {canChat && (
        <button
          type="button"
          onClick={handleChat}
          aria-label="Conversar sobre este carro"
          title="Conversar sobre este carro"
          className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink-700 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-brand-600 hover:text-white focus-visible:bg-brand-600 focus-visible:text-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <ChatIcon size={16} />
        </button>
      )}
    </div>
  );
}
