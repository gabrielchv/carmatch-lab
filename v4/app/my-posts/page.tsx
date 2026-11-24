"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CarPost, Match, User } from "@/lib/types";
import MatchCard from "@/components/MatchCard";
import { SCORE_PERFEITO } from "@/lib/match-score";
import { formatBRL } from "@/lib/cash";
import {
  ArrowRightIcon,
  GaugeIcon,
  MapPinIcon,
  PhotoIcon,
  SwapIcon,
} from "@/components/icons";

interface MatchView {
  match: Match;
  otherPost: CarPost;
  viewerPostId: string;
}

interface Overview {
  user: User;
  posts: CarPost[];
  matchesByPost: Record<string, MatchView[]>;
  totalMatches: number;
}

export default function MyPostsPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Ask who we are first. `/api/me/overview` is a genuine 401 when
        // signed out, and firing it blindly logs a red network error in the
        // console for every logged-out visitor before the redirect lands.
        const meRes = await fetch("/api/auth/me");
        const me = meRes.ok ? await meRes.json() : { user: null };
        if (!me.user) {
          router.replace("/auth?redirectTo=/my-posts");
          return;
        }

        const res = await fetch("/api/me/overview");
        if (res.status === 401) {
          router.replace("/auth?redirectTo=/my-posts");
          return;
        }
        if (!res.ok) throw new Error("overview failed");

        const overview = (await res.json()) as Overview;
        if (!cancelled) setData(overview);
      } catch {
        if (!cancelled) setData(null);
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
        <div className="skeleton mb-2 h-6 w-40" />
        <div className="skeleton mb-6 h-3 w-56" />
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-[var(--radius-card)]" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-sm text-ink-600">
          Não foi possível carregar seus anúncios.
        </p>
        <button type="button" onClick={() => location.reload()} className="btn-ghost mt-4">
          Tentar novamente
        </button>
      </div>
    );
  }

  const { user, posts, matchesByPost, totalMatches } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink-900">
            Meus anúncios
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Olá, {user.name.split(" ")[0]}.
            {totalMatches > 0 ? (
              <span className="font-medium text-emerald-700">
                {" "}
                {totalMatches} match{totalMatches === 1 ? "" : "es"} esperando por
                você.
              </span>
            ) : (
              " Seus matches aparecem aqui automaticamente."
            )}
          </p>
        </div>
        <Link href="/posts/new" className="btn-primary !py-2 !text-[12.5px]">
          Anunciar carro
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-500">
            <SwapIcon size={20} />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-800">
            Você ainda não anunciou nenhum carro
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
            Publique seu carro e diga o que aceita na troca. Nós comparamos com
            todos os outros anúncios e avisamos quando houver um match.
          </p>
          <Link href="/posts/new" className="btn-primary mt-5 !text-[12.5px]">
            Publicar meu primeiro carro
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {posts.map((post) => {
            const matches = matchesByPost[post.id] ?? [];
            const perfect = matches.filter((m) => m.match.score >= SCORE_PERFEITO);
            const similar = matches.filter((m) => m.match.score < SCORE_PERFEITO);

            return (
              <section
                key={post.id}
                className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white"
              >
                <div className="flex items-start gap-3 p-4">
                  <Link
                    href={`/posts/${post.id}`}
                    className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-ink-100"
                  >
                    {post.images.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/uploads/${post.images[0]}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-400">
                        <PhotoIcon size={18} />
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/posts/${post.id}`}
                      className="line-clamp-1 text-[13.5px] font-semibold text-ink-900 hover:text-brand-600"
                    >
                      {post.title}
                    </Link>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
                      <span className="font-medium text-ink-700">
                        R$ {formatBRL(post.car.estimatedValue)}
                      </span>
                      {post.car.mileage !== undefined && (
                        <span className="inline-flex items-center gap-1">
                          <GaugeIcon size={11} />
                          {post.car.mileage.toLocaleString("pt-BR")} km
                        </span>
                      )}
                      {post.car.localization && (
                        <span className="inline-flex items-center gap-1">
                          <MapPinIcon size={11} />
                          {post.car.localization}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/posts/${post.id}/edit`}
                        className="text-[11.5px] font-medium text-brand-600 hover:underline"
                      >
                        Editar
                      </Link>
                      <span className="text-ink-300">·</span>
                      <Link
                        href={`/posts/${post.id}`}
                        className="text-[11.5px] font-medium text-ink-500 hover:text-brand-600"
                      >
                        Ver anúncio
                      </Link>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {matches.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        <SwapIcon size={11} />
                        {matches.length}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-500">
                        sem matches
                      </span>
                    )}
                  </div>
                </div>

                {matches.length > 0 && (
                  <div className="border-t border-ink-100 bg-ink-50/40 p-4">
                    {perfect.length > 0 && (
                      <>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          Match perfeito · {perfect.length}
                        </p>
                        <div className="mb-3 space-y-2.5">
                          {perfect.map((m) => (
                            <MatchCard
                              key={m.match.id}
                              match={m.match}
                              otherPost={m.otherPost}
                              viewerPostId={m.viewerPostId || post.id}
                              viewerPost={post}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {similar.length > 0 && (
                      <>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                          Match similar · {similar.length}
                        </p>
                        <div className="space-y-2.5">
                          {similar.map((m) => (
                            <MatchCard
                              key={m.match.id}
                              match={m.match}
                              otherPost={m.otherPost}
                              viewerPostId={m.viewerPostId || post.id}
                              viewerPost={post}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
