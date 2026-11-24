"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@/lib/types";
import {
  USER_LEVEL_THRESHOLDS,
  levelLabel,
  nextUserLevel,
  userTrust,
  type TrustLevel,
  type UserTrust,
} from "@/lib/confianca";
import { ShieldCheckIcon } from "@/components/TrustBadge";
import { CheckIcon } from "@/components/icons";

/**
 * /confianca — the six identity proofs, with the score updating as you go.
 *
 * The score is computed locally from `lib/confianca` and then replaced by the
 * server's answer after each toggle. That keeps the page instant while still
 * making the server the source of truth: the badge on a listing is written by
 * the same function, against the same stored flags.
 */

interface VerificationResponse {
  signal: string;
  confirmed: boolean;
  trust: UserTrust;
}

export default function ConfiancaPage() {
  const [user, setUser] = useState<User | null>(null);
  const [trust, setTrust] = useState<UserTrust>(() => userTrust(null));
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = res.ok ? await res.json() : { user: null };
      const current: User | null = data.user ?? null;
      setUser(current);
      setTrust(userTrust(current));
    } catch {
      setError("Não foi possível carregar seu perfil agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (signal: string) => {
    if (pending) return;
    setPending(signal);
    setError("");

    // Optimistic: the switch must answer the finger immediately. The server
    // response then overwrites the whole score, so a failure cannot leave a
    // phantom confirmation behind.
    const currentStep = trust.steps.find((step) => step.key === signal);
    const desired = currentStep ? !currentStep.confirmed : true;

    try {
      const res = await fetch("/api/confianca/verificacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal, confirmed: desired }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Não foi possível salvar agora.");
        return;
      }

      const result = data as VerificationResponse;
      setTrust(result.trust);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              verifications: {
                ...(prev.verifications ?? {}),
                [result.signal]: result.confirmed,
              },
            }
          : prev
      );
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(null);
      // Re-read on the way out: the optimistic path is a guess about what the
      // server stored, and this page is the one place a wrong number is visible.
      await load().catch(() => {});
    }
  };

  const next = nextUserLevel(trust.score);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <ShieldCheckIcon size={20} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-tight text-ink-900">
            Confiança
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
            Você vai entregar um carro para um estranho. Estas verificações
            aparecem no seu anúncio e na primeira mensagem de WhatsApp — é assim
            que a outra pessoa sabe com quem está falando antes de responder.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="skeleton h-32 w-full rounded-[var(--radius-card)]" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : !user ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-ink-900">
            Entre para verificar sua identidade
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
            A verificação fica ligada à sua conta e acompanha todos os seus
            anúncios. Leva alguns minutos e você pode parar quando quiser.
          </p>
          <Link href="/auth?redirectTo=/confianca" className="btn-primary mt-4">
            Entrar e verificar
          </Link>
        </div>
      ) : (
        <>
          <ScoreCard trust={trust} next={next} />

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {error}
            </p>
          )}

          <ul className="mt-5 space-y-2.5">
            {trust.steps.map((step) => {
              const busy = pending === step.key;
              return (
                <li
                  key={step.key}
                  className={`flex items-start gap-3 rounded-[var(--radius-card)] border p-3.5 transition-colors ${
                    step.confirmed
                      ? "border-brand-200 bg-brand-50/60"
                      : "border-ink-200 bg-white"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      step.confirmed
                        ? "bg-brand-600 text-white"
                        : "bg-ink-100 text-ink-400"
                    }`}
                    aria-hidden
                  >
                    {step.confirmed ? <CheckIcon size={13} /> : <span className="text-[11px] font-semibold">+</span>}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-[13.5px] font-semibold text-ink-900">
                        {step.label}
                      </p>
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 ring-1 ring-ink-200">
                        +{step.weight}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">
                      {step.hint}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggle(step.key)}
                    disabled={busy || pending !== null}
                    aria-pressed={step.confirmed}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                      step.confirmed
                        ? "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                        : "bg-brand-600 text-white hover:bg-brand-700"
                    }`}
                  >
                    {busy
                      ? "Salvando..."
                      : step.confirmed
                        ? "Confirmado"
                        : "Verificar"}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 rounded-[var(--radius-card)] border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">
              Como o nível é calculado
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-600">
              Cada item soma pontos de acordo com o quanto prova sobre quem você
              é. CPF vale mais que e-mail porque é o que o cartório confere na
              transferência. O nível vem da soma:
            </p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-3">
              <LevelRow
                level="novo"
                text={`abaixo de ${USER_LEVEL_THRESHOLDS.verificado} pontos`}
                active={trust.level === "novo"}
              />
              <LevelRow
                level="verificado"
                text={`${USER_LEVEL_THRESHOLDS.verificado} a ${USER_LEVEL_THRESHOLDS.confiavel - 1} pontos`}
                active={trust.level === "verificado"}
              />
              <LevelRow
                level="confiavel"
                text={`${USER_LEVEL_THRESHOLDS.confiavel} pontos ou mais`}
                active={trust.level === "confiavel"}
              />
            </dl>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
              O anúncio usa 40% deste nível e 60% do dossiê do veículo. É o
              dossiê que fala do carro: documento no seu nome, sem gravame, sem
              multas. Você preenche na página de cada anúncio.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href="/my-posts" className="btn-primary">
              Ver meus anúncios
            </Link>
            <Link href="/" className="btn-ghost">
              Ver carros
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreCard({
  trust,
  next,
}: {
  trust: UserTrust;
  next: { level: TrustLevel | null; missing: number };
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-brand-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-brand-600 px-4 py-4 text-white sm:px-5">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/70">
            Seu nível de confiança
          </p>
          <p className="mt-1 text-[26px] font-bold leading-none tracking-tight">
            {levelLabel(trust.level)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[30px] font-bold leading-none tracking-tight">
            {trust.score}
            <span className="text-[15px] font-medium text-white/60">/100</span>
          </p>
          <p className="mt-1 text-[11px] text-white/70">
            {trust.confirmed} de {trust.total} verificações
          </p>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-ink-100"
          role="progressbar"
          aria-valuenow={trust.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Pontuação de confiança"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${trust.score}%` }}
          />
        </div>

        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-600">
          {next.level
            ? `Faltam ${next.missing} ponto${next.missing === 1 ? "" : "s"} para o nível ${levelLabel(next.level)}.`
            : "Nível máximo. Sua mensagem já cita a verificação completa."}
        </p>
      </div>
    </section>
  );
}

function LevelRow({
  level,
  text,
  active,
}: {
  level: TrustLevel;
  text: string;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 ${
        active ? "border-brand-300 bg-brand-50" : "border-ink-100 bg-ink-50/60"
      }`}
    >
      <dt
        className={`text-[11.5px] font-semibold ${
          active ? "text-brand-700" : "text-ink-700"
        }`}
      >
        {levelLabel(level)}
        {active && <span className="ml-1 text-[10px] font-medium">· você</span>}
      </dt>
      <dd className="mt-0.5 text-[10.5px] leading-snug text-ink-500">{text}</dd>
    </div>
  );
}
