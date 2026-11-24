const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1/carros";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Fetch com retry para a API da Tabela FIPE.
 * A API externa do parallelum.com.br pode falhar eventualmente (502, timeout),
 * então repetimos requisições com backoff exponencial antes de desistir.
 *
 * Aceita RequestInit opcional para passar opções adicionais do fetch
 * (ex: { next: { revalidate: 86400 } } para ISR cache do Next.js).
 */
async function fipeFetch(url: string, options?: RequestInit): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // Só retenta em 5xx (erro do servidor) — 4xx é erro do cliente
      if (res.status < 500) return res;
      lastError = new Error(`FIPE responded with ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (i < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * (i + 1)));
    }
  }

  throw lastError!;
}

export interface FipeBrand {
  codigo: string;
  nome: string;
}

export interface FipeModel {
  codigo: number;
  nome: string;
}

export interface FipeYear {
  codigo: string;
  nome: string;
}

export interface FipePrice {
  Valor: string;
  Marca: string;
  Modelo: string;
  AnoModelo: number;
  Combustivel: string;
  CodigoFipe: string;
  MesReferencia: string;
  SiglaCombustivel: string;
}

export async function fetchFipeBrands(options?: RequestInit): Promise<FipeBrand[]> {
  const res = await fipeFetch(`${FIPE_BASE}/marcas`, options);
  const data: FipeBrand[] = await res.json();
  data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return data;
}

export async function fetchFipeModels(brandId: string, options?: RequestInit): Promise<FipeModel[]> {
  const res = await fipeFetch(`${FIPE_BASE}/marcas/${brandId}/modelos`, options);
  const data: { modelos: FipeModel[] } = await res.json();
  data.modelos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return data.modelos;
}

export async function fetchFipeYears(
  brandId: string,
  modelId: string,
  options?: RequestInit
): Promise<FipeYear[]> {
  const res = await fipeFetch(
    `${FIPE_BASE}/marcas/${brandId}/modelos/${modelId}/anos`,
    options
  );
  return res.json();
}

export async function fetchFipePrice(
  brandId: string,
  modelId: string,
  yearCode: string,
  options?: RequestInit
): Promise<FipePrice> {
  const res = await fipeFetch(
    `${FIPE_BASE}/marcas/${brandId}/modelos/${modelId}/anos/${yearCode}`,
    options
  );
  return res.json();
}
