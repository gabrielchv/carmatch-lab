"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LocationSelect from "@/components/LocationSelect";
import CarPicker, { EMPTY_PICK, type CarPick } from "@/components/CarPicker";
import SearchableSelect, { type SelectOption } from "@/components/SearchableSelect";
import { parseFipeModels, type FipeModelRaw } from "@/lib/fipe-utils";
import { formatBRL } from "@/lib/cash";
import { titleAlreadyNamesCar } from "@/lib/present";
import {
  ArrowRightIcon,
  CheckIcon,
  MapPinIcon,
  PhotoIcon,
  SearchIcon,
  SparkIcon,
  SwapIcon,
  WhatsAppIcon,
} from "@/components/icons";
import type { CarPost } from "@/lib/types";
import { buildMatchMessage } from "@/lib/whatsapp";

/**
 * First-visit onboarding.
 *
 * Four questions, then the answer that matters: "does anyone want what I have,
 * and do I want anything here?". It deliberately does not require an account —
 * the value has to be visible before the signup wall, otherwise nobody signs up.
 */

const STORAGE_KEY = "carmatch:onboarding:v1";

/** "até R$ 80.000" / "R$ 60.000 a R$ 90.000" / "a partir de R$ 140.000" */
function priceRangeLabel(min: string, max: string): string {
  const brl = (v: string) => Number(v).toLocaleString("pt-BR");
  if (min && max) return `R$ ${brl(min)} a R$ ${brl(max)}`;
  if (max) return `até R$ ${brl(max)}`;
  if (min) return `a partir de R$ ${brl(min)}`;
  return "";
}

const RADIUS_OPTIONS = [
  { value: "", label: "Qualquer lugar" },
  { value: "50", label: "Até 50 km" },
  { value: "100", label: "Até 100 km" },
  { value: "200", label: "Até 200 km" },
  { value: "500", label: "Até 500 km" },
];

interface PreviewResult {
  considered: number;
  matches: CarPost[];
  theyWantMine: CarPost[];
  iWantTheirs: CarPost[];
  /** True when the visitor chose not to name a car they want. */
  wantSkipped: boolean;
  /** "car" (modelo), "price" (faixa) ou "none". */
  wantMode: "car" | "price" | "none";
  outcome: "no-posts" | "no-match" | "reciprocal" | "inbound-only" | "outbound-only";
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  const [step, setStep] = useState(0);

  // Quick geographic filter
  const [city, setCity] = useState("");
  const [radius, setRadius] = useState("");

  // The car I have
  const [haveBrandId, setHaveBrandId] = useState("");
  const [haveBrand, setHaveBrand] = useState("");
  const [haveModel, setHaveModel] = useState("");
  const [haveYear, setHaveYear] = useState("");
  const [haveValue, setHaveValue] = useState("");

  // The car I want
  const [wantBrandId, setWantBrandId] = useState("");
  const [wantBrand, setWantBrand] = useState("");
  const [wantModel, setWantModel] = useState("");

  const [brands, setBrands] = useState<SelectOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  /*
   * Seleção FIPE (marca → modelo/versão → ano) para os dois carros.
   *
   * O resto do assistente continua falando em strings (haveBrand, haveModel…)
   * porque é isso que a API de preview espera; estes efeitos mantêm as duas
   * formas em sincronia, em vez de reescrever o fluxo inteiro.
   */
  const [havePick, setHavePick] = useState<CarPick>(EMPTY_PICK);
  const [wantPick, setWantPick] = useState<CarPick>(EMPTY_PICK);

  /*
   * "O que você quer" tem duas respostas, não uma.
   *
   * Nomear o modelo é preciso, mas exige já saber qual é. Uma faixa de valor é
   * o que a maioria tem em mente ("até 80 mil") e não esconde anúncios de
   * carros que a pessoa aceitaria. O terceiro caminho — não responder — segue
   * como card próprio.
   */
  const [wantMode, setWantMode] = useState<"car" | "price">("car");
  const [wantMin, setWantMin] = useState("");
  const [wantMax, setWantMax] = useState("");

  const [haveModels, setHaveModels] = useState<SelectOption[]>([]);
  const [haveModelsLoading, setHaveModelsLoading] = useState(false);
  const [wantModels, setWantModels] = useState<SelectOption[]>([]);
  const [wantModelsLoading, setWantModelsLoading] = useState(false);

  const [signedIn, setSignedIn] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (!cancelled) setSignedIn(Boolean(d.user));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* Brands once */
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
        if (!cancelled) setBrandsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Load a brand's models and reduce them to general model names. */
  const loadModels = useCallback(
    async (brandId: string): Promise<SelectOption[]> => {
      if (!brandId) return [];
      const res = await fetch(`/api/fipe/models?brandId=${brandId}`);
      if (!res.ok) return [];
      const raw = (await res.json()) as FipeModelRaw[];
      const parsed = parseFipeModels(raw);
      return parsed.generalModels.map((m) => ({ value: m, label: m }));
    },
    []
  );

  const onHaveBrand = async (opt: SelectOption | null) => {
    setHaveBrandId(opt?.value ?? "");
    setHaveBrand(opt?.label ?? "");
    setHaveModel("");
    setHaveModels([]);
    if (!opt) return;
    setHaveModelsLoading(true);
    try {
      setHaveModels(await loadModels(opt.value));
    } finally {
      setHaveModelsLoading(false);
    }
  };

  const onWantBrand = async (opt: SelectOption | null) => {
    setWantBrandId(opt?.value ?? "");
    setWantBrand(opt?.label ?? "");
    setWantModel("");
    setWantModels([]);
    if (!opt) return;
    setWantModelsLoading(true);
    try {
      setWantModels(await loadModels(opt.value));
    } finally {
      setWantModelsLoading(false);
    }
  };

  /* ── Flow ── */

  useEffect(() => {
    setHaveBrand(havePick.brand);
    setHaveModel(havePick.model);
    setHaveYear(havePick.year ? String(havePick.year) : "");
    setHaveValue(havePick.value ? String(havePick.value) : "");
  }, [havePick]);

  useEffect(() => {
    setWantBrand(wantPick.brand);
    // O anúncio casa por prefixo de modelo, então a versão completa é melhor:
    // carrega a transmissão que muitos anúncios exigem.
    setWantModel(wantPick.model);
  }, [wantPick]);

  const canAdvanceFromHave = Boolean(haveBrand && haveModel);
  const canAdvanceFromWant =
    wantMode === "car"
      ? Boolean(wantBrand && wantModel)
      : Boolean(wantMin || wantMax);

  /**
   * Run the preview for an explicit set of answers.
   *
   * Takes the values as an argument (rather than reading state) so the same
   * path can serve the wizard *and* a shared deep link — see the effect below.
   */
  const runPreview = async (answers: {
    haveBrand: string;
    haveModel: string;
    haveYear?: string;
    haveValue?: string;
    /** Omitted when the visitor only wants to know who accepts their car. */
    wantBrand?: string;
    wantModel?: string;
    wantMin?: string;
    wantMax?: string;
    city?: string;
    radius?: string;
  }) => {
    setError("");
    setLoadingResult(true);
    try {
      const res = await fetch("/api/onboarding/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          have: {
            brand: answers.haveBrand,
            model: answers.haveModel,
            year: answers.haveYear ? Number(answers.haveYear) : undefined,
            estimatedValue: answers.haveValue ? Number(answers.haveValue) : undefined,
          },
          // Só um dos dois vai: o carro é a resposta mais específica.
          want:
            answers.wantBrand && answers.wantModel
              ? { brand: answers.wantBrand, model: answers.wantModel }
              : undefined,
          wantRange:
            !answers.wantBrand && (answers.wantMin || answers.wantMax)
              ? {
                  min: answers.wantMin ? Number(answers.wantMin) : undefined,
                  max: answers.wantMax ? Number(answers.wantMax) : undefined,
                }
              : undefined,
          city: answers.city || undefined,
          radiusKm: answers.radius ? Number(answers.radius) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível verificar agora.");
        return;
      }
      setResult(data as PreviewResult);
      setStep(4);

      // Remember the answers so the site can greet you properly next time.
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            doneAt: new Date().toISOString(),
            have: {
              brand: answers.haveBrand,
              model: answers.haveModel,
              year: answers.haveYear,
              value: answers.haveValue,
            },
            want: { brand: answers.wantBrand, model: answers.wantModel },
            wantRange:
              !answers.wantBrand && (answers.wantMin || answers.wantMax)
                ? { min: answers.wantMin, max: answers.wantMax }
                : undefined,
            city: answers.city,
            radius: answers.radius,
          })
        );
      } catch {
        /* private mode — not important enough to fail the flow */
      }

      // Persist to the profile only when there is a profile to persist to.
      if (signedIn) {
        fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboarding: {
            have: {
              brand: answers.haveBrand,
              model: answers.haveModel,
              year: answers.haveYear ? Number(answers.haveYear) : undefined,
              estimatedValue: answers.haveValue ? Number(answers.haveValue) : undefined,
            },
            want: { brand: answers.wantBrand, model: answers.wantModel },
            city: answers.city,
            radiusKm: answers.radius ? Number(answers.radius) : undefined,
          },
        }),
        }).catch(() => {});
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoadingResult(false);
    }
  };

  const finish = () =>
    runPreview({
      haveBrand,
      haveModel,
      haveYear,
      haveValue,
      wantBrand: wantMode === "car" ? wantBrand : "",
      wantModel: wantMode === "car" ? wantModel : "",
      wantMin: wantMode === "price" ? wantMin : "",
      wantMax: wantMode === "price" ? wantMax : "",
      city,
      radius,
    });

  /**
   * "Just show me who wants my car."
   *
   * Same preview endpoint with no `want`, so the answer is filtered purely on
   * the inbound direction. Deliberately not a separate screen: it is step 3
   * answered with "nenhum", and the result renders the same way.
   */
  const onlyInbound = () =>
    runPreview({
      haveBrand,
      haveModel,
      haveYear,
      haveValue,
      city,
      radius,
    });

  /**
   * Shareable match check: opening /boas-vindas with the four answers in the
   * query string runs the preview immediately. Useful to send someone "will
   * your car trade for mine?" without them filling the wizard.
   */
  useEffect(() => {
    const p = searchParams;
    const hb = p.get("haveBrand");
    const hm = p.get("haveModel");
    const wb = p.get("wantBrand") ?? "";
    const wm = p.get("wantModel") ?? "";
    // Faixa compartilhável: /boas-vindas?haveBrand=…&wantMin=60000&wantMax=90000
    const wMin = p.get("wantMin") ?? "";
    const wMax = p.get("wantMax") ?? "";
    // Only the car you have is required. Without a wanted car this becomes the
    // "who wants mine" question, which is a complete answer on its own.
    if (!hb || !hm) return;

    const answers = {
      haveBrand: hb,
      haveModel: hm,
      haveYear: p.get("haveYear") ?? "",
      wantBrand: wb,
      wantModel: wm,
      wantMin: wMin,
      wantMax: wMax,
      city: p.get("city") ?? "",
      radius: p.get("radius") ?? "",
    };

    setHaveBrand(hb);
    setHaveModel(hm);
    setHaveYear(answers.haveYear);
    if (wb && wm) {
      setWantBrand(wb);
      setWantModel(wm);
    } else if (wMin || wMax) {
      setWantMode("price");
      setWantMin(wMin);
      setWantMax(wMax);
    }
    setCity(answers.city);
    setRadius(answers.radius);

    void runPreview(answers);
    // Intentionally once, on mount: the values come from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ skippedAt: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
    router.replace(redirectTo);
  };

  const browseWithResults = () => {
    const params = new URLSearchParams();

    // A pergunta que a pessoa acabou de responder vira o filtro da listagem —
    // senão "Ver estes anúncios" mostraria outra coisa.
    if (wantMode === "car" && wantBrand && wantModel) {
      params.set("wantsBrand", wantBrand);
      params.set("wantsModel", wantModel);
      if (wantPick.year) params.set("wantsYear", String(wantPick.year));
    } else if (wantMode === "price" && (wantMin || wantMax)) {
      if (wantMin) params.set("minPrice", wantMin);
      if (wantMax) params.set("maxPrice", wantMax);
    } else if (haveBrand && haveModel) {
      params.set("wantsBrand", haveBrand);
      params.set("wantsModel", haveModel);
      if (haveYear) params.set("wantsYear", haveYear);
    }

    router.push(params.toString() ? `/?${params.toString()}` : "/");
  };

  const stepLabels = ["Como funciona", "Onde", "Seu carro", "O que quer"];
  const progress = Math.min(step, 3);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-white via-white to-ink-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        {/* Progress */}
        {step < 4 && (
          <div className="mb-8 flex items-center gap-2">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex flex-1 items-center gap-2">
                <div
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= progress ? "bg-brand-600" : "bg-ink-200"
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        {step === 0 && <Intro onNext={() => setStep(1)} onSkip={skip} />}

        {step === 1 && (
          <Step
            title="Onde você procura?"
            subtitle="Um filtro rápido. Você pode mudar depois."
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
            onSkip={() => {
              setCity("");
              setRadius("");
              setStep(2);
            }}
          >
            <div className="space-y-4">
              <LocationSelect label="Estado e cidade" value={city} onChange={setCity} />
              <div>
                <p className="mb-2 text-[12px] font-medium text-ink-700">Distância</p>
                <div className="flex flex-wrap gap-2">
                  {RADIUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value || "any"}
                      type="button"
                      onClick={() => setRadius(opt.value)}
                      className={`rounded-full px-3.5 py-2 text-[12.5px] font-medium ring-1 transition-colors ${
                        radius === opt.value
                          ? "bg-brand-600 text-white ring-brand-600"
                          : "bg-white text-ink-600 ring-ink-200 hover:bg-ink-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step
            title="Qual carro você tem?"
            subtitle="É ele que você coloca na troca."
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextDisabled={!canAdvanceFromHave}
            onSkip={undefined}
          >
            {/*
              Marca → modelo/versão → ano, direto da Tabela FIPE — a mesma
              origem que o formulário de anúncio usa. Sem isso a pessoa digita
              um modelo que não existe e o resultado é "nenhum match" por um
              motivo que ela não consegue ver.
            */}
            <CarPicker
              value={havePick}
              onChange={setHavePick}
              showYear
              showValue
              brandLabel="Marca"
              modelLabel="Modelo e versão"
            />
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
              Ano e valor vêm da Tabela FIPE. Ambos são opcionais — só deixam o
              match mais preciso.
            </p>
          </Step>
        )}

        {step === 3 && (
          <Step
            title="E o que você quer?"
            subtitle="O carro que você aceitaria receber na troca."
            onBack={() => setStep(2)}
            onNext={finish}
            nextLabel="Ver meus matches"
            nextDisabled={!canAdvanceFromWant}
            loading={loadingResult}
          >
            {/* Como você quer responder: um carro específico ou uma faixa. */}
            <div className="mb-4 inline-flex rounded-lg bg-ink-100 p-1">
              {(
                [
                  ["car", "Carro específico"],
                  ["price", "Faixa de valor"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setWantMode(mode);
                    setError("");
                  }}
                  aria-pressed={wantMode === mode}
                  className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    wantMode === mode
                      ? "bg-white text-ink-900 shadow-sm"
                      : "text-ink-600 hover:text-ink-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {wantMode === "car" ? (
              <CarPicker
                value={wantPick}
                onChange={setWantPick}
                showYear
                brandLabel="Marca"
                modelLabel="Modelo e versão"
              />
            ) : (
              <div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
                      De (R$)
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={wantMin}
                      onChange={(e) => setWantMin(e.target.value)}
                      placeholder="60000"
                      className="input-field"
                      aria-label="Valor mínimo"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-ink-700">
                      Até (R$)
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={wantMax}
                      onChange={(e) => setWantMax(e.target.value)}
                      placeholder="80000"
                      className="input-field"
                      aria-label="Valor máximo"
                    />
                  </label>
                </div>

                {/* Atalhos: digitar dois números no celular é chato. */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {[
                    [0, 60000, "até 60 mil"],
                    [60000, 90000, "60–90 mil"],
                    [90000, 140000, "90–140 mil"],
                    [140000, 0, "140 mil+"],
                  ].map(([min, max, label]) => (
                    <button
                      key={String(label)}
                      type="button"
                      onClick={() => {
                        setWantMin(min ? String(min) : "");
                        setWantMax(max ? String(max) : "");
                      }}
                      className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink-600 ring-1 ring-ink-200 transition-colors hover:bg-ink-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-400">
                  Pode preencher só um dos dois. A faixa usa o valor estimado de
                  cada anúncio.
                </p>
              </div>
            )}
            <div className="mt-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-ink-200" />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
                ou
              </span>
              <span className="h-px flex-1 bg-ink-200" />
            </div>

            {/*
              A real answer, not a skip link. Wanting something specific is
              optional: "quem quer o meu carro?" is a complete question, and
              for someone deciding whether to publish it is the only one they
              need answered.
            */}
            <button
              type="button"
              onClick={onlyInbound}
              disabled={loadingResult}
              className="mt-3 w-full rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 text-left transition-colors hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60"
            >
              <span className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-brand-200">
                  <SearchIcon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-900">
                    {loadingResult ? "Procurando..." : "Só quero ver quem quer o meu carro"}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-500">
                    Pula esta etapa. Mostra só as pessoas que aceitariam
                    {haveBrand ? ` seu ${haveBrand} ${haveModel}` : " seu carro"} na troca.
                  </span>
                </span>
                <ArrowRightIcon size={15} className="mt-1 shrink-0 text-brand-500" />
              </span>
            </button>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                {error}
              </p>
            )}
          </Step>
        )}

        {step === 4 && result && (
          <Results
            result={result}
            haveLabel={`${haveBrand} ${haveModel}${haveYear ? ` ${haveYear}` : ""}`}
            wantLabel={
              wantMode === "price"
                ? priceRangeLabel(wantMin, wantMax)
                : `${wantBrand} ${wantModel}${wantPick.year ? ` ${wantPick.year}` : ""}`
            }
            haveBrand={haveBrand}
            haveModel={haveModel}
            onBrowse={browseWithResults}
            onRestart={() => {
              setStep(0);
              setResult(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────────── */

function Intro({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
        <SparkIcon size={12} />
        Troca de carro, sem vender o seu
      </span>

      <h1 className="mt-4 text-balance text-[30px] font-bold leading-[1.15] tracking-tight text-ink-900 sm:text-[36px]">
        Você não precisa vender seu carro.
        <br />
        <span className="text-brand-600">Precisa achar quem quer trocar.</span>
      </h1>

      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-600">
        O CarMatch cruza o carro que você tem com o carro que você quer. Quando os
        dois lados batem, aparece um match — e a conversa acontece direto no
        WhatsApp, com a proposta já escrita.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Feature
          icon={<SwapIcon size={16} />}
          title="Diga o que tem"
          text="Marca, modelo e ano do seu carro."
        />
        <Feature
          icon={<SearchIcon size={16} />}
          title="Diga o que quer"
          text="O carro que você aceita receber."
        />
        <Feature
          icon={<WhatsAppIcon size={16} />}
          title="Feche no WhatsApp"
          text="Mensagem pronta, direto com a pessoa."
        />
      </div>

      <MessagePreview />

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" onClick={onNext} className="btn-primary w-full sm:w-auto sm:!px-6">
          Descobrir meus matches
          <ArrowRightIcon size={15} />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full rounded-lg px-4 py-2.5 text-[13px] font-medium text-ink-500 hover:text-ink-700 sm:w-auto"
        >
          Só quero ver os carros
        </button>
      </div>

      <p className="mt-6 text-[11.5px] text-ink-400">
        Leva 30 segundos. Não precisa de cadastro para ver o resultado.
      </p>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-3.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </div>
      <p className="mt-2.5 text-[12.5px] font-semibold text-ink-900">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">{text}</p>
    </div>
  );
}

/** A real message, rendered as it will look in WhatsApp. */
function MessagePreview() {
  const message = buildMatchMessage({
    recipientName: "Fernanda",
    myCar: {
      brand: "Honda",
      model: "Fit EX 1.5",
      year: 2014,
      estimatedValue: 53000,
    },
    theirCar: {
      brand: "Toyota",
      model: "Corolla XEi 2.0",
      year: 2019,
      estimatedValue: 96000,
    },
    myPostUrl: "carmatch.app/posts/7f3a…",
    cashFromMe: 43000,
    score: 78,
  });

  return (
    <div className="mt-7 overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-[#075e54] px-3.5 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white">
          <WhatsAppIcon size={13} />
        </span>
        <span className="text-[11.5px] font-medium text-white">
          Mensagem que o CarMatch escreve por você
        </span>
      </div>
      <div className="bg-[#ece5dd] p-3">
        <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-sm bg-[#dcf8c6] px-3 py-2 shadow-sm">
          <pre className="whitespace-pre-wrap break-words font-sans text-[11.5px] leading-relaxed text-[#111b21]">
            {message}
          </pre>
          <p className="mt-1 text-right text-[9.5px] text-[#667781]">enviado ✓✓</p>
        </div>
      </div>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Continuar",
  nextDisabled = false,
  loading = false,
  onSkip,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-[0_1px_2px_rgba(20,24,30,0.04)] sm:p-7">
      <h2 className="text-[22px] font-bold tracking-tight text-ink-900">{title}</h2>
      <p className="mt-1 text-[13px] text-ink-500">{subtitle}</p>

      <div className="mt-6">{children}</div>

      <div className="mt-7 flex items-center gap-2">
        <button type="button" onClick={onBack} className="btn-ghost">
          Voltar
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || loading}
          className="btn-primary ml-auto"
        >
          {loading ? "Buscando..." : nextLabel}
          {!loading && <ArrowRightIcon size={14} />}
        </button>
      </div>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 w-full text-center text-[12px] font-medium text-ink-400 hover:text-ink-600"
        >
          Pular esta etapa
        </button>
      )}
    </div>
  );
}

function Results({
  result,
  haveLabel,
  wantLabel,
  haveBrand,
  haveModel,
  onBrowse,
  onRestart,
}: {
  result: PreviewResult;
  haveLabel: string;
  wantLabel: string;
  haveBrand: string;
  haveModel: string;
  onBrowse: () => void;
  onRestart: () => void;
}) {
  const total = result.matches.length + result.theyWantMine.length + result.iWantTheirs.length;

  // When the visitor did not name a wanted car, every sentence has to describe
  // one direction only — saying "nenhum bateu nos dois sentidos" would be
  // describing a question that was never asked.
  const count = result.theyWantMine.length;
  const plural = count > 1;

  const headline = result.wantSkipped
    ? {
        "no-posts": "Ainda não há carros publicados",
        "no-match": "Ninguém pediu o seu carro ainda",
        reciprocal: "Match encontrado!",
        "inbound-only": `${count} ${plural ? "pessoas querem" : "pessoa quer"} seu carro`,
        "outbound-only": "Ninguém pediu o seu carro ainda",
      }[result.outcome]
    : {
        "no-posts": "Ainda não há carros publicados",
        "no-match": "Nenhum match com esses critérios — ainda",
        reciprocal: "Match encontrado!",
        "inbound-only": "Tem gente querendo seu carro",
        "outbound-only": "Tem carro que você quer, mas ninguém quer o seu ainda",
      }[result.outcome];

  const subline = result.wantSkipped
    ? {
        "no-posts":
          "O CarMatch está começando. Publique seu carro e seja a primeira troca do site.",
        "no-match": `${result.considered} carros foram comparados e nenhum aceita o seu na troca. Ampliar a região costuma resolver.`,
        reciprocal: `Encontramos ${result.matches.length} ${result.matches.length > 1 ? "anúncios" : "anúncio"} em que os dois lados se querem.`,
        "inbound-only": `${count} ${plural ? "anúncios aceitariam" : "anúncio aceitaria"} seu carro na troca. Fale com ${plural ? "eles" : "ele"} direto no WhatsApp.`,
        "outbound-only": `${result.considered} carros foram comparados e nenhum aceita o seu na troca.`,
      }[result.outcome]
    : {
        "no-posts":
          "O CarMatch está começando. Publique seu carro e seja a primeira troca do site.",
        "no-match": `${result.considered} carros foram comparados e nenhum bateu nos dois sentidos. Ampliar a região costuma resolver.`,
        reciprocal: `Encontramos ${result.matches.length} ${result.matches.length > 1 ? "anúncios" : "anúncio"} em que os dois lados se querem.`,
        "inbound-only": `${count} ${plural ? "pessoas aceitam" : "pessoa aceita"} seu carro como parte do negócio.`,
        "outbound-only": `Você quer ${result.iWantTheirs.length} ${result.iWantTheirs.length > 1 ? "carros" : "carro"} da lista, mas ninguém aceita o seu ainda.`,
      }[result.outcome];

  return (
    <div>
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              result.outcome === "reciprocal"
                ? "bg-emerald-100 text-emerald-700"
                : result.outcome === "no-posts"
                  ? "bg-ink-100 text-ink-500"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {result.outcome === "reciprocal" ? (
              <CheckIcon size={20} />
            ) : result.outcome === "no-posts" ? (
              <PhotoIcon size={18} />
            ) : (
              <SearchIcon size={18} />
            )}
          </div>

          <div className="min-w-0">
            <h2 className="text-[21px] font-bold tracking-tight text-ink-900">{headline}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{subline}</p>
          </div>
        </div>

        <div
          className={`mt-4 grid gap-2 text-[11.5px] text-ink-500 ${
            result.wantSkipped ? "sm:grid-cols-2" : "sm:grid-cols-3"
          }`}
        >
          <Stat label="Carros comparados" value={String(result.considered)} />
          <Stat
            label="Aceitam seu carro"
            value={String(result.matches.length + result.theyWantMine.length)}
          />
          {!result.wantSkipped && (
            <Stat
              label="Você quer"
              value={String(result.matches.length + result.iWantTheirs.length)}
            />
          )}
        </div>

        <div className="mt-4 rounded-lg bg-ink-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-600">
          <span className="font-medium text-ink-700">Seu carro:</span> {haveLabel}
          {!result.wantSkipped && wantLabel && (
            <>
              <span className="mx-1.5 text-ink-300">·</span>
              <span className="font-medium text-ink-700">Você quer:</span> {wantLabel}
            </>
          )}
        </div>
      </div>

      {result.matches.length > 0 && (
        <Section title="Match — vocês se querem" tone="emerald">
          {result.matches.slice(0, 4).map((p) => (
            <ListingRow key={p.id} post={p} badge="Match" tone="emerald" />
          ))}
        </Section>
      )}

      {result.theyWantMine.length > 0 && (
        <Section title="Querem o seu carro" tone="amber">
          {result.theyWantMine.slice(0, 4).map((p) => (
            <ListingRow key={p.id} post={p} badge="Quer o seu" tone="amber" />
          ))}
        </Section>
      )}

      {result.iWantTheirs.length > 0 && (
        <Section title="Você quer estes" tone="ink">
          {result.iWantTheirs.slice(0, 4).map((p) => (
            <ListingRow key={p.id} post={p} badge="Você quer" tone="ink" />
          ))}
        </Section>
      )}

      {result.outcome !== "reciprocal" && (
        <RodaHint brand={haveBrand} model={haveModel} />
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onBrowse} className="btn-primary w-full sm:w-auto sm:!px-6">
          {total > 0 ? "Ver estes anúncios" : "Ver todos os carros"}
          <ArrowRightIcon size={15} />
        </button>
        <button type="button" onClick={onRestart} className="btn-ghost w-full sm:w-auto">
          Refazer
        </button>
      </div>

      {result.outcome !== "reciprocal" && (
        <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
          Novos anúncios entram o tempo todo.{" "}
          <Link href="/posts/new" className="font-medium text-brand-600 hover:underline">
            Publique o seu
          </Link>{" "}
          para aparecer nas buscas de quem procura o que você tem.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/60 px-2.5 py-2">
      <p className="text-[10.5px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-[15px] font-semibold text-ink-800">{value}</p>
    </div>
  );
}

/**
 * "You do not need a reciprocal match to trade."
 *
 * The preview reports what exists in pairs today. A ring is the case it cannot
 * express: no single listing wants the user's car back, yet a cycle already
 * contains a car like theirs. Asking the ring summary keeps the wizard from
 * shipping the whole ring payload just to display one sentence.
 */
function RodaHint({ brand, model }: { brand: string; model: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!brand || !model) return;

    const params = new URLSearchParams({
      summary: "1",
      carBrand: brand,
      carModel: model,
    });

    let cancelled = false;
    fetch(`/api/roda?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.featuringCar === "number") {
          setCount(data.featuringCar);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [brand, model]);

  if (!count) return null;

  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <SwapIcon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-ink-900">
            Existe uma roda possível
          </h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">
            {count === 1
              ? "Uma roda já inclui"
              : `${count} rodas já incluem`}{" "}
            um carro como o seu ({brand} {model}). Em vez de uma troca de dois,
            três ou mais pessoas podem fechar juntas.
          </p>
          <Link
            href="/roda"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:underline"
          >
            Ver a roda
            <ArrowRightIcon size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "emerald" | "amber" | "ink";
  children: React.ReactNode;
}) {
  const color = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    ink: "text-ink-600",
  }[tone];
  return (
    <section className="mt-5">
      <h3 className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${color}`}>
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ListingRow({
  post,
  badge,
  tone,
}: {
  post: CarPost;
  badge: string;
  tone: "emerald" | "amber" | "ink";
}) {
  const badgeStyle = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    ink: "bg-ink-100 text-ink-600",
  }[tone];

  const wanted = post.desiredTrade.vehicles?.[0];

  return (
    <Link
      href={`/posts/${post.id}`}
      className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-2.5 transition-colors hover:border-ink-300"
    >
      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100">
        {post.images?.length ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/uploads/${post.images[0]}`} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-400">
            <PhotoIcon size={16} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeStyle}`}>
          {badge}
        </span>
        <p className="mt-1 line-clamp-1 text-[12.5px] font-semibold text-ink-900">
          {post.title}
        </p>
        <p className="text-[11px] text-ink-500">
          R$ {formatBRL(post.car.estimatedValue)}
          {post.car.localization ? ` · ${post.car.localization}` : ""}
        </p>
        {wanted && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-brand-600">
            quer {wanted.vehicleType ?? `${wanted.brand}${wanted.model ? ` ${wanted.model}` : ""}`}
          </p>
        )}
      </div>

      <ArrowRightIcon size={14} className="mt-1 shrink-0 text-ink-300" />
    </Link>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-24 text-center text-sm text-ink-400">
          Carregando...
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
