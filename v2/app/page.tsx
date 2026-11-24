"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import FilterBar from "@/components/FilterBar";
import FilterSidebar from "@/components/FilterSidebar";
import {
  ArrowRightIcon,
  SearchIcon,
  ShieldCheckIcon,
  SwapIcon,
} from "@/components/icons";
import type { PostWithTrust } from "@/lib/trust";
import type { User } from "@/lib/types";

interface PostsResponse {
  posts: PostWithTrust[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const PAGE_SIZE = 24;

function HomeContent() {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  const [posts, setPosts] = useState<PostWithTrust[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [myPostCount, setMyPostCount] = useState(0);
  const [myMatchCount, setMyMatchCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Result set (filters / sort / page 1)
  const fetchPosts = useCallback(
    async (targetPage: number) => {
      const params = new URLSearchParams(qs);
      params.set("page", String(targetPage));
      params.set("pageSize", String(PAGE_SIZE));

      const res = await fetch(`/api/posts?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar anúncios");
      return (await res.json()) as PostsResponse;
    },
    [qs]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, authRes] = await Promise.all([
        fetchPosts(1),
        fetch("/api/auth/me"),
      ]);

      setPosts(data.posts);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(1);

      const authData = authRes.ok ? await authRes.json() : { user: null };

      if (authData.user) {
        setUser(authData.user);

        // One request for the dashboard counters instead of one per post.
        const overviewRes = await fetch("/api/me/overview");
        if (overviewRes.ok) {
          const overview = await overviewRes.json();
          setMyPostCount(overview.posts?.length ?? 0);
          setMyMatchCount(overview.totalMatches ?? 0);
        }
      } else {
        setUser(null);
        setMyPostCount(0);
        setMyMatchCount(0);
      }
    } catch {
      setError("Não foi possível carregar os anúncios. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [fetchPosts]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await fetchPosts(page + 1);
      setPosts((prev) => [...prev, ...next.posts]);
      setPage(next.page);
      setHasMore(next.hasMore);
      setTotal(next.total);
    } catch {
      setError("Não foi possível carregar mais anúncios.");
    } finally {
      setLoadingMore(false);
    }
  };

  const hasFilters = Array.from(searchParams.keys()).some(
    (k) => !["sortBy", "sortOrder", "page", "pageSize"].includes(k)
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink-900">
            Troca com verificação
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Só fecha com quem tem dossiê. Veja o nível do vendedor e o dossiê
            do carro antes de negociar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <>
              <Link
                href="/my-posts"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12.5px] font-medium text-ink-700 ring-1 ring-ink-200 transition hover:bg-ink-50"
              >
                {myPostCount} anúncio{myPostCount === 1 ? "" : "s"}
              </Link>
              {myMatchCount > 0 && (
                <Link
                  href="/my-posts"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                >
                  <SwapIcon size={13} />
                  {myMatchCount} match{myMatchCount === 1 ? "" : "es"}
                </Link>
              )}
              <Link href="/posts/new" className="btn-primary !py-2 !text-[12.5px]">
                Anunciar carro
              </Link>
            </>
          ) : (
            <Link href="/auth" className="btn-primary !py-2 !text-[12.5px]">
              Entrar para anunciar
            </Link>
          )}
        </div>
      </div>

      {/* Positioning band: the variant's promise stays above the fold. */}
      <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 px-4 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <ShieldCheckIcon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-brand-800">
            Troca com verificação — só fecha com quem tem dossiê.
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-brand-800/80">
            Cada anúncio mostra o nível do vendedor e o dossiê do veículo.{" "}
            <Link
              href="/verificar"
              className="font-semibold underline underline-offset-2 hover:text-brand-900"
            >
              Verificar minha conta
            </Link>{" "}
            ou use o filtro “Só verificados”.
          </p>
        </div>
      </div>

      {/* Search + sort */}
      <Suspense fallback={<div className="h-14" />}>
        <FilterBar onToggleFilters={() => setShowMobileFilters(true)} />
      </Suspense>

      <div className="mt-5 flex gap-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20">
            <FilterSidebar />
          </div>
        </aside>

        <div className="lg:hidden">
          <FilterSidebar
            isOpen={showMobileFilters}
            onClose={() => setShowMobileFilters(false)}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/* Result count */}
          {!loading && (
            <div className="mb-3 flex items-center justify-between text-[12px] text-ink-500">
              <span>
                {total === 0
                  ? "Nenhum carro encontrado"
                  : `${total} carro${total === 1 ? "" : "s"}${
                      hasFilters ? " com esses filtros" : ""
                    }`}
              </span>
              {hasFilters && (
                <Link href="/" className="font-medium text-brand-600 hover:underline">
                  Limpar filtros
                </Link>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white">
                  <div className="skeleton aspect-[16/10] w-full rounded-none" />
                  <div className="space-y-2 p-3.5">
                    <div className="skeleton h-4 w-4/5" />
                    <div className="skeleton h-4 w-1/3" />
                    <div className="skeleton h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} currentUser={user} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="btn-ghost !px-5"
                  >
                    {loadingMore ? "Carregando..." : `Carregar mais (${total - posts.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <SearchIcon size={20} />
      </div>
      <p className="mt-3 text-sm font-semibold text-ink-800">
        {hasFilters
          ? "Nenhum carro bate com esses filtros"
          : "Ainda não há carros anunciados"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
        {hasFilters
          ? "Tente ampliar a distância, o ano, a faixa de preço ou o nível de confiança."
          : "Publique o seu carro e diga o que aceita na troca. O match é automático."}
      </p>
      <Link
        href={hasFilters ? "/" : "/posts/new"}
        className="btn-primary mt-5 !text-[12.5px]"
      >
        {hasFilters ? "Limpar filtros" : "Anunciar meu carro"}
        <ArrowRightIcon size={14} />
      </Link>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-ink-400">Carregando...</div>}>
      <HomeContent />
    </Suspense>
  );
}
