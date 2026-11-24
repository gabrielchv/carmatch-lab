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
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🔧 Painel de Testes</h1>
        <button
          onClick={fetchData}
          className="text-sm text-blue-600 hover:underline"
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
          className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
        >
          🌱 Popular dados mock
        </button>
        <button
          onClick={() => doAction("/api/matches/trigger", "Matching")}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          🔄 Rodar matching
        </button>
        <button
          onClick={() => doAction("/api/debug/clear", "Limpar")}
          className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
        >
          🗑️ Limpar tudo
        </button>
      </div>

      {msg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded p-3">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Posts */}
          <section>
            <h2 className="font-semibold mb-2 text-sm">
              Anúncios ({posts.length})
            </h2>
            <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="text-left p-2 border">Título</th>
                    <th className="text-left p-2 border">Carro</th>
                    <th className="text-right p-2 border">Valor</th>
                    <th className="text-left p-2 border">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="p-2 border font-medium">{p.title}</td>
                      <td className="p-2 border text-gray-500">
                        {p.car.brand} {p.car.model} {p.car.year}
                      </td>
                      <td className="p-2 border text-right">
                        R$ {p.car.estimatedValue.toLocaleString("pt-BR")}
                      </td>
                      <td className="p-2 border text-gray-400">
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
            <h2 className="font-semibold mb-2 text-sm">
              Matchs ({matches.length})
            </h2>
            <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="text-left p-2 border">Post A</th>
                    <th className="text-left p-2 border">Post B</th>
                    <th className="text-center p-2 border">Score</th>
                    <th className="text-right p-2 border">Grana (A→B)</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const a = posts.find((p) => p.id === m.postAId);
                    const b = posts.find((p) => p.id === m.postBId);
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="p-2 border">
                          {a?.title || m.postAId.slice(0, 8)}
                        </td>
                        <td className="p-2 border">
                          {b?.title || m.postBId.slice(0, 8)}
                        </td>
                        <td className="p-2 border text-center font-bold">
                          {m.score}%
                        </td>
                        <td className="p-2 border text-right">
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
