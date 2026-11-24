"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RadarDraft } from "@/lib/radar";
import { RadarIcon, ArrowRightIcon } from "./icons";

/**
 * "Turn this search into an alert" — used where the user has just expressed an
 * intent (onboarding answers, a "quem quer meu carro" filter) so they do not
 * have to retype it on /radar.
 *
 * Signed-out visitors are sent to login with a return path, because a radar is
 * stored per user: there is nowhere to keep it before there is an account.
 */
export default function RadarQuickCreate({
  label,
  hint,
  input,
  signedIn,
  redirectTo,
}: {
  label: string;
  hint?: string;
  input: RadarDraft;
  signedIn: boolean;
  redirectTo: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ hitCount: number } | null>(null);
  const [error, setError] = useState("");

  const create = async () => {
    if (!signedIn) {
      router.push(`/auth?redirectTo=${encodeURIComponent(redirectTo)}`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/radars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível criar o alerta.");
        return;
      }
      setCreated({ hitCount: data.hitCount ?? 0 });
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-brand-200 bg-brand-50/50 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-brand-200">
          <RadarIcon size={15} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-ink-900">
            {created ? "Alerta criado no Radar" : label}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
            {created ? (
              <>
                {created.hitCount === 0
                  ? "Ainda não há anúncio que bata com este alerta."
                  : `${created.hitCount} ${created.hitCount === 1 ? "anúncio já bate" : "anúncios já batem"} com ele.`}{" "}
                <Link href="/radar" className="font-medium text-brand-700 hover:underline">
                  Ver no Radar
                </Link>
              </>
            ) : (
              hint ??
              "O Radar confere os anúncios e monta o aviso para você no WhatsApp."
            )}
          </p>
        </div>

        {!created && (
          <button
            type="button"
            onClick={create}
            disabled={saving}
            className="btn-primary shrink-0 !px-3.5 !py-2 !text-[12px]"
          >
            {saving ? "Criando..." : label}
            {!saving && <ArrowRightIcon size={13} />}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[11.5px] text-red-700">{error}</p>}
    </div>
  );
}
