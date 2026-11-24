"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";

/**
 * Car selection backed by the FIPE table.
 *
 * The post form already asks for brand → model → version → year from FIPE and
 * refuses anything else. Every other place that asks "which car?" has to do the
 * same, for two reasons:
 *
 *  · **Reality.** A free-text model lets someone type "Tracker" and match
 *    nothing, or "Ferrari" and match nothing forever. The FIPE list is the set
 *    of cars that actually exist in Brazil.
 *  · **Accuracy.** The FIPE model name carries the version and the
 *    transmission ("TRACKER LT 1.8 16V Flex 4x2 Aut."). Matching a swap needs
 *    that: a listing requiring an automatic cannot be satisfied by a bare
 *    model name.
 *
 * Brand and model are required; year is optional. `onChange` fires with
 * whatever is known so callers can decide what to send.
 */

export interface CarPick {
  /** Display brand name, e.g. "GM - Chevrolet". */
  brand: string;
  brandId: string;
  /** Full FIPE model name, e.g. "TRACKER LT 1.8 16V Flex 4x2 Aut.". */
  model: string;
  modelCode: string;
  year?: number;
  yearCode?: string;
  /** FIPE reference price for the chosen year. */
  value?: number;
}

export const EMPTY_PICK: CarPick = {
  brand: "",
  brandId: "",
  model: "",
  modelCode: "",
};

interface FipeBrand {
  codigo: string;
  nome: string;
}
interface FipeModel {
  codigo: number | string;
  nome: string;
}
interface FipeYear {
  codigo: string;
  nome: string;
}

/** "R$ 45.321,00" -> 45321 */
function parseBRL(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const digits = value.replace(/[^\d,]/g, "").replace(",", ".");
  const n = Number.parseFloat(digits);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

export default function CarPicker({
  value,
  onChange,
  showYear = true,
  showValue = false,
  brandLabel = "Marca",
  modelLabel = "Modelo e versão",
  disabled = false,
}: {
  value: CarPick;
  onChange: (next: CarPick) => void;
  showYear?: boolean;
  showValue?: boolean;
  brandLabel?: string;
  modelLabel?: string;
  disabled?: boolean;
}) {
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [models, setModels] = useState<SelectOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [years, setYears] = useState<SelectOption[]>([]);
  const [yearsLoading, setYearsLoading] = useState(false);
  const [error, setError] = useState("");

  /* Brands: one request for the whole component's life. */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fipe/brands")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("marcas"))))
      .then((data: FipeBrand[]) => {
        if (cancelled) return;
        setBrands(
          data
            .map((b) => ({ value: b.codigo, label: b.nome }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
        );
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar as marcas da FIPE.");
      })
      .finally(() => {
        if (!cancelled) setBrandsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadModels = useCallback(async (brandId: string) => {
    setModelsLoading(true);
    try {
      const res = await fetch(`/api/fipe/models?brandId=${brandId}`);
      if (!res.ok) throw new Error("modelos");
      const data = (await res.json()) as FipeModel[];
      setModels(
        data
          .map((m) => ({ value: String(m.codigo), label: m.nome }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
      );
    } catch {
      setError("Não foi possível carregar os modelos.");
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const loadYears = useCallback(
    async (brandId: string, modelCode: string) => {
      setYearsLoading(true);
      try {
        const res = await fetch(
          `/api/fipe/years?brandId=${brandId}&modelId=${modelCode}`
        );
        if (!res.ok) throw new Error("anos");
        const data = (await res.json()) as FipeYear[];
        setYears(
          data
            .map((y) => ({ value: y.codigo, label: y.nome }))
            // Mais novo primeiro: é o que a pessoa quer ver.
            .sort((a, b) => b.label.localeCompare(a.label, "pt-BR"))
        );
      } catch {
        setError("Não foi possível carregar os anos.");
        setYears([]);
      } finally {
        setYearsLoading(false);
      }
    },
    []
  );

  /*
   * Rehydration: the parent may hold only *names* (a URL like
   * `?wantsBrand=GM - Chevrolet&wantsVersion=TRACKER LT 1.8…`), because the
   * query string has no FIPE codes. Rather than make every caller resolve them,
   * the picker resolves by name once the catalogue arrives — so reopening a
   * filtered URL shows the real selection instead of an empty model list.
   */
  const resolvingBrand = useRef<string | null>(null);
  useEffect(() => {
    if (!value.brand || value.brandId || brands.length === 0) return;
    if (resolvingBrand.current === value.brand) return;
    const match = brands.find(
      (b) => b.label.toLowerCase() === value.brand.toLowerCase()
    );
    if (!match) return;
    resolvingBrand.current = value.brand;
    onChange({ ...value, brandId: match.value, brand: match.label });
    void loadModels(match.value);
  }, [brands, value, onChange, loadModels]);

  const resolvingModel = useRef<string | null>(null);
  useEffect(() => {
    if (!value.model || value.modelCode || !value.brandId || models.length === 0) return;
    if (resolvingModel.current === value.model) return;
    const match = models.find(
      (m) => m.label.toLowerCase() === value.model.toLowerCase()
    );
    if (!match) return;
    resolvingModel.current = value.model;
    onChange({ ...value, modelCode: match.value });
    if (showYear) void loadYears(value.brandId, match.value);
  }, [models, value, onChange, loadYears, showYear]);

  /* Year: same idea, by the leading number ("2016 Flex" → 2016). */
  const resolvingYear = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!value.year || value.yearCode || years.length === 0) return;
    if (resolvingYear.current === value.year) return;
    const match = years.find((y) => Number.parseInt(y.label, 10) === value.year);
    if (!match) return;
    resolvingYear.current = value.year;
    onChange({ ...value, yearCode: match.value });
  }, [years, value, onChange]);

  const onBrand = async (opt: SelectOption | null) => {
    setError("");
    setModels([]);
    setYears([]);
    if (!opt) {
      onChange({ ...EMPTY_PICK });
      return;
    }
    // Trocar de marca invalida modelo e ano: mantê-los casaria dois carros.
    onChange({ brand: opt.label, brandId: opt.value, model: "", modelCode: "" });
    await loadModels(opt.value);
  };

  const onModel = async (opt: SelectOption | null) => {
    setError("");
    setYears([]);
    if (!opt) {
      onChange({ ...value, model: "", modelCode: "", year: undefined, yearCode: undefined, value: undefined });
      return;
    }
    onChange({
      ...value,
      model: opt.label,
      modelCode: opt.value,
      year: undefined,
      yearCode: undefined,
      value: undefined,
    });
    if (showYear) await loadYears(value.brandId, opt.value);
  };

  const onYear = (opt: SelectOption | null) => {
    setError("");
    if (!opt) {
      onChange({ ...value, year: undefined, yearCode: undefined, value: undefined });
      return;
    }
    // O rótulo da FIPE é "2016 Gasolina"; o ano é o primeiro número.
    const year = Number.parseInt(opt.label, 10) || undefined;
    onChange({ ...value, year, yearCode: opt.value });

    if (showValue) {
      fetch(
        `/api/fipe/price?brandId=${value.brandId}&modelId=${value.modelCode}&yearCode=${encodeURIComponent(opt.value)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.Valor) onChange({ ...value, year, yearCode: opt.value, value: parseBRL(d.Valor) });
        })
        .catch(() => {});
    }
  };

  return (
    <div className="space-y-3">
      <SearchableSelect
        label={brandLabel}
        placeholder="Selecione a marca"
        value={value.brandId}
        options={brands}
        loading={brandsLoading}
        onChange={onBrand}
        disabled={disabled}
        required
      />

      <SearchableSelect
        label={modelLabel}
        placeholder={value.brandId ? "Selecione o modelo e a versão" : "Escolha a marca primeiro"}
        value={value.modelCode}
        options={models}
        loading={modelsLoading}
        onChange={onModel}
        disabled={disabled || !value.brandId}
        required
      />

      {showYear && (
        <SearchableSelect
          label="Ano (opcional)"
          placeholder={value.modelCode ? "Selecione o ano" : "Escolha o modelo primeiro"}
          value={value.yearCode ?? ""}
          options={years}
          loading={yearsLoading}
          onChange={onYear}
          disabled={disabled || !value.modelCode}
        />
      )}

      {error && <p className="text-[11.5px] text-red-600">{error}</p>}

      {showValue && value.value !== undefined && (
        <p className="text-[11.5px] text-ink-500">
          Referência FIPE:{" "}
          <strong className="font-semibold text-ink-700">
            R$ {value.value.toLocaleString("pt-BR")}
          </strong>
        </p>
      )}
    </div>
  );
}
