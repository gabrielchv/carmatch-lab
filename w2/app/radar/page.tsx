"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RadarForm, { type CreatedRadar } from "@/components/RadarForm";
import {
  CheckIcon,
  CloseIcon,
  PhotoIcon,
  RadarIcon,
  WhatsAppIcon,
} from "@/components/icons";
import { formatBRL } from "@/lib/cash";
import {
  RADAR_KIND_INFO,
  describeRadar,
  type Radar,
} from "@/lib/radar";
import type { CarPost } from "@/lib/types";

interface RadarSummary extends Radar {
  hitCount: number;
  best: CarPost | null;
}

interface RadarsResponse {
  radars: RadarSummary[];
  totalHits: number;
  whatsappAvailable: boolean;
}

interface EvaluateResponse {
  radar: Radar;
  hits: CarPost[];
  total: number;
  message: string;
  href: string | null;
  whatsappAvailable: boolean;
  delivery: "manual";
  note: string;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RadarPage() {
  const router = useRouter();

  const [data, setData] = useState<RadarsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const [alert, setAlert] = useState<EvaluateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/radars");
    if (res.status === 401) {
      router.replace("/auth?redirectTo=/radar");
      return;
    }
    if (!res.ok) throw new Error("radars failed");
    setData((await res.json()) as RadarsResponse);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Ask who we are first: a logged-out visitor should be redirected, not
        // shown a red 401 in the console.
        const meRes = await fetch("/api/auth/me");
        const me = meRes.ok ? await meRes.json() : { user: null };
        if (!me.user) {
          router.replace("/auth?redirectTo=/radar");
          return;
        }
        await load();
      } catch {
        if (!cancelled) setError("Não foi possível carregar seus alertas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, load]);

  const onCreated = (created: CreatedRadar) => {
    setShowForm(false);
    setSuccess(
      created.hitCount > 0
        ? `Alerta "${created.radar.name}" criado — ${created.hitCount} ${
            created.hitCount === 1 ? "anúncio já bate" : "anúncios já batem"
          } com ele.`
        : `Alerta "${created.radar.name}" criado. Nenhum anúncio bate com ele agora.`
    );
    void load();
  };

  /**
   * Generate the alert and open WhatsApp.
   *
   * The blank window is opened synchronously, before the fetch, because popup
   * blockers reject window.open() called after an await. If the request fails
   * the blank tab is closed; if the user has no WhatsApp number the message is
   * shown on the page so it can still be copied.
   */
  const notify = async (radar: RadarSummary) => {
    setBusyId(radar.id);
    setActionError("");
    setSuccess("");
    setCopied(false);

    let popup: Window | null = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
    } catch {
      popup = null;
    }

    try {
      const res = await fetch(`/api/radars/${radar.id}/evaluate`, {
        method: "POST",
      });
      const payload = await res.json();
      if (!res.ok) {
        popup?.close();
        setActionError(payload.error || "Não foi possível gerar o aviso.");
        return;
      }

      const result = payload as EvaluateResponse;
      setAlert(result);

      if (result.href && popup) {
        popup.location.href = result.href;
      } else {
        popup?.close();
        if (!result.href) {
          setActionError(
            "Seu perfil não tem WhatsApp. Complete o cadastro para abrir o aviso no aplicativo."
          );
        }
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              radars: prev.radars.map((item) =>
                item.id === radar.id
                  ? { ...item, lastNotifiedAt: result.radar.lastNotifiedAt }
                  : item
              ),
            }
          : prev
      );
    } catch {
      popup?.close();
      setActionError("Erro de conexão. Tente novamente.");
    } finally {
      setBusyId("");
    }
  };

  const copyMessage = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setActionError("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const remove = async (radar: RadarSummary) => {
    if (!window.confirm(`Apagar o alerta "${radar.name}"?`)) return;

    setDeletingId(radar.id);
    setActionError("");
    try {
      const res = await fetch(`/api/radars/${radar.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setActionError(payload.error || "Não foi possível apagar o alerta.");
        return;
      }
      setData((prev) =>
        prev
          ? {
              radars: prev.radars.filter((item) => item.id !== radar.id),
              totalHits:
                prev.totalHits -
                (prev.radars.find((item) => item.id === radar.id)?.hitCount ?? 0),
              whatsappAvailable: prev.whatsappAvailable,
            }
          : prev
      );
      if (alert?.radar.id === radar.id) setAlert(null);
    } catch {
      setActionError("Erro de conexão. Tente novamente.");
    } finally {
      setDeletingId("");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="skeleton mb-2 h-7 w-44" />
        <div className="skeleton mb-6 h-3 w-72" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-[var(--radius-card)]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-sm text-ink-600">
          {error || "Não foi possível carregar seus alertas."}
        </p>
        <button type="button" onClick={() => location.reload()} className="btn-ghost mt-4">
          Tentar novamente
        </button>
      </div>
    );
  }

  const { radars, totalHits, whatsappAvailable } = data;
  const formOpen = showForm || radars.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-brand-700">
            <RadarIcon size={12} />
            Radar
          </span>
          <h1 className="mt-2 text-[22px] font-bold tracking-tight text-ink-900">
            Quem vigia os anúncios por você
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-500">
            Salve o que você procura. O CarMatch confere os anúncios e monta o
            aviso quando algo aparece.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className={formOpen ? "btn-ghost" : "btn-primary"}
        >
          {formOpen ? "Fechar" : "Novo alerta"}
        </button>
      </div>

      {/* Honest limitation */}
      <div className="mt-4 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11.5px] leading-relaxed text-amber-900">
        <span className="font-semibold">O aviso ainda é manual.</span> Não há
        integração com a API do WhatsApp Business neste ambiente, então nada é
        enviado automaticamente. O botão{" "}
        <span className="font-medium">Avisar no WhatsApp</span> abre a mensagem
        pronta no seu próprio WhatsApp — é o texto que você receberia.
      </div>

      {!whatsappAvailable && (
        <p className="mt-2 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-3.5 py-2.5 text-[11.5px] text-red-700">
          Seu perfil está sem WhatsApp.{" "}
          <Link href="/completar-perfil" className="font-semibold underline">
            Complete o cadastro
          </Link>{" "}
          para abrir o aviso no aplicativo.
        </p>
      )}

      {/* Counters */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
        <div className="rounded-xl border border-ink-200 bg-white px-3 py-2.5">
          <p className="text-[10.5px] uppercase tracking-wide text-ink-400">Alertas</p>
          <p className="text-[18px] font-semibold text-ink-800">{radars.length}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white px-3 py-2.5">
          <p className="text-[10.5px] uppercase tracking-wide text-ink-400">
            Anúncios agora
          </p>
          <p
            className={`text-[18px] font-semibold ${
              totalHits > 0 ? "text-emerald-700" : "text-ink-800"
            }`}
          >
            {totalHits}
          </p>
        </div>
      </div>

      {success && (
        <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-800">
          <CheckIcon size={14} className="mt-0.5 shrink-0" />
          {success}
        </p>
      )}
      {actionError && (
        <p className="mt-3 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">
          {actionError}
        </p>
      )}

      {/* Create */}
      {formOpen && (
        <div className="mt-4">
          <RadarForm onCreated={onCreated} />
        </div>
      )}

      {/* Alert preview */}
      {alert && (
        <div className="card mt-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-ink-900">
                Prévia do aviso — {alert.radar.name}
              </h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                {alert.note}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAlert(null)}
              className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Fechar prévia"
            >
              <CloseIcon size={16} />
            </button>
          </div>

          <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-ink-50 px-3.5 py-3 font-sans text-[12px] leading-relaxed text-ink-800">
            {alert.message}
          </pre>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {alert.href ? (
              <a
                href={alert.href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary !py-2 !text-[12px]"
              >
                <WhatsAppIcon size={13} />
                Abrir no WhatsApp
              </a>
            ) : (
              <span className="text-[11.5px] text-ink-500">
                Sem número no perfil: copie o texto e envie pelo seu WhatsApp.
              </span>
            )}
            <button
              type="button"
              onClick={() => copyMessage(alert.message)}
              className="btn-ghost !py-2 !text-[12px]"
            >
              {copied ? "Copiado" : "Copiar texto"}
            </button>
          </div>

          {alert.hits.length > 0 && (
            <div className="mt-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                {alert.total} {alert.total === 1 ? "anúncio encontrado" : "anúncios encontrados"}
              </p>
              <ul className="mt-1.5 space-y-1">
                {alert.hits.slice(0, 5).map((post) => (
                  <li key={post.id}>
                    <Link
                      href={`/posts/${post.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[12px] text-ink-700 hover:bg-ink-50"
                    >
                      <span className="truncate">{post.title}</span>
                      <span className="shrink-0 text-ink-500">
                        R$ {formatBRL(post.car.estimatedValue)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="mt-6 space-y-3">
        {radars.map((radar) => {
          const info = RADAR_KIND_INFO[radar.kind];
          const busy = busyId === radar.id;
          return (
            <article key={radar.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[14px] font-semibold text-ink-900">
                      {radar.name}
                    </h2>
                    <span className="chip">{info.label}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
                    {describeRadar(radar)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-[20px] font-bold leading-none ${
                      radar.hitCount > 0 ? "text-emerald-700" : "text-ink-300"
                    }`}
                  >
                    {radar.hitCount}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-400">
                    agora
                  </p>
                </div>
              </div>

              {radar.best && (
                <Link
                  href={`/posts/${radar.best.id}`}
                  className="mt-3 flex items-center gap-2.5 rounded-lg border border-ink-100 bg-ink-50/60 p-2 transition-colors hover:border-ink-300"
                >
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-100 text-ink-400">
                    {radar.best.images?.length ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/uploads/${radar.best.images[0]}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <PhotoIcon size={15} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink-900">
                      {radar.best.title}
                    </span>
                    <span className="block text-[11px] text-ink-500">
                      R$ {formatBRL(radar.best.car.estimatedValue)}
                      {radar.best.car.localization
                        ? ` · ${radar.best.car.localization}`
                        : ""}
                    </span>
                  </span>
                </Link>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => notify(radar)}
                  disabled={radar.hitCount === 0 || busy}
                  className="btn-primary !py-2 !text-[12px]"
                  title={
                    radar.hitCount === 0
                      ? "Nenhum anúncio bate com este alerta ainda"
                      : "Abre a mensagem pronta no seu WhatsApp"
                  }
                >
                  <WhatsAppIcon size={13} />
                  {busy ? "Gerando..." : "Avisar no WhatsApp"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(radar)}
                  disabled={deletingId === radar.id}
                  className="rounded-lg px-2.5 py-2 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingId === radar.id ? "Apagando..." : "Apagar"}
                </button>
                <span className="ml-auto text-[10.5px] text-ink-400">
                  {radar.hitCount === 0
                    ? "Nenhum anúncio ainda"
                    : radar.lastNotifiedAt
                      ? `Último aviso gerado em ${formatWhen(radar.lastNotifiedAt)}`
                      : "Aviso ainda não aberto"}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {radars.length === 0 && (
        <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-500">
          Nenhum alerta ainda. Crie o primeiro acima — leva menos de um minuto.
        </p>
      )}
    </div>
  );
}
