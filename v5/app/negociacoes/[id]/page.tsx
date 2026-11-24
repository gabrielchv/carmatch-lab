"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  DealBlocker,
  DealBlockerView,
  DealPostView,
  DealTaskView,
  DealView,
} from "@/lib/types";
import { formatBRL } from "@/lib/cash";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  FileCheckIcon,
  GaugeIcon,
  MapPinIcon,
  PhotoIcon,
  ShieldCheckIcon,
  SwapIcon,
} from "@/components/icons";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StageTracker({ deal }: { deal: DealView }) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[660px] items-start">
        {deal.stages.map((stage, index) => (
          <li key={stage.stage} className="flex flex-1 items-start">
            <div className="flex w-16 shrink-0 flex-col items-center">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10.5px] font-bold ${
                  stage.status === "done"
                    ? "border-brand-600 bg-brand-600 text-white"
                    : stage.status === "current"
                      ? "border-brand-600 bg-white text-brand-700 ring-4 ring-brand-500/15"
                      : "border-ink-300 bg-white text-ink-400"
                }`}
              >
                {stage.status === "done" ? <CheckIcon size={12} /> : index + 1}
              </span>
              <span
                className={`mt-1.5 text-center text-[10.5px] leading-tight ${
                  stage.status === "current"
                    ? "font-semibold text-brand-700"
                    : stage.status === "done"
                      ? "font-medium text-ink-600"
                      : "text-ink-400"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {index < deal.stages.length - 1 && (
              <span
                className={`mt-3 h-0.5 flex-1 ${
                  stage.status === "done" ? "bg-brand-500" : "bg-ink-200"
                }`}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function CarPanel({
  post,
  label,
  highlight,
}: {
  post: DealPostView;
  label: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-card)] border bg-white ${
        highlight ? "border-brand-200" : "border-ink-200"
      }`}
    >
      <div className="relative aspect-[16/9] bg-ink-100">
        {post.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/uploads/${post.image}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-400">
            <PhotoIcon size={24} />
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            highlight
              ? "bg-brand-600 text-white"
              : "bg-white/90 text-ink-700"
          }`}
        >
          {label}
        </span>
      </div>

      <div className="p-3.5">
        <Link
          href={`/posts/${post.id}`}
          className="line-clamp-1 text-[13px] font-semibold text-ink-900 hover:text-brand-700"
        >
          {post.title}
        </Link>
        <p className="mt-0.5 text-[11.5px] text-ink-500">
          {post.ownerName}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
          <span className="font-medium text-ink-700">
            R$ {formatBRL(post.car.estimatedValue)}
          </span>
          {post.car.year > 0 && <span>{post.car.year}</span>}
          {post.car.mileage !== undefined && (
            <span className="inline-flex items-center gap-1">
              <GaugeIcon size={11} />
              {post.car.mileage.toLocaleString("pt-BR")} km
            </span>
          )}
          {post.car.localization && (
            <span className="inline-flex items-center gap-1">
              <MapPinIcon size={11} />
              {post.car.localization}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  pending,
  onToggle,
}: {
  task: DealTaskView;
  pending: boolean;
  onToggle: (task: DealTaskView) => void;
}) {
  const body = (
    <>
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          task.done
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-ink-300 bg-white text-transparent"
        }`}
      >
        <CheckIcon size={11} />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={`text-[12.5px] font-medium ${
              task.done ? "text-ink-400 line-through" : "text-ink-800"
            }`}
          >
            {task.title}
          </span>
          {!task.required && (
            <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">
              opcional
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500">
          {task.description}
        </span>
      </span>
    </>
  );

  if (!task.canToggle) {
    return (
      <div className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 opacity-80">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(task)}
      disabled={pending}
      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-ink-50 disabled:cursor-wait disabled:opacity-60"
      aria-pressed={task.done}
    >
      {body}
    </button>
  );
}

function BlockerList({ blockers }: { blockers: DealBlockerView[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {blockers.map((blocker) => (
        <li
          key={blocker.taskId}
          className="flex items-start gap-2 text-[11.5px] text-amber-900"
        >
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          <span>
            <span className="font-semibold">{blocker.sideLabel}:</span>{" "}
            {blocker.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

function rawBlockerToView(
  blocker: DealBlocker,
  deal: DealView
): DealBlockerView {
  return {
    ...blocker,
    sideLabel: blocker.side === deal.viewerSide ? "Você" : deal.otherPartyName,
    ownerName:
      blocker.side === "A" ? deal.postA.ownerName : deal.postB.ownerName,
  };
}

export default function DealRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [deal, setDeal] = useState<DealView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [advanceError, setAdvanceError] = useState("");
  const [refusedBlockers, setRefusedBlockers] = useState<
    DealBlockerView[] | null
  >(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/deals/${id}`);
        if (res.status === 401) {
          router.replace(`/auth?redirectTo=/negociacoes/${id}`);
          return;
        }
        if (res.status === 404) {
          if (!cancelled) setLoadError("Negociação não encontrada.");
          return;
        }
        if (!res.ok) throw new Error("deal failed");
        const data = (await res.json()) as { deal: DealView };
        if (!cancelled) setDeal(data.deal);
      } catch {
        if (!cancelled) setLoadError("Não foi possível carregar a negociação.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const toggleTask = async (task: DealTaskView) => {
    if (!deal) return;
    setPendingTaskId(task.id);
    setActionError("");
    setAdvanceError("");
    setRefusedBlockers(null);
    try {
      const res = await fetch(`/api/deals/${id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, done: !task.done }),
      });
      const data = (await res.json()) as {
        deal?: DealView;
        error?: string;
      };
      if (!res.ok || !data.deal) {
        setActionError(data.error ?? "Não foi possível atualizar a tarefa.");
        return;
      }
      setDeal(data.deal);
      setAdvanceError("");
      setRefusedBlockers(null);
    } catch {
      setActionError("Falha de rede ao atualizar a tarefa.");
    } finally {
      setPendingTaskId(null);
    }
  };

  const advance = async () => {
    if (!deal) return;
    setAdvancing(true);
    setActionError("");
    setAdvanceError("");
    setRefusedBlockers(null);
    try {
      const res = await fetch(`/api/deals/${id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        deal?: DealView;
        error?: string;
        blockers?: DealBlocker[];
      };

      if (res.status === 409) {
        setAdvanceError(data.error ?? "Avanço recusado.");
        setRefusedBlockers(
          (data.blockers ?? []).map((blocker) =>
            rawBlockerToView(blocker, deal)
          )
        );
        return;
      }
      if (!res.ok || !data.deal) {
        setAdvanceError(data.error ?? "Não foi possível avançar de etapa.");
        return;
      }

      setDeal(data.deal);
    } catch {
      setAdvanceError("Falha de rede ao avançar de etapa.");
    } finally {
      setAdvancing(false);
    }
  };

  const cancel = async () => {
    if (!deal) return;
    const confirmed = window.confirm(
      "Cancelar esta negociação? Ela sai da esteira, mas o histórico fica preservado."
    );
    if (!confirmed) return;

    setCancelling(true);
    setActionError("");
    setAdvanceError("");
    setRefusedBlockers(null);
    try {
      const res = await fetch(`/api/deals/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelada pelo participante." }),
      });
      const data = (await res.json()) as { deal?: DealView; error?: string };
      if (!res.ok || !data.deal) {
        setActionError(data.error ?? "Não foi possível cancelar.");
        return;
      }
      setDeal(data.deal);
      setRefusedBlockers(null);
      setAdvanceError("");
    } catch {
      setActionError("Falha de rede ao cancelar.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="skeleton mb-2 h-5 w-52" />
        <div className="skeleton mb-6 h-8 w-72" />
        <div className="skeleton mb-5 h-16 rounded-[var(--radius-card)]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="skeleton h-64 rounded-[var(--radius-card)]" />
          <div className="skeleton h-64 rounded-[var(--radius-card)]" />
        </div>
        <div className="skeleton mt-5 h-80 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (loadError || !deal) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-sm font-medium text-ink-700">
          {loadError || "Negociação não encontrada."}
        </p>
        <Link href="/negociacoes" className="btn-ghost mt-4">
          Voltar para negociações
        </Link>
      </div>
    );
  }

  const viewerPost = deal.viewerSide === "A" ? deal.postA : deal.postB;
  const otherPost = deal.viewerSide === "A" ? deal.postB : deal.postA;
  const mine =
    deal.currentStage?.tasks.filter(
      (task) => task.side === deal.viewerSide
    ) ?? [];
  const theirs =
    deal.currentStage?.tasks.filter(
      (task) => task.side !== deal.viewerSide
    ) ?? [];
  const shownBlockers = refusedBlockers ?? deal.blockers;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
        <Link href="/negociacoes" className="hover:text-brand-700">
          Negociações
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-ink-700">{deal.otherPartyName}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
            Troca Fechada
          </p>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink-900">
            Sala de negociação
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-500">
            {deal.viewerCash.label} · {deal.otherPartyName} do outro lado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
              deal.stage === "concluida"
                ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                : deal.stage === "cancelada"
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : "bg-brand-50 text-brand-700 ring-brand-200"
            }`}
          >
            {deal.stageLabel}
          </span>
          <span className="text-[12px] font-semibold text-ink-700">
            {deal.progress}%
          </span>
        </div>
      </div>

      {(actionError || advanceError) && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] text-red-800">
          <p className="font-semibold">
            {advanceError || actionError}
          </p>
          {refusedBlockers && refusedBlockers.length > 0 && (
            <BlockerList blockers={refusedBlockers} />
          )}
        </div>
      )}

      {deal.stage === "cancelada" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-red-800">
            <AlertTriangleIcon size={14} />
            Negociação cancelada
          </p>
          <p className="mt-1 text-[11.5px] text-red-700">
            {deal.cancelReason ?? "Cancelada por uma das partes."}
            {deal.cancelledAt
              ? ` Em ${formatDateTime(deal.cancelledAt)}.`
              : ""}{" "}
            O histórico abaixo fica preservado.
          </p>
        </div>
      )}

      {deal.stage === "concluida" && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-900">
            <ShieldCheckIcon size={14} />
            Troca fechada
          </p>
          <p className="mt-1 text-[11.5px] text-emerald-800">
            Vistoria, documentos, contrato e transferência no Detran concluídos
            para os dois veículos.
          </p>
        </div>
      )}

      <div className="mt-5 rounded-[var(--radius-card)] border border-ink-200 bg-white px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Esteira da troca
          </p>
          <p className="inline-flex items-center gap-1 text-[11px] text-ink-400">
            <ClockIcon size={11} />
            Atualizada em {formatDateTime(deal.updatedAt)}
          </p>
        </div>
        <StageTracker deal={deal} />
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full ${
              deal.stage === "cancelada" ? "bg-red-400" : "bg-brand-600"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, deal.progress))}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <CarPanel post={viewerPost} label="Você" highlight />
        <CarPanel
          post={otherPost}
          label={`A outra parte · ${deal.otherPartyName}`}
          highlight={false}
        />
      </div>

      <div className="mt-4 rounded-[var(--radius-card)] border border-ink-200 bg-white px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Diferença em dinheiro
            </p>
            <p
              className={`mt-1 text-[20px] font-bold tracking-tight ${
                deal.viewerCash.direction === "receive"
                  ? "text-brand-700"
                  : deal.viewerCash.direction === "pay"
                    ? "text-ink-900"
                    : "text-ink-600"
              }`}
            >
              {deal.viewerCash.direction === "none"
                ? "Troca direta"
                : `R$ ${formatBRL(deal.viewerCash.amount)}`}
            </p>
            <p className="mt-0.5 text-[11.5px] text-ink-500">
              {deal.viewerCash.label}
            </p>
          </div>
          <div className="max-w-xs rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-600">
            <span className="font-semibold text-ink-700">Como está escrito:</span>{" "}
            {deal.cashNeutralLabel}
          </div>
        </div>
      </div>

      {deal.currentStage ? (
        <section className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white">
          <div className="border-b border-ink-100 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              Etapa atual · {deal.currentStage.label}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">
              {deal.currentStage.summary}
            </p>
          </div>

          <div className="grid gap-0 sm:grid-cols-2">
            <div className="border-b border-ink-100 px-3 py-3 sm:border-b-0 sm:border-r">
              <p className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                Você
                <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-brand-700">
                  {mine.filter((task) => task.done).length}/{mine.length}
                </span>
              </p>
              <div className="space-y-0.5">
                {mine.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    pending={pendingTaskId === task.id}
                    onToggle={toggleTask}
                  />
                ))}
              </div>
            </div>

            <div className="px-3 py-3">
              <p className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                A outra parte
                <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-600">
                  {theirs.filter((task) => task.done).length}/{theirs.length}
                </span>
              </p>
              <p className="px-2 pb-1 text-[10.5px] text-ink-400">
                {deal.otherPartyName}
              </p>
              <div className="space-y-0.5">
                {theirs.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    pending={false}
                    onToggle={toggleTask}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-5 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-4 py-8 text-center">
          <FileCheckIcon size={20} className="mx-auto text-ink-400" />
          <p className="mt-2 text-[12.5px] font-semibold text-ink-700">
            {deal.stage === "concluida"
              ? "Nenhuma tarefa pendente: a troca foi concluída."
              : "Esta negociação não tem mais etapas ativas."}
          </p>
        </section>
      )}

      {!deal.isTerminal && (
        <section className="mt-5 rounded-[var(--radius-card)] border border-ink-200 bg-white p-4">
          {shownBlockers.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-900">
                <AlertTriangleIcon size={14} />
                {shownBlockers.length} tarefa
                {shownBlockers.length === 1 ? "" : "s"} obrigatória
                {shownBlockers.length === 1 ? "" : "s"} em aberto
              </p>
              <BlockerList blockers={shownBlockers} />
              <p className="mt-2 text-[11px] text-amber-800">
                As duas partes precisam concluir as tarefas da etapa atual. Uma
                parte sozinha não avança a negociação.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-900">
                <ShieldCheckIcon size={14} />
                Tudo pronto para avançar
              </p>
              <p className="mt-1 text-[11.5px] text-emerald-800">
                As tarefas obrigatórias desta etapa estão concluídas dos dois
                lados.
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling || advancing}
              className="text-[11.5px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {cancelling ? "Cancelando..." : "Cancelar negociação"}
            </button>
            <button
              type="button"
              onClick={advance}
              disabled={advancing || cancelling}
              className="btn-primary !text-[12.5px]"
            >
              {advancing ? "Avançando..." : "Avançar etapa"}
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </section>
      )}

      <section className="mt-5 rounded-[var(--radius-card)] border border-ink-200 bg-white p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <SwapIcon size={12} />
          Histórico da negociação
        </p>
        <p className="mt-1 text-[11px] text-ink-400">
          Trilha imutável de transições: quem avançou, quando e de qual etapa
          para qual.
        </p>

        <ol className="relative mt-4 space-y-4 border-l border-ink-200 pl-4">
          {deal.history.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
              <p className="text-[10.5px] text-ink-400">
                {formatDateTime(entry.at)} · {entry.byName}
              </p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-ink-800">
                {entry.fromLabel} → {entry.toLabel}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">
                {entry.note}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
