"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SearchableSelect, { type SelectOption } from "@/components/SearchableSelect";
import LocationSelect from "@/components/LocationSelect";
import { parseFipeModels, type VersionOption } from "@/lib/fipe-utils";
import type { CarPost } from "@/lib/types";

interface VehicleRow {
  id: number;
  brandId: string;
  brandLabel: string;
  // Modelo geral (primeira palavra FIPE, ex: "Fit")
  generalModel: string;
  // Código FIPE da versão selecionada (usado como valor único no Select)
  versionCode: string;
  // Versão específica (ex: "CX 1.4 Flex 16V 5p")
  version: string;
  versionLabel: string;
  // Transmissão
  transmission: string;
  yearMin: string;
  yearMax: string;
  mileageMin: string;
  mileageMax: string;
  cashAdj: string;
  tolerance: string;
  // Vehicle type mode (SUV, Caminhonete, Hatch, Sedan)
  isTypeMode: boolean;
  vehicleType: string;
}

const VEHICLE_TYPES = [
  { value: "SUV", label: "SUV" },
  { value: "Caminhonete", label: "Caminhonete" },
  { value: "Hatch", label: "Hatch" },
  { value: "Sedan", label: "Sedan" },
] as const;

const CAR_COLORS = [
  { value: "Branco", label: "Branco" },
  { value: "Preto", label: "Preto" },
  { value: "Prata", label: "Prata" },
  { value: "Cinza", label: "Cinza" },
  { value: "Azul", label: "Azul" },
  { value: "Vermelho", label: "Vermelho" },
  { value: "Verde", label: "Verde" },
  { value: "Marrom", label: "Marrom" },
  { value: "Bege", label: "Bege" },
  { value: "Bordeaux", label: "Bordeaux" },
  { value: "Laranja", label: "Laranja" },
  { value: "Amarelo", label: "Amarelo" },
  { value: "Dourado", label: "Dourado" },
  { value: "Rosa", label: "Rosa" },
  { value: "Roxo", label: "Roxo" },
] as const;

let rowId = 0;

function freshRow(): VehicleRow {
  return {
    id: ++rowId,
    brandId: "",
    brandLabel: "",
    generalModel: "",
    versionCode: "",
    version: "",
    versionLabel: "",
    transmission: "",
    yearMin: "",
    yearMax: "",
    mileageMin: "",
    mileageMax: "",
    cashAdj: "0",
    tolerance: "0",
    isTypeMode: false,
    vehicleType: "",
  };
}

// Cache de dados FIPE parseados por brandId
const fipeParsedCache = new Map<string, ReturnType<typeof parseFipeModels>>();

// Cache de anos FIPE por brandId|versionCode (ex: "26|7128" → ["2008","2009",...])
const yearByVersionCache = new Map<string, string[]>();

export default function PostForm({
  initialData,
  postId,
}: {
  initialData?: CarPost;
  postId?: string;
}) {
  const router = useRouter();
  const isEdit = !!postId && !!initialData;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ───── FIPE brands (global) ─────
  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  // ───── Modo edição ─────
  const [existingImages, setExistingImages] = useState<string[]>(initialData?.images || []);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [imagesChosen, setImagesChosen] = useState(0);
  const [editInitDone, setEditInitDone] = useState(false);

  // ───── Meu Carro ─────
  const [myBrandId, setMyBrandId] = useState("");
  const [myBrandLabel, setMyBrandLabel] = useState("");
  const [myGeneralModel, setMyGeneralModel] = useState("");            // ex: "Fit"
  const [myVersion, setMyVersion] = useState("");                       // ex: "CX 1.4 Flex 16V 5p"
  const [myVersionFullName, setMyVersionFullName] = useState("");       // nome FIPE completo p/ submit
  const [myVersionModelCode, setMyVersionModelCode] = useState("");     // código FIPE p/ ano/preço
  const [myYearCode, setMyYearCode] = useState("");
  const [myYearNumber, setMyYearNumber] = useState("");

  // Dados FIPE parseados para "Meu Carro"
  const [myParsed, setMyParsed] = useState<{
    generalModels: string[];
    versionsByGeneralModel: Record<string, VersionOption[]>;
  } | null>(null);
  const [myParsedLoading, setMyParsedLoading] = useState(false);
  const [myYears, setMyYears] = useState<SelectOption[]>([]);
  const [myYearsLoading, setMyYearsLoading] = useState(false);

  const [myEstimatedValue, setMyEstimatedValue] = useState("");
  const [myEstimatedValueEdited, setMyEstimatedValueEdited] = useState(false);

  // ───── Informações adicionais do carro ─────
  const [mileage, setMileage] = useState("");
  const [color, setColor] = useState("");
  const [localization, setLocalization] = useState("");

  // ───── Geral: distância máxima ─────
  const [maxDistance, setMaxDistance] = useState("");

  // ───── Veículos desejados ─────
  const [rows, setRows] = useState<VehicleRow[]>([freshRow()]);

  // Dados FIPE parseados por rowId: { generalModels, versionsByGeneralModel }
  const [rowParsed, setRowParsed] = useState<
    Record<number, { generalModels: string[]; versionsByGeneralModel: Record<string, VersionOption[]> }>
  >({});
  const [rowParsedLoading, setRowParsedLoading] = useState<Record<number, boolean>>({});
  const loadingRef = useRef<Record<number, boolean>>({});

  // Anos FIPE disponíveis por rowId (ex: { 1: ["2008","2009","2010"] })
  const [rowYears, setRowYears] = useState<Record<number, string[]>>({});
  const [rowYearsLoading, setRowYearsLoading] = useState<Record<number, boolean>>({});

  // ================================================================
  // BRANDS
  // ================================================================
  useEffect(() => {
    fetch("/api/fipe/brands")
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar marcas");
        return r.json();
      })
      .then((data: { codigo: string; nome: string }[]) => {
        setBrands(data.map((b) => ({ value: b.codigo, label: b.nome })));
      })
      .catch(() => setError("Erro ao carregar marcas da Tabela FIPE"))
      .finally(() => setBrandsLoading(false));
  }, []);

  // ================================================================
  // INIT – quando em modo edição, pré-preenche o formulário
  // ================================================================
  const initEditFormCalled = useRef(false);

  useEffect(() => {
    if (!isEdit || initEditFormCalled.current || brandsLoading || !brands.length) return;
    (async () => {
      initEditFormCalled.current = true;
      try {
        const data = initialData!;

        // ── Título e descrição ──
        const titleInput = document.querySelector<HTMLInputElement>("input[name=title]");
        if (titleInput) titleInput.value = data.title;
        const descInput = document.querySelector<HTMLTextAreaElement>("textarea[name=description]");
        if (descInput) descInput.value = data.description;
        const whatsappInput = document.querySelector<HTMLInputElement>("input[name=whatsapp]");
        if (whatsappInput) whatsappInput.value = data.contactInfo.whatsapp || "";
        const emailInput = document.querySelector<HTMLInputElement>("input[name=email]");
        if (emailInput) emailInput.value = data.contactInfo.email || "";

        // ── Meu Carro: marca ──
        const brandId = data.car.fipeBrandId || brands.find(b => b.label === data.car.brand)?.value || "";
        if (!brandId) {
          setError(`Marca "${data.car.brand}" não encontrada na Tabela FIPE`);
          return;
        }
        setMyBrandId(brandId);
        setMyBrandLabel(data.car.brand);

        // Aguarda modelos carregarem
        const modelsRes = await fetch(`/api/fipe/models?brandId=${brandId}`);
        const modelsData = await modelsRes.json();
        const parsed = parseFipeModels(modelsData);
        fipeParsedCache.set(brandId, parsed);
        setMyParsed(parsed);

        // Encontra a versão correta
        let matchedVersion: VersionOption | undefined;
        if (data.car.fipeModelCode) {
          for (const versions of Object.values(parsed.versionsByGeneralModel)) {
            matchedVersion = versions.find(v => v.modelCode === data.car.fipeModelCode);
            if (matchedVersion) break;
          }
        }
        if (!matchedVersion) {
          for (const versions of Object.values(parsed.versionsByGeneralModel)) {
            matchedVersion = versions.find(v => v.fullName === data.car.model);
            if (matchedVersion) break;
          }
        }
        if (!matchedVersion) {
          // Fallback: pega a primeira versão do modelo geral (primeira palavra)
          const firstWord = data.car.model.split(" ")[0];
          const versions = parsed.versionsByGeneralModel[firstWord];
          if (versions?.length) matchedVersion = versions[0];
        }

        if (matchedVersion) {
          // Descobre o generalModel
          let generalModel = "";
          for (const [gm, versions] of Object.entries(parsed.versionsByGeneralModel)) {
            if (versions.some(v => v.modelCode === matchedVersion!.modelCode)) {
              generalModel = gm;
              break;
            }
          }
          setMyGeneralModel(generalModel);
          setMyVersion(matchedVersion.version);
          setMyVersionFullName(matchedVersion.fullName);
          setMyVersionModelCode(matchedVersion.modelCode);

          // Busca anos
          const yearsRes = await fetch(`/api/fipe/years?brandId=${brandId}&modelId=${matchedVersion.modelCode}`);
          if (yearsRes.ok) {
            const yearsData: { codigo: string; nome: string }[] = await yearsRes.json();
            const yearOpts = yearsData.map(y => ({ value: y.codigo, label: y.nome }));
            setMyYears(yearOpts);

            const yearCode = data.car.fipeYearCode || "";
            const matchedYear = yearCode
              ? yearOpts.find(y => y.value === yearCode)
              : yearOpts.find(y => y.label === String(data.car.year));

            if (matchedYear) {
              setMyYearCode(matchedYear.value);
              setMyYearNumber(String(data.car.year));

              // Busca preço FIPE
              const priceRes = await fetch(`/api/fipe/price?brandId=${brandId}&modelId=${matchedVersion.modelCode}&yearCode=${matchedYear.value}`);
              if (priceRes.ok) {
                const priceData = await priceRes.json();
                const cleaned = priceData.Valor.replace(/[R$\s.]/g, "").replace(",", ".");
                const price = parseFloat(cleaned);
                if (!isNaN(price)) {
                  setMyEstimatedValue(String(Math.round(price)));
                }
              }
            }
          }
        }

        // Força o valor estimado do anúncio (sobrescreve o preço FIPE)
        setMyEstimatedValue(String(data.car.estimatedValue));
        setMyEstimatedValueEdited(true);

        // ── Informações adicionais do carro ──
        setMileage(String(data.car.mileage ?? ""));
        setColor(data.car.color ?? "");
        setLocalization(data.car.localization ?? "");
        setMaxDistance(String(data.desiredTrade.maxDistance ?? ""));

        // ── Veículos desejados ──
        if (data.desiredTrade.vehicles.length > 0) {
          const initializedRows: VehicleRow[] = await Promise.all(
            data.desiredTrade.vehicles.map(async (v, idx) => {
              const r: VehicleRow = {
                id: ++rowId,
                brandId: v.fipeBrandId || brands.find(b => b.label === v.brand)?.value || "",
                brandLabel: v.brand,
                generalModel: v.model || "",
                versionCode: v.fipeVersionCode || "",
                version: v.version || "",
                versionLabel: "",
                transmission: v.transmission || "",
                yearMin: v.yearMin !== undefined ? String(v.yearMin) : "",
                yearMax: v.yearMax !== undefined ? String(v.yearMax) : "",
                mileageMin: v.mileageMin !== undefined ? String(v.mileageMin) : "",
                mileageMax: v.mileageMax !== undefined ? String(v.mileageMax) : "",
                cashAdj: String(v.cashAdjustment),
                tolerance: String(v.cashAdjustmentTolerance),
                isTypeMode: !!v.vehicleType,
                vehicleType: v.vehicleType || "",
              };

              if (v.vehicleType) {
                // Vehicle type rows skip FIPE cascade loading
                return r;
              }

              if (idx === 0) {
                // Para a primeira row, busca a marca e modelo
                const rbId = v.fipeBrandId || brands.find(b => b.label === v.brand)?.value || "";
                if (rbId) {
                  r.brandId = rbId;
                  // Carrega modelos para essa marca
                  try {
                    const cached = fipeParsedCache.get(rbId);
                    if (!cached) {
                      const res = await fetch(`/api/fipe/models?brandId=${rbId}`);
                      const d: { codigo: number; nome: string }[] = await res.json();
                      const p = parseFipeModels(d);
                      fipeParsedCache.set(rbId, p);
                      setRowParsed(prev => ({ ...prev, [r.id]: p }));
                    } else {
                      setRowParsed(prev => ({ ...prev, [r.id]: cached }));
                    }
                  } catch {}
                }
              }
              return r;
            })
          );
          setRows(initializedRows);
          // Busca anos FIPE para versões já selecionadas (edição)
          for (const r of initializedRows) {
            if (r.brandId && r.versionCode) {
              fetchRowYears(r.id, r.brandId, r.versionCode);
            }
          }
        }

        setEditInitDone(true);
      } catch (err) {
        console.error("Erro ao inicializar edição:", err);
      }
    })();
  }, [isEdit, brands, brandsLoading, initialData]);

  // ================================================================
  // MEU CARRO – cascata (marca → modelo geral → versão → ano → preço)
  // ================================================================

  // 1. Quando marca muda → busca e parseia modelos FIPE
  useEffect(() => {
    setError("");
    if (!myBrandId) {
      setMyParsed(null);
      setMyGeneralModel("");
      setMyVersion("");
      setMyVersionFullName("");
      setMyVersionModelCode("");
      setMyYears([]);
      setMyYearCode("");
      setMyYearNumber("");
      if (!myEstimatedValueEdited) setMyEstimatedValue("");
      return;
    }
    setMyParsedLoading(true);
    setMyGeneralModel("");
    setMyVersion("");
    setMyVersionFullName("");
    setMyVersionModelCode("");
    setMyYears([]);
    setMyYearCode("");
    setMyYearNumber("");
    if (!myEstimatedValueEdited) setMyEstimatedValue("");

    const cached = fipeParsedCache.get(myBrandId);
    if (cached) {
      setMyParsed(cached);
      setMyParsedLoading(false);
      return;
    }

    fetch(`/api/fipe/models?brandId=${myBrandId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar modelos");
        return r.json();
      })
      .then((data: { codigo: number; nome: string }[]) => {
        const parsed = parseFipeModels(data);
        fipeParsedCache.set(myBrandId, parsed);
        setMyParsed(parsed);
      })
      .catch(() => setError("Erro ao carregar modelos da Tabela FIPE"))
      .finally(() => setMyParsedLoading(false));
  }, [myBrandId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Quando versão selecionada → busca anos usando modelCode
  useEffect(() => {
    setError("");
    if (!myBrandId || !myVersionModelCode) {
      setMyYears([]);
      setMyYearCode("");
      setMyYearNumber("");
      if (!myEstimatedValueEdited) setMyEstimatedValue("");
      return;
    }
    setMyYearsLoading(true);
    setMyYearCode("");
    setMyYearNumber("");
    if (!myEstimatedValueEdited) setMyEstimatedValue("");

    fetch(`/api/fipe/years?brandId=${myBrandId}&modelId=${myVersionModelCode}`)
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar anos");
        return r.json();
      })
      .then((data: { codigo: string; nome: string }[]) => {
        setMyYears(data.map((y) => ({ value: y.codigo, label: y.nome })));
      })
      .catch(() => setError("Erro ao carregar anos da Tabela FIPE"))
      .finally(() => setMyYearsLoading(false));
  }, [myBrandId, myVersionModelCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Quando ano selecionado → busca preço FIPE
  useEffect(() => {
    setError("");
    if (!myBrandId || !myVersionModelCode || !myYearCode) return;
    fetch(
      `/api/fipe/price?brandId=${myBrandId}&modelId=${myVersionModelCode}&yearCode=${myYearCode}`
    )
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar preço");
        return r.json();
      })
      .then((data: { Valor: string; AnoModelo: number }) => {
        const cleaned = data.Valor.replace(/[R$\s.]/g, "").replace(",", ".");
        const price = parseFloat(cleaned);
        if (!isNaN(price) && !myEstimatedValueEdited) {
          setMyEstimatedValue(String(Math.round(price)));
        }
        setMyYearNumber(String(data.AnoModelo));
      })
      .catch(() => setError("Erro ao buscar preço na Tabela FIPE"));
  }, [myBrandId, myVersionModelCode, myYearCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ================================================================
  // VEÍCULOS DESEJADOS – cascata com modelo geral + versão + transmissão
  // ================================================================

  // Busca dados FIPE e parseia para uma row
  const fetchAndParseForRow = useCallback(async (rowId: number, brandId: string) => {
    // Evita fetch duplicado
    if (loadingRef.current[rowId]) return;
    loadingRef.current[rowId] = true;
    setRowParsedLoading((prev) => ({ ...prev, [rowId]: true }));

    try {
      const cached = fipeParsedCache.get(brandId);
      if (cached) {
        setRowParsed((prev) => ({ ...prev, [rowId]: cached }));
        return;
      }

      const res = await fetch(`/api/fipe/models?brandId=${brandId}`);
      const data: { codigo: number; nome: string }[] = await res.json();
      const parsed = parseFipeModels(data);
      fipeParsedCache.set(brandId, parsed);
      setRowParsed((prev) => ({ ...prev, [rowId]: parsed }));
    } finally {
      loadingRef.current[rowId] = false;
      setRowParsedLoading((prev) => ({ ...prev, [rowId]: false }));
    }
  }, []);

  // Busca anos FIPE disponíveis para uma versão específica e armazena no state
  const fetchRowYears = useCallback(async (rowId: number, brandId: string, versionCode: string) => {
    const cacheKey = `${brandId}|${versionCode}`;
    if (yearByVersionCache.has(cacheKey)) {
      setRowYears((prev) => ({ ...prev, [rowId]: yearByVersionCache.get(cacheKey)! }));
      return;
    }
    setRowYearsLoading((prev) => ({ ...prev, [rowId]: true }));
    try {
      const res = await fetch(`/api/fipe/years?brandId=${brandId}&modelId=${versionCode}`);
      if (!res.ok) return;
      const data: { nome: string }[] = await res.json();
      // Extrai apenas o ano numérico (primeiros 4 caracteres do nome)
      const years = [...new Set(data.map((y) => y.nome.trim().substring(0, 4)))].sort();
      yearByVersionCache.set(cacheKey, years);
      setRowYears((prev) => ({ ...prev, [rowId]: years }));
    } catch {
      // silencia erro na busca de anos
    } finally {
      setRowYearsLoading((prev) => ({ ...prev, [rowId]: false }));
    }
  }, []);

  const handleRowBrandChange = useCallback(
    (rowId: number, opt: SelectOption | null) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                brandId: opt?.value || "",
                brandLabel: opt?.label || "",
                generalModel: "",
                versionCode: "",
                version: "",
                versionLabel: "",
                transmission: "",
              }
            : r
        )
      );
      // Limpa dados parseados da row
      setRowParsed((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      if (opt) {
        fetchAndParseForRow(rowId, opt.value);
      }
    },
    [fetchAndParseForRow]
  );

  const handleRowGeneralModelChange = useCallback(
    (rowId: number, opt: SelectOption | null) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, generalModel: opt?.label || "", versionCode: "", version: "", versionLabel: "", transmission: "" }
            : r
        )
      );
    },
    []
  );

  const handleRowVersionChange = useCallback(
    (rowId: number, opt: SelectOption | null) => {
      // opt.value = FIPE modelCode (único), opt.label = version + trans display
      const row = rows.find(r => r.id === rowId);
      const parsed = rowParsed[rowId];
      const versions = parsed?.versionsByGeneralModel[row?.generalModel || ""] || [];
      const matched = versions.find((v) => v.modelCode === opt?.value);

      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          return {
            ...r,
            versionCode: matched?.modelCode || "",
            version: matched?.version || "",
            versionLabel: opt?.label || "",
            transmission: matched?.transmission || "",
          };
        })
      );

      // Busca anos FIPE disponíveis para a versão selecionada
      if (opt && row?.brandId && matched?.modelCode) {
        fetchRowYears(rowId, row.brandId, matched.modelCode);
      } else {
        setRowYears((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
      }
    },
    [rowParsed, rows, fetchRowYears]
  );

  const updateRowField = useCallback(
    (id: number, field: keyof VehicleRow, val: string) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
    },
    []
  );

  const addRow = () => setRows((prev) => [...prev, freshRow()]);
  const removeRow = (id: number) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // ================================================================
  // SUBMIT
  // ================================================================
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);

      // Meu Carro
      formData.set("brand", myBrandLabel);
      formData.set("model", myVersionFullName);
      formData.set("year", myYearNumber);
      formData.set("estimatedValue", myEstimatedValue);
      formData.set("fipeBrandId", myBrandId);
      formData.set("fipeModelCode", myVersionModelCode);
      formData.set("fipeYearCode", myYearCode);

      // Informações adicionais do carro
      formData.set("mileage", mileage);
      formData.set("color", color);
      formData.set("localization", localization);

      // Distância máxima geral
      formData.set("maxDistance", maxDistance);

      // Veículos desejados – limpa e recria
      for (const key of [
        "vBrand", "vModel", "vVersion", "vTransmission",
        "vYearMin", "vYearMax", "vCashAdj", "vTolerance",
        "vFipeBrandId", "vFipeVersionCode", "vVehicleType",
        "vMileageMin", "vMileageMax",
      ]) {
        formData.delete(key);
      }
      for (const r of rows) {
        if (r.isTypeMode) {
          if (!r.vehicleType.trim()) continue;
          formData.append("vVehicleType", r.vehicleType.trim());
          formData.append("vBrand", "");
          formData.append("vModel", "");
          formData.append("vVersion", "");
          formData.append("vTransmission", "");
          formData.append("vFipeBrandId", "");
          formData.append("vFipeVersionCode", "");
        } else {
          if (!r.brandLabel.trim()) continue;
          formData.append("vVehicleType", "");
          formData.append("vBrand", r.brandLabel.trim());
          formData.append("vModel", r.generalModel.trim());
          formData.append("vVersion", r.version);
          formData.append("vTransmission", r.transmission);
          formData.append("vFipeBrandId", r.brandId);
          formData.append("vFipeVersionCode", r.versionCode);
        }
        formData.append("vYearMin", r.yearMin);
        formData.append("vYearMax", r.yearMax);
        formData.append("vMileageMin", r.mileageMin);
        formData.append("vMileageMax", r.mileageMax);
        formData.append("vCashAdj", r.cashAdj);
        formData.append("vTolerance", r.tolerance);
      }

      // Imagens no modo edição
      if (isEdit) {
        const keep = existingImages.filter(img => !removedImages.includes(img));
        formData.set("keepImages", JSON.stringify(keep));
      }

      const url = isEdit ? `/api/posts/${postId}` : "/api/posts";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, body: formData });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || (isEdit ? "Erro ao salvar alterações" : "Erro ao criar anúncio"));
        return;
      }
      setSuccess(isEdit ? "Anúncio atualizado com sucesso!" : "Anúncio publicado com sucesso!");
      setTimeout(() => {
        router.push("/my-posts");
        router.refresh();
      }, 800);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const isSubmitReady =
    myBrandLabel && myGeneralModel && myVersion && myYearNumber && myEstimatedValue;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ─── Título ─── */}
      <fieldset className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 space-y-3 sm:p-5">
        <legend className="px-1 text-[13px] font-semibold text-ink-900">Título do Anúncio</legend>
        <input
          name="title"
          required
          className="input-field"
          placeholder="Ex: Honda Fit 2008 - Excelente estado"
        />
        <textarea
          name="description"
          rows={3}
          className="input-field resize-none"
          placeholder="Descreva o estado do carro, opcionais, motivo da troca, etc. (opcional)"
        />
      </fieldset>

      {/* ─── Meu Carro ─── */}
      <fieldset className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 space-y-3 sm:p-5">
        <legend className="px-1 text-[13px] font-semibold text-ink-900">Meu Carro</legend>
        <p className="text-xs text-gray-500">
          Selecione os dados conforme a Tabela FIPE. O valor estimado é preenchido automaticamente.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 sm:col-span-1">
            <SearchableSelect
              label="Marca"
              placeholder="Selecione a marca..."
              value={myBrandId}
              options={brands}
              loading={brandsLoading}
              onChange={(opt) => {
                setMyBrandId(opt?.value || "");
                setMyBrandLabel(opt?.label || "");
              }}
              required
            />
          </div>
          <div className="col-span-3 sm:col-span-1">
            <SearchableSelect
              label="Modelo"
              key={`my-model-${myBrandId || "none"}`}
              placeholder={
                !myBrandId
                  ? "Selecione a marca primeiro"
                  : "Selecione..."
              }
              value={myGeneralModel}
              options={myParsed?.generalModels.map((gm) => ({ value: gm, label: gm })) || []}
              loading={myParsedLoading}
              onChange={(opt) => {
                setMyGeneralModel(opt?.label || "");
                setMyVersion("");
                setMyVersionFullName("");
                setMyVersionModelCode("");
                setMyYears([]);
                setMyYearCode("");
                setMyYearNumber("");
                if (!myEstimatedValueEdited) setMyEstimatedValue("");
              }}
              required
              disabled={!myBrandId}
            />
          </div>
          <div className="col-span-3 sm:col-span-1">
            <SearchableSelect
              label="Versão"
              key={`my-version-${myGeneralModel || "none"}`}
              placeholder={
                !myGeneralModel
                  ? "Modelo primeiro"
                  : "Selecione a versão..."
              }
              value={myVersionModelCode}
              options={(myParsed?.versionsByGeneralModel[myGeneralModel] || []).map((v) => ({
                value: v.modelCode,
                label: v.transmission
                  ? `${v.version} · ${v.transmission}`
                  : v.version,
              }))}
              loading={false}
              onChange={(opt) => {
                const parsed = myParsed;
                const versions = parsed?.versionsByGeneralModel[myGeneralModel] || [];
                const matched = versions.find((vv) => vv.modelCode === opt?.value);
                setMyVersion(matched?.version || "");
                setMyVersionFullName(matched?.fullName || "");
                setMyVersionModelCode(matched?.modelCode || "");
                setMyEstimatedValueEdited(false);
              }}
              required
              disabled={!myGeneralModel}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <SearchableSelect
              label="Ano"
              key={`my-year-${myVersionModelCode || "none"}`}
              placeholder={
                !myVersionModelCode
                  ? "Selecione a versão primeiro"
                  : "Selecione o ano..."
              }
              value={myYearCode}
              options={myYears}
              loading={myYearsLoading}
              onChange={(opt) => {
                setMyYearCode(opt?.value || "");
                setMyEstimatedValueEdited(false);
              }}
              required
              disabled={!myVersionModelCode}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Valor estimado (R$) *
            </label>
            <input
              name="estimatedValue"
              type="number"
              required
              value={myEstimatedValue}
              onChange={(e) => {
                setMyEstimatedValue(e.target.value);
                setMyEstimatedValueEdited(true);
              }}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500
                ${myYearCode && !myEstimatedValueEdited ? "border-green-300 bg-green-50" : "border-gray-300"}`}
              placeholder="Preenchido via FIPE"
            />
            {myYearCode && !myEstimatedValueEdited && (
              <p className="text-[10px] text-green-600 mt-0.5">
                ✓ Preço FIPE preenchido automaticamente
              </p>
            )}
            {myEstimatedValueEdited && myYearCode && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                Valor editado manualmente
              </p>
            )}
          </div>
        </div>

        <input type="hidden" name="brand" value={myBrandLabel} />
        <input type="hidden" name="model" value={myVersionFullName} />
        <input type="hidden" name="year" value={myYearNumber} />

        {/* Quilometragem + Cor + Localização */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-sm font-medium mb-1">Quilometragem (km)</label>
            <input
              type="number"
              min="0"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className="input-field"
              placeholder="Ex: 50000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cor</label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="input-field"
            >
              <option value="">Selecione a cor...</option>
              {CAR_COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <LocationSelect
              label="Localização"
              value={localization}
              onChange={(val) => setLocalization(val)}
            />
          </div>
        </div>
      </fieldset>

      {/* ─── O que eu quero na troca ─── */}
      <fieldset className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 space-y-3 sm:p-5">
        <legend className="px-1 text-[13px] font-semibold text-ink-900">O que eu quero na troca</legend>

        <p className="text-xs text-gray-500">
          Adicione os carros que você aceitaria na troca, ou selecione um tipo de veículo (SUV, hatch, etc.) para ser mais flexível.
          Cada linha pode ter seu próprio ajuste de grana, ano e tolerância.
        </p>

        {/* Distância máxima geral */}
        <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
          <label className="block text-sm font-medium mb-1">
            Distância máxima para troca (km) <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="number"
            min="0"
            value={maxDistance}
            onChange={(e) => setMaxDistance(e.target.value)}
            className="input-field max-w-xs"
            placeholder="Ex: 100"
          />
          <p className="text-xs text-gray-400 mt-1">
            Se preenchido, só mostra matches dentro desta distância da sua localização
          </p>
        </div>

        {rows.map((r, idx) => {
          const parsed = rowParsed[r.id];
          const generalModels: SelectOption[] = (parsed?.generalModels || []).map((gm) => ({
            value: gm,
            label: gm,
          }));
          const versions: SelectOption[] = (
            parsed?.versionsByGeneralModel[r.generalModel] || []
          ).map((v) => ({
            value: v.modelCode,
            label: v.transmission
              ? `${v.version} · ${v.transmission}`
              : v.version,
          }));

          return (
            <div key={r.id} className="border border-gray-100 rounded p-3 space-y-2 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Veículo {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  disabled={rows.length <= 1}
                  className="text-red-400 hover:text-red-600 disabled:opacity-30 text-sm px-1"
                >
                  ✕ remover
                </button>
              </div>

              {/* Mode toggle: specific vehicle vs vehicle type */}
              <div className="flex items-center gap-3 mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setRows(prev => prev.map(r2 =>
                      r2.id === r.id
                        ? { ...r2, isTypeMode: false, vehicleType: "", brandId: "", brandLabel: "", generalModel: "", versionCode: "", version: "", versionLabel: "", transmission: "" }
                        : r2
                    ));
                    setRowParsed(prev => { const n = { ...prev }; delete n[r.id]; return n; });
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                    !r.isTypeMode
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Veículo específico
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRows(prev => prev.map(r2 =>
                      r2.id === r.id
                        ? { ...r2, isTypeMode: true, vehicleType: "", brandId: "", brandLabel: "", generalModel: "", versionCode: "", version: "", versionLabel: "", transmission: "" }
                        : r2
                    ));
                    setRowParsed(prev => { const n = { ...prev }; delete n[r.id]; return n; });
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                    r.isTypeMode
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Tipo de veículo
                </button>
              </div>

              {r.isTypeMode ? (
                /* Vehicle type mode: simple dropdown */
                <div className="grid grid-cols-1 gap-2">
                  <SearchableSelect
                    label="Tipo de veículo"
                    placeholder="Selecione o tipo..."
                    value={r.vehicleType}
                    options={[...VEHICLE_TYPES]}
                    loading={false}
                    onChange={(opt) => {
                      setRows(prev => prev.map(r2 =>
                        r2.id === r.id ? { ...r2, vehicleType: opt?.value || "" } : r2
                      ));
                    }}
                    required
                  />
                </div>
              ) : (
                /* Specific vehicle mode: brand + model + version */
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <SearchableSelect
                      label="Marca"
                      placeholder="Selecione..."
                      value={r.brandId}
                      options={brands}
                      loading={brandsLoading}
                      onChange={(opt) => handleRowBrandChange(r.id, opt)}
                      required
                    />
                  </div>
                  <div>
                    <SearchableSelect
                      label="Modelo"
                      key={`row-modelo-${r.id}-${r.brandId || "none"}`}
                      placeholder={
                        !r.brandId
                          ? "Marca primeiro"
                          : "Selecione..."
                      }
                      value={r.generalModel}
                      options={generalModels}
                      loading={rowParsedLoading[r.id] || false}
                      onChange={(opt) => handleRowGeneralModelChange(r.id, opt)}
                      disabled={!r.brandId}
                    />
                  </div>
                  <div>
                    <SearchableSelect
                      label="Versão"
                      key={`row-version-${r.id}-${r.generalModel || "none"}`}
                      placeholder={
                        !r.generalModel
                          ? "Modelo primeiro"
                          : "Selecione..."
                      }
                      value={r.versionCode}
                      options={versions}
                      loading={false}
                      onChange={(opt) => handleRowVersionChange(r.id, opt)}
                      disabled={!r.generalModel}
                    />
                  </div>
                </div>
              )}

              {/* Ano + Grana */}
              <div className={`grid gap-1 ${r.isTypeMode ? "grid-cols-4" : "grid-cols-5"}`}>
                {!r.isTypeMode && (
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium mb-0.5 text-gray-500">
                    Transmissão
                  </label>
                  <select
                    value={r.transmission}
                    onChange={(e) => updateRowField(r.id, "transmission", e.target.value)}
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="">Indiferente</option>
                    <option value="Automático">Automático</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                )}
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium mb-0.5 text-gray-500 truncate">Ano min</label>
                  <input
                    value={r.yearMin}
                    onChange={(e) => updateRowField(r.id, "yearMin", e.target.value)}
                    type="number"
                    className={`w-full border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500 ${
                      r.yearMin && r.versionCode && rowYears[r.id]?.length && !rowYears[r.id].includes(r.yearMin)
                        ? "border-amber-400 bg-amber-50"
                        : "border-gray-300"
                    }`}
                  />
                  {r.yearMin && r.versionCode && rowYears[r.id]?.length && !rowYears[r.id].includes(r.yearMin) && (
                    <p className="text-[10px] text-amber-600 mt-0.5 leading-tight">
                      Ano mínimo não disponível na Tabela FIPE para esta versão
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium mb-0.5 text-gray-500 truncate">Ano max</label>
                  <input
                    value={r.yearMax}
                    onChange={(e) => updateRowField(r.id, "yearMax", e.target.value)}
                    type="number"
                    className={`w-full border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500 ${
                      r.yearMax && r.versionCode && rowYears[r.id]?.length && !rowYears[r.id].includes(r.yearMax)
                        ? "border-amber-400 bg-amber-50"
                        : "border-gray-300"
                    }`}
                  />
                  {r.yearMax && r.versionCode && rowYears[r.id]?.length && !rowYears[r.id].includes(r.yearMax) && (
                    <p className="text-[10px] text-amber-600 mt-0.5 leading-tight">
                      Ano máximo não disponível na Tabela FIPE para esta versão
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium mb-0.5 text-gray-500 truncate">Grana (R$)</label>
                  <input
                    value={r.cashAdj}
                    onChange={(e) => updateRowField(r.id, "cashAdj", e.target.value)}
                    type="number"
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium mb-0.5 text-gray-500 truncate">±Tolerância</label>
                  <input
                    value={r.tolerance}
                    onChange={(e) => updateRowField(r.id, "tolerance", e.target.value)}
                    type="number"
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Km min / Km max (opcional) */}
              <div className="grid grid-cols-2 gap-1">
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium mb-0.5 text-gray-500 truncate">Km min</label>
                  <input
                    value={r.mileageMin}
                    onChange={(e) => updateRowField(r.id, "mileageMin", e.target.value)}
                    type="number"
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="opcional"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] font-medium mb-0.5 text-gray-500 truncate">Km max</label>
                  <input
                    value={r.mileageMax}
                    onChange={(e) => updateRowField(r.id, "mileageMax", e.target.value)}
                    type="number"
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="opcional"
                  />
                </div>
              </div>

              <p className="text-[10px] text-gray-400 leading-tight">
                <strong>Grana positiva</strong> = você paga esse valor. <strong>Negativa</strong> = você recebe.
              </p>
            </div>
          );
        })}

        <button type="button" onClick={addRow} className="text-blue-600 text-sm hover:text-blue-800">
          + Adicionar outro veículo
        </button>
      </fieldset>

      {/* ─── Contato ─── */}
      <fieldset className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 space-y-3 sm:p-5">
        <legend className="px-1 text-[13px] font-semibold text-ink-900">Contato</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp (com código do país)</label>
            <input name="whatsapp" className="input-field" placeholder="+5511999999999" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input name="email" type="email" className="input-field" />
          </div>
        </div>
      </fieldset>

      {/* ─── Fotos ─── */}
      <fieldset className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 space-y-3 sm:p-5">
        <legend className="px-1 text-[13px] font-semibold text-ink-900">Fotos</legend>

        {isEdit && existingImages.filter(img => !removedImages.includes(img)).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Fotos atuais:</p>
            <div className="flex gap-2 flex-wrap">
              {existingImages
                .filter(img => !removedImages.includes(img))
                .map(img => (
                  <div key={img} className="relative group">
                    <img
                      src={`/uploads/${img}`}
                      alt="Foto do anúncio"
                      className="w-20 h-16 object-cover rounded border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setRemovedImages(prev => [...prev, img])}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-[11px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                      title="Remover foto"
                    >
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        <label
          htmlFor="images-input"
          className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/60 px-4 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-400" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17" />
          </svg>
          <span className="text-[13px] font-medium text-ink-700">
            Clique para escolher fotos
          </span>
          <span className="text-[11.5px] text-ink-400">
            JPG, PNG ou WEBP · até 6 MB cada · máx. 8 fotos
          </span>
          <input
            id="images-input"
            name="images"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const n = e.target.files?.length ?? 0;
              setImagesChosen(n);
            }}
          />
        </label>

        {imagesChosen > 0 && (
          <p className="text-[12px] font-medium text-brand-700">
            {imagesChosen} foto{imagesChosen > 1 ? "s" : ""} selecionada
            {imagesChosen > 1 ? "s" : ""}
          </p>
        )}

        <p className="text-[11.5px] text-ink-400">
          {isEdit
            ? "Novas fotos serão adicionadas às que você mantiver acima."
            : "A primeira foto aparece no cartão do anúncio."}
        </p>
      </fieldset>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-700">
          {success}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !isSubmitReady}
          className="btn-primary !px-6"
        >
          {loading
            ? (isEdit ? "Salvando..." : "Publicando...")
            : (isEdit ? "Salvar alterações" : "Publicar anúncio")}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-ghost !px-6"
        >
          Cancelar
        </button>
        {!isSubmitReady && (
          <span className="text-[11.5px] text-ink-400">
            Preencha marca, modelo, versão, ano e valor
          </span>
        )}
      </div>
    </form>
  );
}
