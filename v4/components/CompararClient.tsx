"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CarPost, User } from "@/lib/types";
import { recommendedSplit, splitRangeLabel } from "@/lib/valuation";
import { formatBRL } from "@/lib/cash";
import ValuationPanel from "./ValuationPanel";
import {
  ArrowRightIcon,
  InfoIcon,
  ScaleIcon,
  SwapIcon,
} from "./icons";

type Scope = "mine" | "all";

interface PostsResponse {
  posts: CarPost[];
}

export default function CompararClient() {
  const [posts, setPosts] = useState<CarPost[]>([]);
  const [mine, setMine] = useState<CarPost[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [scopeA, setScopeA] = useState<Scope>("all");
  const [scopeB, setScopeB] = useState<Scope>("all");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [allRes, authRes] = await Promise.all([
          fetch("/api/posts?pageSize=48"),
          fetch("/api/auth/me"),
        ]);
        if (!allRes.ok) throw new Error("posts");
        const allData = (await allRes.json()) as PostsResponse;
        const allPosts = allData.posts ?? [];

        let currentUser: User | null = null;
        let minePosts: CarPost[] = [];
        if (authRes.ok) {
          const authData = await authRes.json();
          currentUser = authData.user ?? null;
          if (currentUser) {
            const mineRes = await fetch("/api/posts?mine=1&pageSize=48");
            if (mineRes.ok) {
              const mineData = (await mineRes.json()) as PostsResponse;
              minePosts = mineData.posts ?? [];
            }
          }
        }

        if (cancelled) return;
        setPosts(allPosts);
        setMine(minePosts);
        setUser(currentUser);

        const useMine = minePosts.length >= 2;
        const initial = useMine ? minePosts : allPosts;
        setScopeA(useMine ? "mine" : "all");
        setScopeB(useMine ? "mine" : "all");
        setLeftId(initial[0]?.id ?? "");
        setRightId(initial[1]?.id ?? "");
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar os anúncios para comparar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const allById = new Map<string, CarPost>();
  for (const post of posts) allById.set(post.id, post);
  for (const post of mine) {
    if (!allById.has(post.id)) allById.set(post.id, post);
  }

  const postA = leftId ? allById.get(leftId) ?? null : null;
  const postB = rightId ? allById.get(rightId) ?? null : null;
  const samePost = Boolean(postA && postB && postA.id === postB.id);
  const split =
    postA && postB && !samePost ? recommendedSplit(postA, postB) : null;

  const changeScope = (side: "A" | "B", scope: Scope) => {
    const list = scope === "mine" ? mine : posts;
    if (side === "A") {
      setScopeA(scope);
      setLeftId(list[0]?.id ?? "");
    } else {
      setScopeB(scope);
      setRightId(list[0]?.id ?? "");
    }
  };

  const optionsA = scopeA === "mine" ? mine : posts;
  const optionsB = scopeB === "mine" ? mine : posts;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-7">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
          <ScaleIcon size={12} />
          Análise de troca
        </p>
        <h1 className="mt-3 text-balance text-[28px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[34px]">
          Os dois lados, o mesmo número.
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
          Escolha dois anúncios — seus ou de qualquer pessoa — e veja o valor
          justo de cada um lado a lado, com o acerto de dinheiro recomendado e a
          faixa defensável para negociar.
        </p>
      </header>

      {loading ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-72 rounded-[var(--radius-card)]" />
          <div className="skeleton h-72 rounded-[var(--radius-card)]" />
        </div>
      ) : error ? (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-800">
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-14 text-center">
          <SwapIcon size={24} className="mx-auto text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-800">
            Ainda não há anúncios para comparar
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-ink-500">
            Publique um carro ou use a calculadora para avaliar um veículo antes
            de anunciar.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/posts/new" className="btn-primary !text-[12.5px]">
              Anunciar carro
            </Link>
            <Link href="/avaliar" className="btn-ghost !text-[12.5px]">
              Abrir calculadora
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
            <SideCard
              side="A"
              post={postA}
              options={optionsA}
              scope={scopeA}
              onScope={(scope) => changeScope("A", scope)}
              selectedId={leftId}
              onSelect={setLeftId}
              canUseMine={Boolean(user) && mine.length > 0}
              loggedOut={!user}
            />
            <SideCard
              side="B"
              post={postB}
              options={optionsB}
              scope={scopeB}
              onScope={(scope) => changeScope("B", scope)}
              selectedId={rightId}
              onSelect={setRightId}
              canUseMine={Boolean(user) && mine.length > 0}
              loggedOut={!user}
            />
          </div>

          <section className="card mt-4 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-3">
              <ScaleIcon size={15} className="text-brand-600" />
              <h2 className="text-[13px] font-semibold text-ink-900">
                Acerto recomendado
              </h2>
            </div>

            <div className="p-4 sm:p-5">
              {samePost ? (
                <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-[12.5px] text-ink-600">
                  Escolha dois anúncios diferentes para calcular o acerto.
                </p>
              ) : split && postA && postB ? (
                <>
                  <p className="text-[21px] font-bold leading-snug tracking-tight text-ink-900 sm:text-[24px]">
                    {headline(split.amount, postA, postB)}
                  </p>
                  <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-600">
                    {split.justification}
                  </p>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <Summary
                      label={`Valor justo · ${shortName(postA)}`}
                      value={`R$ ${formatBRL(split.valuationA.fairValue)}`}
                    />
                    <Summary
                      label={`Valor justo · ${shortName(postB)}`}
                      value={`R$ ${formatBRL(split.valuationB.fairValue)}`}
                    />
                    <Summary
                      label="Diferença justa (B − A)"
                      value={`${split.fairDifference >= 0 ? "+" : "−"} R$ ${formatBRL(
                        Math.abs(split.fairDifference)
                      )}`}
                      tone={split.fairDifference === 0 ? "neutral" : "brand"}
                    />
                  </div>

                  <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                      Faixa de negociação
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-ink-800">
                      {splitRangeLabel(split)}
                    </p>
                    <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-ink-600">
                      <InfoIcon size={12} className="mt-0.5 shrink-0" />
                      {split.declaredCompatible
                        ? "As faixas de dinheiro declaradas nos dois anúncios se sobrepõem. O acerto combina o valor justo com o meio dessa faixa."
                        : "Os anúncios não declaram faixas de dinheiro compatíveis; o acerto vem só da diferença de valores justos."}{" "}
                      Lado A é o anúncio da esquerda; lado B, o da direita.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-[12.5px] text-ink-500">
                  Selecione um anúncio em cada lado para calcular o acerto.
                </p>
              )}
            </div>
          </section>

          <p className="mt-4 text-center text-[11px] text-ink-400">
            Quer avaliar um carro que ainda não está anunciado?{" "}
            <Link
              href="/avaliar"
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
            >
              Abra a calculadora
              <ArrowRightIcon size={11} />
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function SideCard({
  side,
  post,
  options,
  scope,
  onScope,
  selectedId,
  onSelect,
  canUseMine,
  loggedOut,
}: {
  side: "A" | "B";
  post: CarPost | null;
  options: CarPost[];
  scope: Scope;
  onScope: (scope: Scope) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  canUseMine: boolean;
  loggedOut: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/70 px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          Lado {side}
        </span>
        <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-ink-200">
          <button
            type="button"
            onClick={() => onScope("mine")}
            disabled={!canUseMine}
            title={
              loggedOut
                ? "Entre para ver seus anúncios"
                : canUseMine
                  ? undefined
                  : "Você ainda não tem anúncios"
            }
            className={`rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              scope === "mine"
                ? "bg-brand-600 text-white"
                : "text-ink-500 hover:text-ink-800"
            }`}
          >
            Meus anúncios
          </button>
          <button
            type="button"
            onClick={() => onScope("all")}
            className={`rounded-md px-2 py-1 text-[10.5px] font-medium transition-colors ${
              scope === "all"
                ? "bg-brand-600 text-white"
                : "text-ink-500 hover:text-ink-800"
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      <div className="p-3.5">
        <label
          htmlFor={`comparar-${side}`}
          className="text-[10.5px] font-medium uppercase tracking-wide text-ink-400"
        >
          Anúncio
        </label>
        <select
          id={`comparar-${side}`}
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          disabled={options.length === 0}
          className="input-field mt-1 !py-2 text-[12px] disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400"
        >
          {options.length === 0 ? (
            <option value="">
              {scope === "mine"
                ? "Você ainda não tem anúncios"
                : "Nenhum anúncio disponível"}
            </option>
          ) : (
            options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title} — R$ {formatBRL(option.car.estimatedValue)}
              </option>
            ))
          )}
        </select>

        {post ? (
          <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3">
            <ValuationPanel
              car={post.car}
              heading={`Valor justo · lado ${side}`}
            />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-ink-200 px-3 py-6 text-center text-[11.5px] text-ink-400">
            Selecione um anúncio para ver a avaliação.
          </p>
        )}
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
      <p className="text-[9.5px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono text-[13px] font-semibold tabular-nums ${
          tone === "brand" ? "text-brand-700" : "text-ink-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function shortName(post: CarPost): string {
  const firstModelWord = post.car.model.trim().split(/\s+/)[0] || "";
  return `${post.car.brand} ${firstModelWord}`.trim();
}

function headline(amount: number, postA: CarPost, postB: CarPost): string {
  const nameA = shortName(postA);
  const nameB = shortName(postB);
  if (amount > 0) {
    return `${nameA} paga R$ ${formatBRL(amount)} para ${nameB}`;
  }
  if (amount < 0) {
    return `${nameB} paga R$ ${formatBRL(Math.abs(amount))} para ${nameA}`;
  }
  return "Troca direta, sem dinheiro";
}
