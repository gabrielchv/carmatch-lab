"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { WhatsAppIcon, ArrowRightIcon } from "@/components/icons";

/**
 * The one mandatory step Google sign-in cannot skip.
 *
 * WhatsApp is the only way to reach another person in this product, so an
 * account without a number is useless. This screen also lets an existing user
 * fix a number that was wrong.
 */
function CompleteProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";
  const isNew = searchParams.get("novo") === "1";

  const [whatsapp, setWhatsapp] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (cancelled) return;
        if (!d.user) {
          router.replace(`/auth?redirectTo=${encodeURIComponent(redirectTo)}`);
          return;
        }
        setName(d.user.name ?? "");
        setWhatsapp(d.user.whatsapp ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar.");
        return;
      }
      router.replace(isNew ? `/boas-vindas?redirectTo=${encodeURIComponent(redirectTo)}` : redirectTo);
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-ink-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 shadow-[0_1px_2px_rgba(20,24,30,0.04)]">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eefaf2] text-[#128040]">
          <WhatsAppIcon size={22} />
        </div>

        <h1 className="mt-4 text-[22px] font-bold tracking-tight text-ink-900">
          {isNew ? "Falta só seu WhatsApp" : "Seu WhatsApp"}
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
          {isNew
            ? `Bem-vindo, ${name.split(" ")[0]}. O CarMatch não tem chat: todas as conversas acontecem no WhatsApp. É por ele que alguém vai te chamar quando der match.`
            : "Este é o número que aparece para quem der match com você."}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
              WhatsApp com DDD
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              required
              autoFocus
              placeholder="(11) 91234-5678"
              className="input-field"
              aria-label="WhatsApp"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Salvando..." : "Continuar"}
            <ArrowRightIcon size={14} />
          </button>
        </form>

        <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
          Usamos o número só para conectar trocas. Nada de lista de transmissão.
        </p>
      </div>

      <p className="mt-6 text-center text-[12px] text-ink-400">
        <Link href="/" className="hover:text-brand-600">
          Ver os carros primeiro
        </Link>
      </p>
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-ink-400">
          Carregando...
        </div>
      }
    >
      <CompleteProfileContent />
    </Suspense>
  );
}
