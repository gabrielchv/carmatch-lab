"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User, VerificationSignal } from "@/lib/types";
import {
  TRUST_LEVEL_LABELS,
  nextTrustLevel,
  userTrust,
  type TrustLevel,
  type UserTrust,
} from "@/lib/trust";
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  ShieldCheckIcon,
} from "@/components/icons";

const LEVEL_STYLES: Record<TrustLevel, string> = {
  confiavel: "bg-brand-700 text-white",
  verificado: "bg-brand-100 text-brand-800",
  novo: "bg-ink-100 text-ink-600",
};

function LevelPill({ level }: { level: TrustLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${LEVEL_STYLES[level]}`}
    >
      <ShieldCheckIcon size={12} />
      {TRUST_LEVEL_LABELS[level]}
    </span>
  );
}

export default function VerificarPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<VerificationSignal | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setUser(data.user);
        } else if (!cancelled) {
          setUser(null);
        }
      } catch {
        if (!cancelled) setError("Não foi possível carregar sua conta.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const trust: UserTrust = userTrust(user);
  const next = nextTrustLevel(trust.score);

  const toggle = async (step: UserTrust["steps"][number]) => {
    const confirmed = !step.confirmed;
    setBusy(step.key);
    setError("");
    try {
      const res = await fetch("/api/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal: step.key, confirmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar a verificação.");
        return;
      }
      if (data.user) setUser(data.user as User);
    } catch {
      setError("Falha de rede ao salvar a verificação.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight text-ink-900">
          Verificação de conta
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">
          Troca com verificação — só fecha com quem tem dossiê. Quanto mais
          sinais você confirmar, mais alto fica o seu nível e mais confiança os
          seus anúncios passam.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-40 rounded-[var(--radius-card)]" />
          <div className="skeleton h-72 rounded-[var(--radius-card)]" />
        </div>
      ) : !user ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <ShieldCheckIcon size={20} />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-800">
            Entre para verificar sua conta
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
            A verificação fica salva no seu perfil e é exibida em todos os seus
            anúncios.
          </p>
          <Link
            href="/auth?redirectTo=/verificar"
            className="btn-primary mt-5 !text-[12.5px]"
          >
            Entrar e verificar
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            {/* Score */}
            <section className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                    Seu nível de confiança
                  </p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-4xl font-bold leading-none tracking-tight text-ink-900">
                      {trust.score}
                    </span>
                    <span className="pb-0.5 text-[13px] font-medium text-ink-400">
                      / 100
                    </span>
                  </div>
                </div>
                <LevelPill level={trust.level} />
              </div>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width]"
                  style={{ width: `${trust.score}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <span className="text-ink-500">
                  {trust.verified.length} de {trust.steps.length} sinais
                  confirmados
                </span>
                {next ? (
                  <span className="font-medium text-brand-700">
                    Faltam {next.missingPoints} pts para{" "}
                    {TRUST_LEVEL_LABELS[next.level]}
                  </span>
                ) : (
                  <span className="font-medium text-brand-700">
                    Nível máximo atingido
                  </span>
                )}
              </div>
            </section>

            {/* Steps */}
            <section className="card overflow-hidden">
              <div className="border-b border-ink-100 px-4 py-3.5 sm:px-5">
                <h2 className="text-sm font-semibold text-ink-900">
                  Etapas de verificação
                </h2>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">
                  Ambiente local: as conferências são simuladas e o resultado
                  fica salvo no seu perfil. Em produção, cada etapa viraria uma
                  integração real (Receita, Serpro, bureau de crédito).
                </p>
              </div>

              <ul className="divide-y divide-ink-100">
                {trust.steps.map((step) => (
                  <li
                    key={step.key}
                    className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        step.confirmed
                          ? "bg-brand-100 text-brand-700"
                          : "bg-ink-100 text-ink-400"
                      }`}
                    >
                      {step.confirmed ? (
                        <CheckIcon size={14} />
                      ) : (
                        <CloseIcon size={13} />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[13px] font-semibold text-ink-900">
                          {step.label}
                        </p>
                        <span className="text-[10.5px] font-medium text-ink-400">
                          +{step.weight} pts
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
                        {step.description}
                      </p>
                      {step.confirmed && step.confirmedAt && (
                        <p className="mt-0.5 text-[10.5px] text-brand-700">
                          Confirmado em{" "}
                          {new Date(step.confirmedAt).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggle(step)}
                      disabled={busy !== null}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
                        step.confirmed
                          ? "border border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50"
                          : "bg-brand-600 text-white hover:bg-brand-700"
                      }`}
                    >
                      {busy === step.key
                        ? "Salvando..."
                        : step.confirmed
                          ? "Remover"
                          : "Confirmar"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700"
              >
                {error}
              </p>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <div className="card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                Por que verificar
              </p>
              <ul className="mt-2 space-y-2 text-[12px] leading-relaxed text-ink-600">
                <li className="flex gap-2">
                  <ShieldCheckIcon
                    size={14}
                    className="mt-0.5 shrink-0 text-brand-600"
                  />
                  O seu nível aparece em todos os anúncios, com o dossiê do
                  carro.
                </li>
                <li className="flex gap-2">
                  <ShieldCheckIcon
                    size={14}
                    className="mt-0.5 shrink-0 text-brand-600"
                  />
                  O filtro “Só anúncios verificados” combina esse nível com o
                  dossiê do carro.
                </li>
                <li className="flex gap-2">
                  <ShieldCheckIcon
                    size={14}
                    className="mt-0.5 shrink-0 text-brand-600"
                  />
                  Uma conta verificada não fecha a troca sozinha: o dossiê do
                  veículo vale 60% da nota do anúncio.
                </li>
              </ul>
            </div>

            <div className="card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                Próximo passo
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-600">
                Complete o dossiê dos seus carros: documento no seu nome, sem
                multas, sem gravame, vistoria e histórico de revisões.
              </p>
              <Link
                href="/my-posts"
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:underline"
              >
                Ir para meus anúncios
                <ArrowRightIcon size={12} />
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
