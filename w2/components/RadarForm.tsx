"use client";

import { useEffect, useState } from "react";
import LocationSelect from "@/components/LocationSelect";
import SearchableSelect, { type SelectOption } from "@/components/SearchableSelect";
import { parseFipeModels, type FipeModelRaw } from "@/lib/fipe-utils";
import { RADAR_KIND_INFO, RADAR_KINDS, type Radar, type RadarKind } from "@/lib/radar";
import type { CarPost } from "@/lib/types";
import { ArrowRightIcon, RadarIcon } from "./icons";

const RADIUS_OPTIONS = [
  { value: "", label: "Qualquer lugar" },
  { value: "50", label: "Até 50 km" },
  { value: "100", label: "Até 100 km" },
  { value: "200", label: "Até 200 km" },
  { value: "500", label: "Até 500 km" },
];

export interface CreatedRadar {
  radar: Radar;
  hitCount: number;
  best: CarPost | null;
}

/** FIPE brands once, shared by both car halves. */
function useBrands() {
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fipe/brands")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { codigo: string; nome: string }[]) => {
        if (cancelled) return;
        setBrands(
          data
            .map((b) => ({ value: b.codigo, label: b.nome }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { brands, loading };
}

/** General model names for a FIPE brand id. Empty while no brand is picked. */
function useModels(brandId: string) {
  const [models, setModels] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!brandId) {
      setModels([]);
      return;
    }
    setLoading(true);
    fetch(`/api/fipe/models?brandId=${brandId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: FipeModelRaw[]) => {
        if (cancelled) return;
        setModels(
          parseFipeModels(raw).generalModels.map((m) => ({ value: m, label: m }))
        );
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  return { models, loading };
}

export default function RadarForm({
  onCreated,
}: {
  onCreated: (created: CreatedRadar) => void;
}) {
  const [kind, setKind] = useState<RadarKind>("match");
  const [name, setName] = useState("");

  const [haveBrandId, setHaveBrandId] = useState("");
  const [haveBrand, setHaveBrand] = useState("");
  const [haveModel, setHaveModel] = useState("");
  const [haveYear, setHaveYear] = useState("");
  const [haveValue, setHaveValue] = useState("");

  const [wantBrandId, setWantBrandId] = useState("");
  const [wantBrand, setWantBrand] = useState("");
  const [wantModel, setWantModel] = useState("");
  const [wantYearMin, setWantYearMin] = useState("");
  const [wantYearMax, setWantYearMax] = useState("");

  const [city, setCity] = useState("");
  const [radius, setRadius] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { brands, loading: brandsLoading } = useBrands();
  const haveModels = useModels(haveBrandId);
  const wantModels = useModels(wantBrandId);

  const info = RADAR_KIND_INFO[kind];
  const canSubmit =
    (!info.needsHave || Boolean(haveBrand && haveModel)) &&
    (!info.needsWant || Boolean(wantBrand && wantModel)) &&
    !saving;

  const reset = () => {
    setName("");
    setHaveBrandId("");
    setHaveBrand("");
    setHaveModel("");
    setHaveYear("");
    setHaveValue("");
    setWantBrandId("");
    setWantBrand("");
    setWantModel("");
    setWantYearMin("");
    setWantYearMax("");
    setCity("");
    setRadius("");
  };

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/radars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim() || undefined,
          have: info.needsHave
            ? {
                brand: haveBrand,
                model: haveModel,
                year: haveYear ? Number(haveYear) : undefined,
                estimatedValue: haveValue ? Number(haveValue) : undefined,
              }
            : undefined,
          want: info.needsWant
            ? {
                brand: wantBrand,
                model: wantModel,
                yearMin: wantYearMin ? Number(wantYearMin) : undefined,
                yearMax: wantYearMax ? Number(wantYearMax) : undefined,
              }
            : undefined,
          city: city || undefined,
          radiusKm: radius ? Number(radius) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível criar o alerta.");
        return;
      }
      reset();
      onCreated(data as CreatedRadar);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <RadarIcon size={17} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold tracking-tight text-ink-900">
            Novo alerta
          </h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
            Diga o que vigiar. O Radar confere os anúncios e monta o aviso para
            você.
          </p>
        </div>
      </div>

      {/* What to watch */}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {RADAR_KINDS.map((option) => {
          const optionInfo = RADAR_KIND_INFO[option];
          const active = kind === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500"
                  : "border-ink-200 bg-white hover:border-ink-300"
              }`}
            >
              <span
                className={`block text-[12.5px] font-semibold ${
                  active ? "text-brand-700" : "text-ink-800"
                }`}
              >
                {optionInfo.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500">
                {optionInfo.description}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
        {info.prompt}
      </p>

      {/* Car I have */}
      {info.needsHave && (
        <fieldset className="mt-4 rounded-xl border border-ink-100 p-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            O carro que eu tenho
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchableSelect
              label="Marca"
              placeholder="Selecione a marca"
              value={haveBrandId}
              options={brands}
              loading={brandsLoading}
              onChange={(opt) => {
                setHaveBrandId(opt?.value ?? "");
                setHaveBrand(opt?.label ?? "");
                setHaveModel("");
              }}
              required
            />
            <SearchableSelect
              label="Modelo"
              placeholder={haveBrandId ? "Selecione o modelo" : "Escolha a marca primeiro"}
              value={haveModel}
              options={haveModels.models}
              loading={haveModels.loading}
              onChange={(opt) => setHaveModel(opt?.value ?? "")}
              disabled={!haveBrandId}
              required
            />
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
                Ano (opcional)
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={haveYear}
                onChange={(e) => setHaveYear(e.target.value)}
                placeholder="2018"
                min={1950}
                max={new Date().getFullYear() + 1}
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
                Valor aproximado (opcional)
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={haveValue}
                onChange={(e) => setHaveValue(e.target.value)}
                placeholder="R$ 65.000"
                className="input-field"
              />
            </label>
          </div>
        </fieldset>
      )}

      {/* Car I want */}
      {info.needsWant && (
        <fieldset className="mt-3 rounded-xl border border-ink-100 p-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            O carro que eu quero
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchableSelect
              label="Marca"
              placeholder="Selecione a marca"
              value={wantBrandId}
              options={brands}
              loading={brandsLoading}
              onChange={(opt) => {
                setWantBrandId(opt?.value ?? "");
                setWantBrand(opt?.label ?? "");
                setWantModel("");
              }}
              required
            />
            <SearchableSelect
              label="Modelo"
              placeholder={wantBrandId ? "Selecione o modelo" : "Escolha a marca primeiro"}
              value={wantModel}
              options={wantModels.models}
              loading={wantModels.loading}
              onChange={(opt) => setWantModel(opt?.value ?? "")}
              disabled={!wantBrandId}
              required
            />
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
                Ano mínimo (opcional)
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={wantYearMin}
                onChange={(e) => setWantYearMin(e.target.value)}
                placeholder="2019"
                min={1950}
                max={new Date().getFullYear() + 1}
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
                Ano máximo (opcional)
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={wantYearMax}
                onChange={(e) => setWantYearMax(e.target.value)}
                placeholder="2024"
                min={1950}
                max={new Date().getFullYear() + 1}
                className="input-field"
              />
            </label>
          </div>
        </fieldset>
      )}

      {/* Where */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <LocationSelect label="Onde procurar (opcional)" value={city} onChange={setCity} />
        <div>
          <p className="mb-2 text-[12px] font-medium text-ink-700">Distância</p>
          <div className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option.value || "any"}
                type="button"
                onClick={() => setRadius(option.value)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition-colors ${
                  radius === option.value
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-ink-600 ring-ink-200 hover:bg-ink-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
          Nome do alerta (opcional)
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={70}
          placeholder="Ex.: Fit para Corolla"
          className="input-field"
        />
      </label>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="btn-primary"
        >
          {saving ? "Criando..." : "Criar alerta"}
          {!saving && <ArrowRightIcon size={14} />}
        </button>
        <p className="text-[11px] text-ink-400">
          O aviso ainda não é enviado sozinho: veja como funciona abaixo.
        </p>
      </div>
    </div>
  );
}
