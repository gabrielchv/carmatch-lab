"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CarPicker, { EMPTY_PICK, type CarPick } from "./CarPicker";
import { ArrowRightIcon, CloseIcon, SwapIcon } from "./icons";

/**
 * "Quem quer meu carro?"
 *
 * Every other filter answers "show me cars I might want". This one is the
 * inverse: put in the car you already have and see the people who would accept
 * it in a trade. That is the question a seller actually needs answered before
 * spending time on a listing — and, unusually, it can be answered even when you
 * have published nothing yet.
 *
 * The picker is FIPE-backed (brand → model+version → year) for the same reason
 * the post form is: a free-text model cannot be matched against a real listing,
 * and the FIPE name carries the transmission that many listings require.
 */
export default function WantMyCarFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeBrand = searchParams.get("wantsBrand") ?? "";
  const activeVersion = searchParams.get("wantsVersion") ?? "";
  const activeModel = searchParams.get("wantsModel") ?? "";
  const activeYear = searchParams.get("wantsYear") ?? "";
  const isActive = Boolean(activeBrand || activeModel || activeVersion);

  const [open, setOpen] = useState(isActive);
  const [pick, setPick] = useState<CarPick>({
    ...EMPTY_PICK,
    brand: activeBrand,
    // A versão completa é o que importa; o modelo geral é só rótulo.
    model: activeVersion || activeModel,
    year: activeYear ? Number(activeYear) : undefined,
  });

  const apply = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    if (pick.brand && pick.model) {
      params.set("wantsBrand", pick.brand);
      // Modelo geral (primeira palavra) serve de rótulo e de fallback; a versão
      // completa é o que o matcher usa, porque carrega a transmissão.
      params.set("wantsModel", pick.model.split(" ")[0]);
      params.set("wantsVersion", pick.model);
      if (pick.year) params.set("wantsYear", String(pick.year));
      else params.delete("wantsYear");
    } else {
      params.delete("wantsBrand");
      params.delete("wantsModel");
      params.delete("wantsVersion");
      params.delete("wantsYear");
    }

    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const clear = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("wantsBrand");
    params.delete("wantsModel");
    params.delete("wantsVersion");
    params.delete("wantsYear");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/40"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <SwapIcon size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink-900">
            Quem quer o carro que você já tem?
          </span>
          <span className="block text-[11.5px] text-ink-500">
            Coloque seu carro e veja quem aceita ele na troca.
          </span>
        </span>
        <ArrowRightIcon size={15} className="shrink-0 text-ink-400" />
      </button>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-brand-200 bg-brand-50/50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink-900">
            Quem quer o carro que você já tem?
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-500">
            Mostra só os anúncios que aceitariam esse carro na troca.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isActive) clear();
            else setOpen(false);
          }}
          className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-ink-700"
          aria-label={isActive ? "Limpar filtro" : "Fechar"}
        >
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CarPicker
          value={pick}
          onChange={setPick}
          showYear
          brandLabel="Marca"
          modelLabel="Modelo"
          versionLabel="Versão"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={!pick.brand || !pick.model}
          className="btn-primary !py-2.5"
        >
          Ver
        </button>

        {isActive && (
          <p className="text-[11.5px] text-ink-600">
            Filtrando por{" "}
            <strong className="font-semibold text-ink-800">
              {activeVersion || activeModel}
            </strong>
            {activeYear && <span> · {activeYear}</span>}
            <button
              type="button"
              onClick={clear}
              className="ml-2 font-medium text-brand-600 hover:underline"
            >
              limpar
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
