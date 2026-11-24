"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CarPost, Match, User, DesiredVehicle } from "@/lib/types";
import MatchCard from "@/components/MatchCard";
import { ownerCashLabel, formatBRL } from "@/lib/cash";
import WhatsAppButton from "@/components/WhatsappButton";
import { formatWhatsapp } from "@/lib/whatsapp";
import type { ContactResult } from "@/lib/contact";
import { titleAlreadyNamesCar } from "@/lib/present";
import {
  ArrowRightIcon,
  CalendarIcon,
  WhatsAppIcon,
  GaugeIcon,
  MapPinIcon,
  PaletteIcon,
  PhotoIcon,
  SwapIcon,
} from "@/components/icons";

interface MatchResult {
  match: Match;
  otherPost: CarPost | null;
  viewerPostId: string;
}

const DISTANCE_LABEL = (km: number) =>
  km >= 800 ? "qualquer lugar do Brasil" : `até ${km.toLocaleString("pt-BR")} km`;

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [post, setPost] = useState<CarPost | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const [contact, setContact] = useState<
    (ContactResult & { ownerName?: string }) | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [postRes, authRes] = await Promise.all([
          fetch(`/api/posts/${id}`),
          fetch("/api/auth/me"),
        ]);

        if (!postRes.ok) {
          if (!cancelled) setError("Anúncio não encontrado");
          return;
        }

        const postData = await postRes.json();
        if (cancelled) return;
        setPost(postData.post);

        const authData = authRes.ok ? await authRes.json() : { user: null };
        const currentUser: User | null = authData.user ?? null;
        if (!cancelled) setUser(currentUser);

        // Matches are private to the owner — don't even ask otherwise.
        // (The endpoint now enforces this too.)
        if (currentUser && currentUser.id === postData.post.userId) {
          const matchRes = await fetch(`/api/posts/${id}/matches`);
          if (matchRes.ok && !cancelled) {
            const matchData = await matchRes.json();
            setMatches(matchData.matches || []);
          }
        }
      } catch {
        if (!cancelled) setError("Erro ao carregar anúncio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Excluir este anúncio? Essa ação não pode ser desfeita.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/my-posts");
        router.refresh();
      } else {
        setError("Erro ao excluir o anúncio");
      }
    } catch {
      setError("Erro ao excluir o anúncio");
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Ask the server for the ready-to-send WhatsApp payload. It needs the viewer's
   * own listings and matches, which this page does not otherwise load.
   *
   * Declared above the early returns on purpose: a hook placed after them would
   * change the hook order between renders, which React rejects outright.
   */
  useEffect(() => {
    const postId = post?.id;
    const ownerId = post?.userId;
    if (!user || !postId || ownerId === user.id) {
      setContact(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/posts/${postId}/contact`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setContact(d);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [post?.id, post?.userId, user]);

  if (loading) return <PostDetailSkeleton />;

  if (error || !post) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-sm font-medium text-ink-700">
          {error || "Anúncio não encontrado"}
        </p>
        <Link href="/" className="btn-ghost mt-4">
          Voltar para os carros
        </Link>
      </div>
    );
  }

  const isOwner = user?.id === post.userId;
  const vehicles = post.desiredTrade.vehicles ?? [];
  const limit = post.desiredTrade.maxDistance;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink-500">
        <Link href="/" className="hover:text-brand-600">
          Carros
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-ink-700">{post.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Left column ── */}
        <div className="min-w-0 space-y-5">
          {/* Gallery */}
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-ink-100">
            {post.images.length > 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/uploads/${post.images[activeImage]}`}
                  alt={`${post.title} — foto ${activeImage + 1}`}
                  className="aspect-[16/10] w-full object-cover"
                />
                {post.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto bg-white p-2">
                    {post.images.map((img, i) => (
                      <button
                        key={img}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={`Ver foto ${i + 1}`}
                        className={`h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition ${
                          i === activeImage
                            ? "ring-brand-500"
                            : "ring-transparent hover:ring-ink-300"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/uploads/${img}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 text-ink-400">
                <PhotoIcon size={28} />
                <span className="text-xs">Este anúncio não tem fotos</span>
              </div>
            )}
          </div>

          {/* Title + specs */}
          <div>
            <h1 className="text-balance text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              {post.title}
            </h1>
            {!titleAlreadyNamesCar(post.title, post.car.brand, post.car.model) && (
              <p className="mt-1 text-sm text-ink-600">
                {post.car.brand} {post.car.model}
              </p>
            )}

            {post.description && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {post.description}
              </p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Spec label="Ano" value={String(post.car.year)} icon={<CalendarIcon size={13} />} />
              {post.car.mileage !== undefined && (
                <Spec
                  label="Quilometragem"
                  value={`${post.car.mileage.toLocaleString("pt-BR")} km`}
                  icon={<GaugeIcon size={13} />}
                />
              )}
              {post.car.color && (
                <Spec label="Cor" value={post.car.color} icon={<PaletteIcon size={13} />} />
              )}
              {post.car.localization && (
                <Spec
                  label="Localização"
                  value={post.car.localization}
                  icon={<MapPinIcon size={13} />}
                />
              )}
            </dl>
          </div>

          {/* Wants */}
          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <SwapIcon size={15} />
              <h2 className="text-sm font-semibold text-ink-900">
                Aceita trocar por
              </h2>
            </div>

            {limit !== undefined && limit !== null && (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11.5px] text-brand-700">
                <MapPinIcon size={12} />
                Aceita trocas {DISTANCE_LABEL(limit)}
              </p>
            )}

            <div className="space-y-2">
              {vehicles.map((v: DesiredVehicle, i: number) => (
                <div
                  key={i}
                  className="rounded-lg border border-ink-100 bg-ink-50/60 p-3"
                >
                  <p className="text-[13px] font-semibold text-ink-900">
                    {v.vehicleType
                      ? `${v.vehicleType} (qualquer modelo)`
                      : `${v.brand}${v.model ? ` ${v.model}` : ""}`}
                    {v.transmission ? ` · ${v.transmission}` : ""}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
                    {(v.yearMin || v.yearMax) && (
                      <span>
                        Ano {v.yearMin || "—"} a {v.yearMax || "—"}
                      </span>
                    )}
                    {(v.mileageMin !== undefined || v.mileageMax !== undefined) && (
                      <span>
                        Km {v.mileageMin?.toLocaleString("pt-BR") ?? "—"} a{" "}
                        {v.mileageMax?.toLocaleString("pt-BR") ?? "—"}
                      </span>
                    )}
                    <span className="font-medium text-ink-700">
                      {ownerCashLabel(v.cashAdjustment, v.cashAdjustmentTolerance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Owner: matches */}
          {isOwner && (
            <section className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <SwapIcon size={15} />
                <h2 className="text-sm font-semibold text-ink-900">
                  Matches deste anúncio
                </h2>
                {matches.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800">
                    {matches.length}
                  </span>
                )}
              </div>

              {matches.length === 0 ? (
                <p className="text-[13px] leading-relaxed text-ink-500">
                  Nenhum match ainda. O sistema compara seu anúncio com todos os
                  outros a cada novo cadastro — você será avisado aqui e na
                  página <Link href="/my-posts" className="font-medium text-brand-600 hover:underline">Meus anúncios</Link>.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {matches.map((m) => (
                    <MatchCard
                      key={m.match.id}
                      match={m.match}
                      otherPost={m.otherPost}
                      viewerPostId={m.viewerPostId || post.id}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* ── Right column ── */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
              Valor estimado
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
              R$ {formatBRL(post.car.estimatedValue)}
            </p>

            <div className="mt-4 space-y-2">
              {!isOwner && user && (
                <WhatsAppButton
                  href={contact?.href ?? null}
                  label={contact?.matched ? "Fechar no WhatsApp" : "Falar no WhatsApp"}
                  unavailable={
                    contact?.unavailable ??
                    (user.whatsapp ? undefined : "profile-incomplete")
                  }
                  className="w-full"
                />
              )}

              {!isOwner && !user && (
                <Link
                  href={`/auth?redirectTo=/posts/${post.id}`}
                  className="btn-primary w-full"
                >
                  <WhatsAppIcon size={15} />
                  Entre para falar no WhatsApp
                </Link>
              )}

              {isOwner && (
                <>
                  <Link
                    href={`/posts/${post.id}/edit`}
                    className="btn-ghost w-full"
                  >
                    Editar anúncio
                  </Link>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                  >
                    {deleting ? "Excluindo..." : "Excluir anúncio"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Contact */}
          {(post.contactInfo.whatsapp || post.contactInfo.email) && (
            <div className="card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                Contato direto
              </p>
              <div className="mt-2 space-y-1.5 text-[13px]">
                {post.contactInfo.whatsapp && (
                  <div className="flex items-center justify-between gap-2 text-ink-700">
                    <span className="truncate">
                      {formatWhatsapp(post.contactInfo.whatsapp)}
                    </span>
                    <span className="text-[11px] font-medium text-ink-400">
                      WhatsApp
                    </span>
                  </div>
                )}
                {post.contactInfo.email && (
                  <a
                    href={`mailto:${post.contactInfo.email}`}
                    className="flex items-center justify-between gap-2 text-ink-700 hover:text-brand-600"
                  >
                    <span className="truncate">{post.contactInfo.email}</span>
                    <span className="text-[11px] font-medium text-brand-600">
                      E-mail
                    </span>
                  </a>
                )}
              </div>
            </div>
          )}

          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-medium text-ink-500 hover:text-brand-600"
          >
            Ver todos os carros
            <ArrowRightIcon size={13} />
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Spec({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-2.5">
      <dt className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide text-ink-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12.5px] font-semibold text-ink-800">
        {value}
      </dd>
    </div>
  );
}

function PostDetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="skeleton mb-4 h-3 w-40" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="skeleton aspect-[16/10] w-full rounded-[var(--radius-card)]" />
          <div className="space-y-2">
            <div className="skeleton h-6 w-2/3" />
            <div className="skeleton h-4 w-1/3" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="skeleton h-48 rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
