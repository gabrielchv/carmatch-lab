"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";
import type { SimplifiedModelsPayload, SimplifiedVersionPayload } from "@/lib/fipe-utils";

/**
 * Car selection backed by the FIPE table, with the catalogue simplified.
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
 * What changed here is the *shape* of the question. FIPE repeats every trim as
 * its own model — 557 Chevrolet entries, 20 of them TRACKER — and a 20-row
 * select is not precise, it is a wall. So the picker asks three levels instead:
 *
 *   Marca → Modelo (a linha: "Tracker", "Corolla") → Versão (motor e câmbio)
 *
 * A version option collapses the trims that share an engine ("Tracker 1.8
 * Flex · Aut." covers LT, LTZ, Premier and Midnight), so the list inside a
 * model is short and every option is a real car.
 *
 * Collapsing is a *shortcut*, never a loss: a group with more than one trim
 * reveals a "Versão exata" select listing every FIPE entry it covers, so the
 * catalogue stays fully reachable. Choosing the group stores the representative
 * trim; choosing an exact version stores that one — same codes, same year and
 * price lookups.
 */

export interface CarPick {
  /** Display brand name, e.g. "GM - Chevrolet". */
  brand: string;
  brandId: string;
  /** Full FIPE model name, e.g. "TRACKER LT 1.8 16V Flex 4x2 Aut.". */
  model: string;
  modelCode: string;
  /**
   * O que mostrar para o usuário, quando o nome gravado não é o que ele escolheu.
   *
   * `model` guarda o nome exato da FIPE (é o que o anúncio precisa), mas a
   * opção agrupada se chama "Tracker 1.8 Flex · Aut." — e um resumo que dissesse
   * "TRACKER LT 1.8 16V Flex 4x2 Aut." estaria citando um acabamento que a
   * pessoa nunca viu.
   */
  displayName?: string;
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

/** Year options carry the model code they came from — see `loadYears`. */
interface YearOption extends SelectOption {
  modelCode: string;
  fullName: string;
}

/**
 * How many trim codes to ask FIPE about when building the year list.
 *
 * A simplified option can span several trims, and each trim covers different
 * model years: the base trim may stop at 2016 while the top trim still runs to
 * 2019. Asking only the representative would hide years the option genuinely
 * covers. The cap keeps a pathological group from firing thirty requests.
 */
const MAX_YEAR_LOOKUPS = 10;

/**
 * Up to `count` entries spread across the list, always including both ends.
 *
 * FIPE orders trims oldest-first and coverage differs per trim: taking the
 * first ten of a 55-trim group would ask only about 1998 cars and hide that the
 * option runs to 2024.
 */
function spread<T>(list: T[], count: number): T[] {
  if (list.length <= count) return list;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(list[Math.round((i * (list.length - 1)) / (count - 1))]);
  }
  return [...new Set(out)];
}

export default function CarPicker({
  value,
  onChange,
  showYear = true,
  showValue = false,
  brandLabel = "Marca",
  modelLabel = "Modelo",
  versionLabel = "Versão",
  disabled = false,
}: {
  value: CarPick;
  onChange: (next: CarPick) => void;
  showYear?: boolean;
  showValue?: boolean;
  brandLabel?: string;
  modelLabel?: string;
  versionLabel?: string;
  disabled?: boolean;
}) {
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  const [lines, setLines] = useState<SimplifiedModelsPayload["lines"]>([]);
  const [stats, setStats] = useState<SimplifiedModelsPayload["stats"] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [years, setYears] = useState<YearOption[]>([]);
  const [yearsLoading, setYearsLoading] = useState(false);
  /**
   * True when the year list could not be fetched (as opposed to a car that has
   * no years). The select then becomes a plain number field: FIPE being down
   * must not stop someone from saying which year their car is.
   */
  const [yearsUnavailable, setYearsUnavailable] = useState(false);

  const [error, setError] = useState("");
  /** ISO date of a saved catalogue, when upstream is unavailable. */
  const [staleAt, setStaleAt] = useState<string | null>(null);
  /** Bumping this re-runs the fetches — the retry button. */
  const [reloadKey, setReloadKey] = useState(0);

  /* Per-brand cache: reopening the picker must not refetch 557 models. */
  const linesCache = useRef(new Map<string, SimplifiedModelsPayload>());

  /* Memo of the last year lookup, so a re-render does not refetch the list.
     Declared here because `reload` clears it. */
  const lastYearLookup = useRef<string | null>(null);

  const reload = useCallback(() => {
    linesCache.current.clear();
    lastYearLookup.current = null;
    setError("");
    setStaleAt(null);
    setReloadKey((k) => k + 1);
  }, []);

  /* Brands: one request per attempt. */
  useEffect(() => {
    let cancelled = false;
    setBrandsLoading(true);

    fetch("/api/fipe/brands")
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        // The route explains *why* (quota, upstream down); repeating a generic
        // "could not load" hides the one thing the user can act on.
        if (!r.ok || !Array.isArray(body)) {
          throw new Error(body?.error ?? "Não foi possível carregar as marcas.");
        }
        return body as FipeBrand[];
      })
      .then((data) => {
        if (cancelled) return;
        setBrands(
          data
            .map((b) => ({ value: b.codigo, label: b.nome }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
        );
        if (data.length === 0) {
          setError("A Tabela FIPE devolveu uma lista de marcas vazia.");
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBrandsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loadModels = useCallback(async (brandId: string) => {
    const cached = linesCache.current.get(brandId);
    if (cached) {
      setLines(cached.lines ?? []);
      setStats(cached.stats ?? null);
      setStaleAt(cached.fetchedAt ?? (cached.stale ? "" : null));
      return cached;
    }
    setModelsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/fipe/models?brandId=${brandId}&simplified=1`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !Array.isArray(body.lines)) {
        throw new Error(body?.error ?? "Não foi possível carregar os modelos.");
      }
      const data = body as SimplifiedModelsPayload;
      linesCache.current.set(brandId, data);
      setLines(data.lines ?? []);
      setStats(data.stats ?? null);
      setStaleAt(data.stale ? (data.fetchedAt ?? "") : null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os modelos.");
      setLines([]);
      setStats(null);
      setStaleAt(null);
      return null;
    } finally {
      setModelsLoading(false);
    }
  }, []);

  /**
   * Years for a simplified option: the union over the trims it covers.
   *
   * Returns one entry per year, tagged with the trim code that has it, so the
   * price lookup later asks about the car the user actually picked.
   */
  const loadYears = useCallback(
    async (brandId: string, version: SimplifiedVersionPayload) => {
      setYearsLoading(true);
      setYearsUnavailable(false);
      try {
        const codes = spread(
          version.codes?.length ? version.codes : [version.code],
          MAX_YEAR_LOOKUPS
        );
        let failed = 0;
        const results = await Promise.all(
          codes.map(async (code) => {
            try {
              const res = await fetch(`/api/fipe/years?brandId=${brandId}&modelId=${code}`);
              if (!res.ok) {
                failed += 1;
                return [] as { code: string; years: FipeYear[] }[];
              }
              const data = (await res.json()) as FipeYear[];
              if (!Array.isArray(data)) {
                failed += 1;
                return [];
              }
              return [{ code, years: data }];
            } catch {
              failed += 1;
              return [];
            }
          })
        );

        // Every lookup failed: the catalogue is unavailable, not empty. Falling
        // back to a free-text year keeps the form usable and honest.
        if (codes.length > 0 && failed === codes.length) {
          setYearsUnavailable(true);
          setYears([]);
          return;
        }

        const byYear = new Map<string, YearOption>();
        for (const { code, years: list } of results.flat()) {
          const memberName =
            version.members?.[version.codes.indexOf(code)] ?? version.fullName;
          for (const y of list) {
            // "2016 Gasolina" → 2016
            const year = Number.parseInt(y.nome, 10);
            if (!Number.isFinite(year) || byYear.has(String(year))) continue;
            byYear.set(String(year), {
              // The year's own FIPE code — not tied to a trim, so the select
              // keeps its selection when the year comes from another member.
              value: y.codigo,
              label: y.nome,
              modelCode: code,
              fullName: memberName,
            });
          }
        }

        setYears(
          [...byYear.values()].sort((a, b) =>
            b.label.localeCompare(a.label, "pt-BR")
          )
        );
      } catch {
        setYearsUnavailable(true);
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
  }, [brands, value, onChange]);

  /* Load the line list whenever the brand is known (or the retry is pressed). */
  useEffect(() => {
    if (!value.brandId) {
      setLines([]);
      setStats(null);
      return;
    }
    void loadModels(value.brandId);
  }, [value.brandId, loadModels, reloadKey]);

  /** Every simplified version of the loaded brand, flattened. */
  const allVersions = useCallback(
    () => lines.flatMap((line) => line.versions ?? []),
    [lines]
  );

  /**
   * The grouped option that contains a FIPE code.
   *
   * A code can be any of the group's trims, not only the representative: the
   * exact-version select stores the trim the person actually chose, and a
   * listing may already carry one. Matching only `code` made the version select
   * look empty in those cases.
   */
  const optionContaining = useCallback(
    (code: string | undefined) => {
      if (!code) return undefined;
      return allVersions().find(
        (v) => v.code === code || (v.codes ?? []).includes(code)
      );
    },
    [allVersions]
  );

  /*
   * Which line the user is browsing.
   *
   * It cannot live in `value`: picking a line is not a car yet, and `CarPick` is
   * the contract every caller already reads. So it is local state, seeded from
   * the selection when the selection came from a URL.
   */
  const [pickedLineKey, setPickedLineKey] = useState("");

  useEffect(() => {
    setPickedLineKey("");
  }, [value.brandId]);

  /** The line that contains the selected model, when there is one. */
  const lineKeyOfModel = (() => {
    if (!value.model) return "";
    const lower = value.model.toLowerCase();
    for (const line of lines) {
      if (
        (line.versions ?? []).some(
          (v) =>
            v.fullName.toLowerCase() === lower ||
            v.label.toLowerCase() === lower ||
            (v.members ?? []).some((m) => m.toLowerCase() === lower)
        )
      ) {
        return line.key;
      }
    }
    return "";
  })();

  const selectedLineKey = lineKeyOfModel || pickedLineKey;

  /* Resolve a name-only selection from a URL to a code. */
  const resolvingModel = useRef<string | null>(null);
  useEffect(() => {
    if (!value.model || value.modelCode || lines.length === 0) return;
    if (resolvingModel.current === value.model) return;
    const lower = value.model.toLowerCase();
    const match = allVersions().find(
      (v) =>
        v.fullName.toLowerCase() === lower ||
        v.label.toLowerCase() === lower ||
        (v.members ?? []).some((m) => m.toLowerCase() === lower)
    );
    if (!match) return;
    // Prefer the exact trim the name refers to, so reopening a listing keeps
    // *that* version instead of snapping back to the group's representative.
    const memberAt = (match.members ?? []).findIndex((m) => m.toLowerCase() === lower);
    const exactCode = memberAt >= 0 ? match.codes?.[memberAt] : undefined;
    resolvingModel.current = value.model;
    onChange({ ...value, model: value.model, modelCode: exactCode ?? match.code });
  }, [lines, value, onChange, allVersions]);

  /* Years follow the version. */
  useEffect(() => {
    if (!showYear || !value.brandId || !value.modelCode) {
      setYears([]);
      setYearsUnavailable(false);
      return;
    }
    const version = optionContaining(value.modelCode);
    // Keyed by the group: switching to another trim of the same engine does not
    // change the year list, so it must not refetch it.
    const key = `${value.brandId}:${version?.code ?? value.modelCode}`;
    if (lastYearLookup.current === key) return;
    lastYearLookup.current = key;
    if (version) void loadYears(value.brandId, version);
    else setYears([]);
  }, [showYear, value.brandId, value.modelCode, optionContaining, loadYears]);

  /* Year: same idea, resolve a year number to the FIPE code that has it. */
  const resolvingYear = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!value.year || value.yearCode || years.length === 0) return;
    if (resolvingYear.current === value.year) return;
    const match = years.find((y) => Number.parseInt(y.label, 10) === value.year);
    if (!match) return;
    resolvingYear.current = value.year;
    // Only the year code is resolved here; `modelCode` identifies the option and
    // must keep its representative value (see onYear).
    onChange({ ...value, yearCode: match.value });
  }, [years, value, onChange]);

  const onBrand = (opt: SelectOption | null) => {
    setError("");
    setYears([]);
    lastYearLookup.current = null;
    if (!opt) {
      onChange({ ...EMPTY_PICK });
      return;
    }
    // Trocar de marca invalida modelo e ano: mantê-los casaria dois carros.
    onChange({ brand: opt.label, brandId: opt.value, model: "", modelCode: "" });
  };

  const onLine = (opt: SelectOption | null) => {
    setError("");
    setYears([]);
    lastYearLookup.current = null;
    setPickedLineKey(opt?.value ?? "");
    onChange({
      ...value,
      model: "",
      modelCode: "",
      displayName: undefined,
      year: undefined,
      yearCode: undefined,
      value: undefined,
    });
  };

  const onVersion = (opt: SelectOption | null) => {
    setError("");
    setYears([]);
    lastYearLookup.current = null;
    if (!opt) {
      onChange({
        ...value,
        model: "",
        modelCode: "",
        year: undefined,
        yearCode: undefined,
        value: undefined,
      });
      return;
    }
    const version = allVersions().find((v) => v.code === opt.value);
    onChange({
      ...value,
      // Guarda o nome FIPE completo: é o que o anúncio grava e o que o matcher
      // decompõe. O rótulo bonito existe só na tela. A versão exata pode ser
      // refinada logo abaixo.
      model: version?.fullName ?? opt.label,
      modelCode: version?.code ?? opt.value,
      year: undefined,
      yearCode: undefined,
      value: undefined,
    });
  };

  /**
   * Pick the exact FIPE trim inside the grouped option.
   *
   * This is what keeps the short list safe: "Tracker 1.8 Flex · Aut." is one
   * choice, and every real FIPE version behind it ("TRACKER LT 1.8 16V Flex 4x2
   * Aut.") stays one click away. Nothing from the catalogue becomes unreachable.
   */
  const onExact = (opt: SelectOption | null) => {
    setError("");
    setYears([]);
    lastYearLookup.current = null;
    if (!opt) {
      const version = optionContaining(value.modelCode);
      onChange({
        ...value,
        // Volta ao representante — não apaga o carro.
        model: version?.fullName ?? value.model,
        modelCode: version?.code ?? value.modelCode,
        year: undefined,
        yearCode: undefined,
        value: undefined,
      });
      return;
    }
    onChange({
      ...value,
      model: opt.label,
      modelCode: opt.value,
      displayName: opt.label,
      // O ano é por versão: trocar de acabamento invalida o que estava escolhido.
      year: undefined,
      yearCode: undefined,
      value: undefined,
    });
  };

  const onYear = (opt: SelectOption | null) => {
    setError("");
    if (!opt) {
      onChange({ ...value, year: undefined, yearCode: undefined, value: undefined });
      return;
    }
    const chosen = years.find((y) => y.value === opt.value);
    const year = Number.parseInt(opt.label, 10) || undefined;
    const yearCode = opt.value;

    /*
     * The year belongs to one specific trim, so the stored code and name follow
     * it: a listing saying "2019" must carry the FIPE name that actually has
     * 2019. The version select still displays, because it matches the group by
     * membership (`optionContaining`), not by the representative code alone.
     */
    onChange({
      ...value,
      year,
      yearCode,
      model: chosen?.fullName ?? value.model,
      modelCode: chosen?.modelCode ?? value.modelCode,
    });

    const priceModelCode = chosen?.modelCode ?? value.modelCode;
    if (showValue && yearCode && priceModelCode) {
      fetch(
        `/api/fipe/price?brandId=${value.brandId}&modelId=${priceModelCode}&yearCode=${encodeURIComponent(yearCode)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.Valor)
            onChange({
              ...value,
              year,
              yearCode,
              model: chosen?.fullName ?? value.model,
              modelCode: chosen?.modelCode ?? value.modelCode,
              value: parseBRL(d.Valor),
            });
        })
        .catch(() => {});
    }
  };

  const lineOptions: SelectOption[] = lines.map((line) => ({
    value: line.key,
    label: `${line.name} (${line.versions?.length ?? 0})`,
  }));

  const lineVersions = lines.find((l) => l.key === selectedLineKey)?.versions ?? [];
  const versionOptions: SelectOption[] = lineVersions.map((v) => ({
    value: v.code,
    label: v.label,
  }));

  const selectedVersion =
    optionContaining(value.modelCode) ??
    lineVersions.find((v) => v.code === value.modelCode);

  /**
   * Every FIPE version inside the chosen option, as its own selectable row.
   * Only shown when the option really collapses more than one entry — a group
   * of one has nothing extra to offer.
   */
  const exactOptions: SelectOption[] = (selectedVersion?.members ?? []).map(
    (member, i) => ({
      value: selectedVersion?.codes?.[i] ?? selectedVersion?.code ?? "",
      label: member,
    })
  );

  const exactValue =
    selectedVersion && value.modelCode && (selectedVersion.codes ?? []).includes(value.modelCode)
      ? value.modelCode
      : (selectedVersion?.code ?? "");

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
        // Remonta ao trocar de marca: o SearchableSelect guarda o rótulo
        // escolhido internamente e mostraria o modelo da marca anterior.
        key={`line-${value.brandId || "none"}`}
        label={modelLabel}
        placeholder={value.brandId ? "Selecione o modelo" : "Escolha a marca primeiro"}
        value={selectedLineKey}
        options={lineOptions}
        loading={modelsLoading}
        onChange={onLine}
        disabled={disabled || !value.brandId}
        required
      />

      <SearchableSelect
        key={`version-${selectedLineKey || "none"}`}
        label={versionLabel}
        placeholder={
          !selectedLineKey
            ? "Escolha o modelo primeiro"
            : versionOptions.length === 1
              ? "Só há uma versão"
              : "Selecione motor e câmbio"
        }
        value={selectedVersion?.code ?? ""}
        options={versionOptions}
        loading={modelsLoading}
        onChange={onVersion}
        disabled={disabled || !selectedLineKey}
        required
      />

      {exactOptions.length > 1 && (
        <SearchableSelect
          key={`exact-${selectedVersion?.code ?? "none"}`}
          label={`Versão exata (${exactOptions.length} na FIPE)`}
          placeholder="Escolha a versão da tabela"
          value={exactValue}
          options={exactOptions}
          onChange={onExact}
          disabled={disabled || !selectedVersion}
        />
      )}

      {stats && stats.before !== stats.after && (
        <p className="text-[11px] text-ink-400">
          {stats.before} versões na Tabela FIPE agrupadas em {stats.after} opções
          reais — o acabamento (LT, LTZ, Premier) não muda o carro. As{" "}
          {stats.before} versões da tabela continuam todas disponíveis em
          “Versão exata”.
        </p>
      )}

      {showYear && yearsUnavailable && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Ano
            <span className="ml-0.5 text-gray-400">*</span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1950}
            max={new Date().getFullYear() + 1}
            value={value.year ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const year = raw ? Number.parseInt(raw, 10) : undefined;
              onChange({
                ...value,
                year: Number.isFinite(year) ? year : undefined,
                // O código FIPE do ano vem da lista; sem ela, o preço fica para
                // a pessoa preencher.
                yearCode: undefined,
                value: undefined,
              });
            }}
            disabled={disabled || !value.modelCode}
            placeholder="Ex: 2018"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
          />
          <span className="mt-1 block text-[11px] text-amber-700">
            A Tabela FIPE não respondeu agora, então a lista de anos não pôde ser
            carregada. Informe o ano do seu carro.
          </span>
        </label>
      )}

      {showYear && !yearsUnavailable && (

        <SearchableSelect
          key={`year-${value.modelCode || "none"}`}
          label="Ano"
          placeholder={value.modelCode ? "Selecione o ano" : "Escolha a versão primeiro"}
          value={
            value.modelCode && value.yearCode ? value.yearCode : ""
          }
          options={years}
          loading={yearsLoading}
          onChange={onYear}
          disabled={disabled || !value.modelCode}
        />
      )}

      {staleAt !== null && (
        <p className="text-[11px] text-amber-700">
          A Tabela FIPE está fora do ar agora — mostrando o catálogo salvo
          {staleAt ? ` em ${new Date(staleAt).toLocaleDateString("pt-BR")}` : ""}.
        </p>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[11.5px] text-red-600">{error}</p>
          <button
            type="button"
            onClick={reload}
            disabled={disabled}
            className="text-[11.5px] font-medium text-brand-600 hover:underline disabled:opacity-50"
          >
            Tentar de novo
          </button>
        </div>
      )}

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
