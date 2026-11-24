"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";

const GOOGLE_SVG = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const ERROR_MESSAGES: Record<string, string> = {
  acesso_negado: "Você cancelou a autenticação.",
  parametros_invalidos: "Parâmetros inválidos recebidos do Google.",
  sessao_expirada: "A sessão expirou. Tente novamente.",
  state_invalido: "Erro de segurança. Tente novamente.",
  erro_autenticacao: "Erro ao autenticar com o Google. Tente novamente.",
  sem_email: "Não foi possível obter seu email do Google.",
};

function AuthContent() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const redirectTo = searchParams.get("redirectTo") || "/my-posts";
  const errorMsg = errorKey ? ERROR_MESSAGES[errorKey] : null;

  const [devEnabled, setDevEnabled] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [devError, setDevError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/dev-enabled")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        if (!cancelled) setDevEnabled(Boolean(d.enabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = `/api/auth/oauth/google?redirectTo=${encodeURIComponent(redirectTo)}`;
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDevError(data.error || "Não foi possível entrar.");
        return;
      }
      window.location.href = redirectTo;
    } catch {
      setDevError("Erro de conexão.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <div className="text-center">
        <h1 className="text-[22px] font-bold tracking-tight text-ink-900">
          Entrar no CarMatch Corrente
        </h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Use sua conta Google para anunciar e conversar
        </p>
      </div>

      {errorMsg && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-[12.5px] text-red-700">
          {errorMsg}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleLogin}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-700 shadow-sm transition-colors hover:border-ink-300 hover:bg-ink-50"
      >
        {GOOGLE_SVG}
        Entrar com Google
      </button>

      {devEnabled && (
        <div className="mt-8 border-t border-dashed border-ink-200 pt-6">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Ambiente local · login de teste
          </p>

          <form onSubmit={handleDevLogin} className="space-y-2.5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Seu nome"
              className="input-field"
              aria-label="Nome"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="email@teste.com"
              className="input-field"
              aria-label="E-mail"
            />
            {devError && (
              <p className="text-[12px] text-red-600">{devError}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-ghost w-full"
            >
              {submitting ? "Entrando..." : "Entrar sem senha"}
              <ArrowRightIcon size={14} />
            </button>
          </form>

          <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-400">
            Cria contas novas. Em produção, contas existentes exigem Google.
          </p>
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-ink-400">
        Ao entrar, você concorda com os termos de uso do CarMatch Corrente.
      </p>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto mt-16 max-w-sm px-4 text-center text-sm text-ink-400">
          Carregando...
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
