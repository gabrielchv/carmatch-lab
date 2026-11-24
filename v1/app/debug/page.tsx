"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PostData {
  id: string;
  title: string;
  userId: string;
  car: { brand: string; model: string; year: number; estimatedValue: number };
  createdAt: string;
}

interface MatchData {
  id: string;
  postAId: string;
  postBId: string;
  score: number;
  suggestedCashFromA: number;
  createdAt: string;
}

export default function DebugPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [token, setToken] = useState("");
  const [posts, setPosts] = useState<PostData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, matchesRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/matches"),
      ]);

      if (postsRes.ok) {
        const d = await postsRes.json();
        setPosts(
          (d.posts || []).map((p: PostData) => ({
            id: p.id,
            title: p.title,
            userId: p.userId,
            car: p.car,
            createdAt: p.createdAt,
          }))
        );
      }
      if (matchesRes.ok) {
        const d = await matchesRes.json();
        setMatches(d.matches || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const doAction = async (url: string, label: string) => {
    setMsg(`${label}...`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: token ? { "x-debug-token": token } : {},
      });
      const data = await res.json();
      setMsg(
        res.ok
          ? `${label} → ${JSON.stringify(data)}`
          : `${label} → ${res.status}: ${data.error ?? "falhou"}`
      );
      await fetchData();
    } catch {
      setMsg(`${label} → erro`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight text-ink-900">Painel de testes</h1>
        <button
          onClick={fetchData}
          className="text-[12.5px] font-medium text-brand-600 hover:underline"
        >
          Atualizar
        </button>
      </div>

      {/* Ações rápidas */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
        Seed e limpeza exigem o <code className="font-mono">DEBUG_TOKEN</code>{" "}
        configurado no servidor. Sem ele, os endpoints respondem 404.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="DEBUG_TOKEN"
          className="input-field max-w-[220px]"
        />
        <button
          onClick={() => doAction("/api/debug/seed", "Seed")}
          className="btn-ghost !text-[12.5px]"
        >
          🌱 Popular dados mock
        </button>
        <button
          onClick={() => doAction("/api/matches/trigger", "Matching")}
          className="btn-ghost !text-[12.5px]"
        >
          🔄 Rodar matching
        </button>
        <button
          onClick={() => doAction("/api/debug/clear", "Limpar")}
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-[12.5px] font-medium text-red-600 hover:bg-red-50"
        >
          🗑️ Limpar tudo
        </button>
      </div>

      {msg && (
        <div className="rounded-lg border border-ink-200 bg-white p-3 font-mono text-[11.5px] text-ink-700">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-ink-400">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Posts */}
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-ink-900">
              Anúncios ({posts.length})
            </h2>
            <div className="max-h-96 overflow-auto rounded-xl border border-ink-200 bg-white">
              <table className="w-full border-collapse text-[11.5px]">
                <thead className="sticky top-0 bg-ink-50">
                  <tr>
                    <th className="border-b border-ink-200 p-2 text-left font-semibold text-ink-600">Título</th>
                    <th className="border-b border-ink-200 p-2 text-left font-semibold text-ink-600">Carro</th>
                    <th className="border-b border-ink-200 p-2 text-right font-semibold text-ink-600">Valor</th>
                    <th className="border-b border-ink-200 p-2 text-left font-semibold text-ink-600">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="hover:bg-ink-50/60">
                      <td className="border-b border-ink-100 p-2 font-medium">{p.title}</td>
                      <td className="border-b border-ink-100 p-2 text-gray-500">
                        {p.car.brand} {p.car.model} {p.car.year}
                      </td>
                      <td className="border-b border-ink-100 p-2 text-right">
                        R$ {p.car.estimatedValue.toLocaleString("pt-BR")}
                      </td>
                      <td className="border-b border-ink-100 p-2 text-gray-400">
                        {new Date(p.createdAt).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                  {posts.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-gray-400" colSpan={4}>
                        Nenhum — clique em &quot;Popular dados mock&quot;
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Matches */}
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-ink-900">
              Matchs ({matches.length})
            </h2>
            <div className="max-h-96 overflow-auto rounded-xl border border-ink-200 bg-white">
              <table className="w-full border-collapse text-[11.5px]">
                <thead className="sticky top-0 bg-ink-50">
                  <tr>
                    <th className="border-b border-ink-200 p-2 text-left font-semibold text-ink-600">Post A</th>
                    <th className="border-b border-ink-200 p-2 text-left font-semibold text-ink-600">Post B</th>
                    <th className="border-b border-ink-200 p-2 text-center font-semibold text-ink-600">Score</th>
                    <th className="border-b border-ink-200 p-2 text-right font-semibold text-ink-600">Grana (A→B)</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const a = posts.find((p) => p.id === m.postAId);
                    const b = posts.find((p) => p.id === m.postBId);
                    return (
                      <tr key={m.id} className="hover:bg-ink-50/60">
                        <td className="p-2 border">
                          {a?.title || m.postAId.slice(0, 8)}
                        </td>
                        <td className="p-2 border">
                          {b?.title || m.postBId.slice(0, 8)}
                        </td>
                        <td className="border-b border-ink-100 p-2 text-center font-bold">
                          {m.score}%
                        </td>
                        <td className="border-b border-ink-100 p-2 text-right">
                          {m.suggestedCashFromA === 0
                            ? "—"
                            : `R$ ${m.suggestedCashFromA.toLocaleString("pt-BR")}`}
                        </td>
                      </tr>
                    );
                  })}
                  {matches.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-gray-400" colSpan={4}>
                        Nenhum match ainda
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
