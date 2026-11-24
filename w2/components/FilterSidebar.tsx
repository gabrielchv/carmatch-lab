"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import LocationSelect from "@/components/LocationSelect";
import SearchableSelect, { type SelectOption } from "@/components/SearchableSelect";
import { parseFipeModels } from "@/lib/fipe-utils";

const MILEAGE_OPTIONS = [
  { value: "", label: "Km de" },
  { value: "0", label: "0" },
  { value: "5000", label: "5.000" },
  { value: "10000", label: "10.000" },
  { value: "20000", label: "20.000" },
  { value: "30000", label: "30.000" },
  { value: "40000", label: "40.000" },
  { value: "60000", label: "60.000" },
  { value: "80000", label: "80.000" },
  { value: "100000", label: "100.000" },
  { value: "120000", label: "120.000" },
  { value: "140000", label: "140.000" },
  { value: "160000", label: "160.000" },
  { value: "180000", label: "180.000" },
  { value: "200000", label: "200.000" },
  { value: "250000", label: "250.000" },
  { value: "300000", label: "300.000" },
];

const VEHICLE_TYPES = ["SUV", "Hatch", "Sedan", "Caminhonete"];

const RANGE_OPTIONS = [
  { value: "", label: "Distância" },
  { value: "0", label: "Nesta localização" },
  { value: "50", label: "Até 50 km" },
  { value: "100", label: "Até 100 km" },
  { value: "200", label: "Até 200 km" },
  { value: "500", label: "Até 500 km" },
  { value: "-1", label: "Todo o Brasil" },
];

export default function FilterSidebar({
  isOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");
  const [brand, setBrand] = useState(searchParams.get("brand") || "");
  const [model, setModel] = useState(searchParams.get("model") || "");
  const [yearMin, setYearMin] = useState(searchParams.get("yearMin") || "");
  const [yearMax, setYearMax] = useState(searchParams.get("yearMax") || "");
  const [mileageMin, setMileageMin] = useState(
    searchParams.get("mileageMin") || ""
  );
  const [mileageMax, setMileageMax] = useState(
    searchParams.get("mileageMax") || ""
  );
  const [localization, setLocalization] = useState(
    searchParams.get("localization") || ""
  );
  const [range, setRange] = useState(searchParams.get("range") || "");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get("desiredType")?.split(",").filter(Boolean) || []
  );

  // FIPE brand options
  const [brandOptions, setBrandOptions] = useState<SelectOption[]>([]);
  const [brandOptionsLoading, setBrandOptionsLoading] = useState(true);
  const [selectedBrandId, setSelectedBrandId] = useState("");

  // FIPE model general-model options
  const [generalModelOptions, setGeneralModelOptions] = useState<SelectOption[]>([]);
  const [generalModelsLoading, setGeneralModelsLoading] = useState(false);

  // Lock body scroll when mobile overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Load brands from FIPE API on mount
  useEffect(() => {
    fetch("/api/fipe/brands")
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar marcas");
        return r.json();
      })
      .then((data: { codigo: string; nome: string }[]) => {
        const options = data.map((b) => ({ value: b.codigo, label: b.nome }));
        setBrandOptions(options);

        // Se a URL já tem uma marca selecionada, encontrar o código FIPE
        const urlBrand = searchParams.get("brand");
        if (urlBrand) {
          const match = options.find(
            (o) => o.label.toLowerCase() === urlBrand.toLowerCase()
          );
          if (match) {
            setSelectedBrandId(match.value);
            setBrand(match.label);
          }
        }
      })
      .catch(() => {})
      .finally(() => setBrandOptionsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load general models from FIPE when brand changes
  useEffect(() => {
    if (!selectedBrandId) {
      setGeneralModelOptions([]);
      return;
    }

    setGeneralModelsLoading(true);
    setGeneralModelOptions([]);

    fetch(`/api/fipe/models?brandId=${selectedBrandId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar modelos");
        return r.json();
      })
      .then((data) => {
        const parsed = parseFipeModels(data);
        const options = parsed.generalModels.map((gm) => ({
          value: gm,
          label: gm,
        }));
        setGeneralModelOptions(options);

        // Se a URL já tem um modelo selecionado, verificar se é válido
        const urlModel = searchParams.get("model");
        if (
          urlModel &&
          options.some((o) => o.value.toLowerCase() === urlModel.toLowerCase())
        ) {
          setModel(urlModel);
        }
      })
      .catch(() => {
        setGeneralModelOptions([]);
      })
      .finally(() => setGeneralModelsLoading(false));
  }, [selectedBrandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeToggle = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();

    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (brand) params.set("brand", brand);
    if (model) params.set("model", model);
    if (yearMin) params.set("yearMin", yearMin);
    if (yearMax) params.set("yearMax", yearMax);
    if (mileageMin) params.set("mileageMin", mileageMin);
    if (mileageMax) params.set("mileageMax", mileageMax);
    if (localization.trim()) params.set("localization", localization.trim());
    if (range && range !== "-1") params.set("range", range);
    if (selectedTypes.length > 0)
      params.set("desiredType", selectedTypes.join(","));

    // Preserve search and sort from URL
    const q = searchParams.get("q");
    const sortBy = searchParams.get("sortBy");
    const sortOrder = searchParams.get("sortOrder");
    if (q) params.set("q", q);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
    onClose?.();
  };

  const clearFilters = () => {
    setMinPrice("");
    setMaxPrice("");
    setBrand("");
    setModel("");
    setSelectedBrandId("");
    setGeneralModelOptions([]);
    setYearMin("");
    setYearMax("");
    setMileageMin("");
    setMileageMax("");
    setLocalization("");
    setRange("");
    setSelectedTypes([]);
    router.push("/");
    onClose?.();
  };

  const hasFilters =
    minPrice ||
    maxPrice ||
    brand ||
    model ||
    yearMin ||
    yearMax ||
    mileageMin ||
    mileageMax ||
    localization ||
    range ||
    selectedTypes.length > 0;

  const sidebarContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Price */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          Preço
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="Min."
          />
          <span className="text-gray-400 text-xs shrink-0">—</span>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="Max."
          />
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Brand */}
      <div>
        <SearchableSelect
          label="Marca"
          placeholder="Todas as marcas"
          value={selectedBrandId}
          options={brandOptions}
          loading={brandOptionsLoading}
          onChange={(opt) => {
            if (opt) {
              setSelectedBrandId(opt.value);
              setBrand(opt.label);
              setModel("");
              setGeneralModelOptions([]);
            } else {
              setSelectedBrandId("");
              setBrand("");
              setModel("");
              setGeneralModelOptions([]);
            }
          }}
          disabled={false}
        />
      </div>

      {/* Model */}
      <div>
        <SearchableSelect
          label="Modelo"
          placeholder={selectedBrandId ? "Todos os modelos" : "Selecione uma marca"}
          value={model}
          options={generalModelOptions}
          loading={generalModelsLoading}
          onChange={(opt) => {
            setModel(opt?.value || "");
          }}
          disabled={!selectedBrandId}
        />
      </div>

      <hr className="border-gray-200" />

      {/* Year range */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          Ano
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="De"
          />
          <span className="text-gray-400 text-xs shrink-0">—</span>
          <input
            type="number"
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="Até"
          />
        </div>
      </div>

      {/* Mileage */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          Quilometragem
        </label>
        <div className="flex gap-2 items-center">
          <select
            value={mileageMin}
            onChange={(e) => setMileageMin(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-white"
          >
            {MILEAGE_OPTIONS.map((opt, i) => (
              <option key={i} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={mileageMax}
            onChange={(e) => setMileageMax(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="">Km até</option>
            {MILEAGE_OPTIONS.filter((o) => o.value).map((opt, i) => (
              <option key={i} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Location */}
      <div>
        <LocationSelect
          label="Localização"
          value={localization}
          onChange={(val) => {
            setLocalization(val);
            if (!val.trim()) setRange("");
          }}
        />
      </div>

      {/* Range — only visible when a location is selected */}
      {localization.trim() && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            Raio de busca
          </label>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
          >
            {RANGE_OPTIONS.map((opt, i) => (
              <option key={i} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Desired vehicle type */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          Tipo desejado
        </label>
        <div className="flex flex-wrap gap-2">
          {VEHICLE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeToggle(type)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedTypes.includes(type)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
        >
          Aplicar
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 rounded text-sm text-gray-500 hover:text-gray-700 border border-gray-300 hover:border-gray-400 transition-colors cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>
    </form>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <div className="sticky top-20">
          <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">
            Filtros
          </h3>
          {sidebarContent}
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white overflow-y-auto p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                Filtros
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
