"use client";

import { useState } from "react";
import type { DossierItemKey, ServiceEntry } from "@/lib/types";
import {
  DOSSIER_ITEMS,
  MIN_SERVICE_ENTRIES,
  TRUST_LEVEL_LABELS,
  dossierTrust,
  type PostWithTrust,
} from "@/lib/trust";
import { CheckIcon, CloseIcon, ShieldCheckIcon } from "./icons";

function todayISO(): string {
  // Local calendar date, not UTC: a service logged at 21h in São Paulo must
  // not be stamped with tomorrow's date because the server runs in UTC.
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatEntryDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("pt-BR");
}

/**
 * Vehicle dossier with pass/pending state.
 *
 * The owner can confirm items and register services here; everyone else sees
 * the same evidence read-only. The score is computed by `dossierTrust`, so
 * the UI can never drift from the listing filter.
 */
export default function DossierSection({
  post,
  isOwner,
  onUpdated,
}: {
  post: PostWithTrust;
  isOwner: boolean;
  onUpdated?: (post: PostWithTrust) => void;
}) {
  const trust = dossierTrust(post);
  const entries: ServiceEntry[] = post.dossier?.serviceEntries ?? [];

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceDate, setServiceDate] = useState(todayISO());
  const [serviceKm, setServiceKm] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [savingService, setSavingService] = useState(false);

  const request = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/posts/${post.id}/dossier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Não foi possível salvar o dossiê.");
    if (data.post) onUpdated?.(data.post as PostWithTrust);
  };

  const toggle = async (item: DossierItemKey, checked: boolean) => {
    setBusy(item);
    setError("");
    try {
      await request({ item, checked });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o dossiê.");
    } finally {
      setBusy(null);
    }
  };

  const removeService = async (entryId: string) => {
    if (!confirm("Remover esta revisão do histórico?")) return;
    setBusy("removeService");
    setError("");
    try {
      await request({ action: "removeService", entryId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover a revisão.");
    } finally {
      setBusy(null);
    }
  };

  const addService = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingService(true);
    setError("");
    try {
      const km = serviceKm.trim() ? Number(serviceKm) : undefined;
      await request({
        action: "addService",
        entry: {
          date: serviceDate,
          description: serviceDescription,
          ...(km !== undefined ? { km } : {}),
        },
      });
      setServiceDescription("");
      setServiceKm("");
      setServiceDate(todayISO());
      setShowServiceForm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao registrar a revisão."
      );
    } finally {
      setSavingService(false);
    }
  };

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon size={15} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-ink-900">Dossiê do veículo</h2>
        </div>
        <span className="text-[11.5px] font-semibold text-ink-600">
          {trust.score}/100 · {TRUST_LEVEL_LABELS[trust.level]}
        </span>
      </div>

      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
        {isOwner
          ? "Confirme apenas o que você pode comprovar. O dossiê aparece no anúncio e vale 60% da confiança da listagem."
          : "Itens conferidos e confirmados pelo vendedor. Peça os comprovantes no chat antes de fechar a troca."}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width]"
          style={{ width: `${trust.score}%` }}
        />
      </div>

      {!isOwner && trust.passed.length === 0 && (
        <p className="mt-3 rounded-lg bg-ink-50 px-2.5 py-2 text-[11px] leading-relaxed text-ink-500">
          Nenhum item foi confirmado ainda. Este anúncio está no nível Novo.
        </p>
      )}

      <ul className="mt-3 divide-y divide-ink-100">
        {DOSSIER_ITEMS.map((item) => {
          const state = trust.items.find((i) => i.key === item.key);
          if (!state) return null;
          const itemEntries =
            item.key === "serviceHistory" ? entries : [];

          return (
            <li key={item.key} className="py-2.5">
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    state.passed
                      ? "bg-brand-100 text-brand-700"
                      : "bg-ink-100 text-ink-400"
                  }`}
                >
                  {state.passed ? (
                    <CheckIcon size={13} />
                  ) : (
                    <CloseIcon size={12} />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[12.5px] font-semibold text-ink-900">
                      {item.label}
                    </p>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        state.passed
                          ? "bg-brand-50 text-brand-700"
                          : "bg-ink-100 text-ink-500"
                      }`}
                    >
                      {state.passed ? "Aprovado" : "Pendente"}
                    </span>
                    <span className="text-[10px] text-ink-400">
                      +{item.weight} pts
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-500">
                    {item.description}
                  </p>

                  {item.key === "serviceHistory" && (
                    <div className="mt-1.5">
                      {itemEntries.length === 0 ? (
                        <p className="text-[11px] text-ink-400">
                          Nenhuma revisão registrada.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {itemEntries.map((entry) => (
                            <li
                              key={entry.id}
                              className="flex items-start justify-between gap-2 rounded-md bg-ink-50 px-2 py-1 text-[11px] text-ink-600"
                            >
                              <span className="min-w-0">
                                <span className="font-medium text-ink-700">
                                  {formatEntryDate(entry.date)}
                                </span>
                                {entry.km !== undefined &&
                                  ` · ${entry.km.toLocaleString("pt-BR")} km`}
                                {" · "}
                                <span className="break-words">
                                  {entry.description}
                                </span>
                              </span>
                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => removeService(entry.id)}
                                  disabled={busy !== null}
                                  aria-label="Remover revisão"
                                  className="shrink-0 rounded p-0.5 text-ink-400 transition-colors hover:text-red-600 disabled:opacity-50"
                                >
                                  <CloseIcon size={11} />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {entries.length < MIN_SERVICE_ENTRIES && (
                        <p className="mt-1 text-[10.5px] text-ink-400">
                          Faltam {MIN_SERVICE_ENTRIES - entries.length} revisão
                          {MIN_SERVICE_ENTRIES - entries.length === 1 ? "" : "ões"}{" "}
                          para liberar os {item.weight} pts.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {isOwner && item.mode === "toggle" && (
                  <button
                    type="button"
                    onClick={() => toggle(item.key, !state.passed)}
                    disabled={busy !== null}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                      state.passed
                        ? "border border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50"
                        : "bg-brand-600 text-white hover:bg-brand-700"
                    }`}
                  >
                    {busy === item.key
                      ? "Salvando..."
                      : state.passed
                        ? "Remover"
                        : "Confirmar"}
                  </button>
                )}

                {isOwner && item.mode === "entries" && (
                  <button
                    type="button"
                    onClick={() => setShowServiceForm((v) => !v)}
                    disabled={busy !== null}
                    className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                  >
                    Registrar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {isOwner && showServiceForm && (
        <form
          onSubmit={addService}
          className="mt-3 rounded-lg border border-dashed border-ink-300 bg-ink-50/60 p-3"
        >
          <p className="text-[11.5px] font-semibold text-ink-700">
            Registrar revisão
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[140px_110px_1fr]">
            <input
              type="date"
              required
              max={todayISO()}
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              aria-label="Data da revisão"
              className="input-field !px-2.5 !py-1.5 !text-[12px]"
            />
            <input
              type="number"
              min={0}
              max={2_000_000}
              value={serviceKm}
              onChange={(e) => setServiceKm(e.target.value)}
              placeholder="Km (opcional)"
              aria-label="Quilometragem da revisão"
              className="input-field !px-2.5 !py-1.5 !text-[12px]"
            />
            <input
              type="text"
              required
              minLength={3}
              maxLength={280}
              value={serviceDescription}
              onChange={(e) => setServiceDescription(e.target.value)}
              placeholder="Ex.: troca de óleo e filtros"
              aria-label="Descrição do serviço"
              className="input-field !px-2.5 !py-1.5 !text-[12px]"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={savingService}
              className="btn-primary !px-3 !py-1.5 !text-[11.5px]"
            >
              {savingService ? "Salvando..." : "Adicionar revisão"}
            </button>
            <button
              type="button"
              onClick={() => setShowServiceForm(false)}
              className="text-[11.5px] text-ink-500 transition-colors hover:text-ink-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11.5px] text-red-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}
