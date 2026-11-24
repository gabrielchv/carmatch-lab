/**
 * Base URL of the FIPE catalogue.
 *
 * Overridable so tests can point at a local fake instead of the real service —
 * the retry and fallback paths are exactly the ones that only break when the
 * upstream misbehaves, so they have to be exercised against a misbehaving
 * upstream.
 */
const DEFAULT_FIPE_BASE = "https://parallelum.com.br/fipe/api/v1/carros";

/** Resolved per call, so a test (or a mirror) can point the client elsewhere. */
const fipeBase = () => process.env.FIPE_API_BASE ?? DEFAULT_FIPE_BASE;

/**
 * Second source for the catalogue, used only when the first one refuses.
 *
 * BrasilAPI serves the same FIPE data with the *same* brand and model codes —
 * verified against a full brand (549 of 549 codes, zero name differences) — so
 * the codes stored on a listing keep meaning the same car. It covers brands and
 * models, which is what the picker needs to let someone name their car while
 * the primary service is rate-limited.
 *
 * Set `FIPE_FALLBACK_BASE=off` to disable (tests that assert the failure path).
 */
const DEFAULT_FALLBACK_BASE = "https://brasilapi.com.br/api/fipe";
const fallbackBase = () => process.env.FIPE_FALLBACK_BASE ?? DEFAULT_FALLBACK_BASE;

/**
 * The public FIPE API is free and rate-limited, and it answers `429` when the
 * quota is gone. That is *transient*, not a client error — retrying after a
 * pause is the correct response, and treating it as final was the bug behind
 * "Não foi possível carregar os modelos".
 */
const MAX_RETRIES = 3;
/**
 * A 429 is a quota answer, not a hiccup: retrying once covers a transient
 * burst, retrying three times just makes the user wait seconds to be told the
 * same thing. After that the breaker takes over (see below).
 */
const MAX_RATE_LIMIT_RETRIES = 1;
const BASE_DELAY_MS = 400;
/** Never make the UI wait longer than this on a single attempt chain. */
const MAX_WAIT_MS = 4000;

/**
 * The catalogue could not be read right now.
 *
 * Distinct from a bad request: `status` carries the upstream status when there
 * is one (429, 500, 502), so routes can answer honestly instead of guessing.
 */
export class FipeUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "FipeUnavailableError";
  }
}

/** 408/425/429 and 5xx are worth another try; 400/404 are not. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Circuit breaker for the rate limit.
 *
 * Once the service says 429, every following request would pay the same retry
 * delay to learn the same thing — eight seconds per brand, which makes the
 * picker feel broken even when the fallback works. After a 429 the primary is
 * skipped for a minute and the caller goes straight to the second source.
 */
const BREAKER_MS = 60_000;

/**
 * Keyed by origin, so pointing at a different source starts clean and one
 * unhappy host cannot silence another.
 */
const blockedUntil = new Map<string, number>();

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};

function isBlocked(url: string): boolean {
  return Date.now() < (blockedUntil.get(originOf(url)) ?? 0);
}

function trip(url: string, status: number): void {
  // Only the rate limit trips it: a single 500 does not mean the service is
  // refusing us, and skipping it for a minute would be an overreaction.
  if (status === 429) blockedUntil.set(originOf(url), Date.now() + BREAKER_MS);
}

/**
 * How long to wait before the next attempt.
 *
 * `Retry-After` is the server telling us exactly what it wants; honouring it is
 * both politer and faster than a fixed guess. It is capped so a hostile value
 * cannot stall a request — after the cap we give up and let the caller fall
 * back to its snapshot instead.
 */
function waitFor(attempt: number, res?: Response): number {
  const header = res?.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_WAIT_MS);
    }
  }
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_WAIT_MS);
}

/**
 * Fetch com retry e backoff exponencial para a API da Tabela FIPE.
 *
 * Aceita RequestInit opcional para passar opções adicionais do fetch
 * (ex: { next: { revalidate: 86400 } } para o cache de dados do Next).
 *
 * Throws `FipeUnavailableError` — never returns an error response. Returning a
 * 429 body as if it were data is what produced a `TypeError` deep inside
 * `.sort()` and a generic 502 to the user; a typed failure keeps the cause.
 */
async function fipeFetch(url: string, options?: RequestInit): Promise<Response> {
  /*
   * The breaker is checked per call, and only tripped once a call has burned
   * all its retries. Tripping on the first 429 would defeat the retry that
   * recovers from a burst limit — and that recovery is worth having.
   */
  if (isBlocked(url)) {
    throw new FipeUnavailableError(
      "A Tabela FIPE está limitando as requisições (429).",
      429
    );
  }

  let lastError: FipeUnavailableError | null = null;
  let lastStatus: number | undefined;

  for (let attempt = 0, rateLimited = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, options);
    } catch (err) {
      // Network-level failure (DNS, timeout, offline): worth retrying.
      lastError = new FipeUnavailableError(
        err instanceof Error ? err.message : String(err)
      );
      if (attempt < MAX_RETRIES - 1) await sleep(waitFor(attempt));
      continue;
    }

    if (res.ok) return res;

    if (!isRetryable(res.status)) {
      throw new FipeUnavailableError(
        `A Tabela FIPE respondeu ${res.status}.`,
        res.status
      );
    }

    lastStatus = res.status;
    lastError = new FipeUnavailableError(
      `A Tabela FIPE está limitando as requisições (${res.status}).`,
      res.status
    );
    if (res.status === 429) {
      rateLimited += 1;
      if (rateLimited > MAX_RATE_LIMIT_RETRIES) break;
      /*
       * A quota answer often carries `Retry-After: 3600`. Waiting even a
       * fraction of that inside a request the user is watching is pointless —
       * the breaker will re-probe in a minute. One short pause covers a burst.
       */
      await sleep(Math.min(waitFor(attempt, res), 800));
      continue;
    }
    if (attempt < MAX_RETRIES - 1) await sleep(waitFor(attempt, res));
  }

  if (lastStatus !== undefined) trip(url, lastStatus);

  throw (
    lastError ??
    new FipeUnavailableError("Não foi possível falar com a Tabela FIPE.")
  );
}

/** JSON of a response, refusing payloads we cannot parse. */
async function readJson<T>(res: Response, what: string): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new FipeUnavailableError(`A Tabela FIPE devolveu ${what} ilegível.`);
  }
  return parsed as T;
}

/** An array, or a typed error — never `undefined.sort()`. */
function expectArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) {
    throw new FipeUnavailableError(
      `A Tabela FIPE devolveu ${what} em formato inesperado.`
    );
  }
  return value as T[];
}

/**
 * Run the primary source; if it is unavailable — and only then — ask the
 * secondary one.
 *
 * A 404 is a fact about the car, not an outage: it must never be answered by a
 * different source, or a listing could be created against a model the primary
 * catalogue does not have.
 */
async function withFallback<T>(
  primary: () => Promise<T>,
  secondary: () => Promise<T>
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    const base = fallbackBase();
    if (base === "off") throw err;
    if (!(err instanceof FipeUnavailableError)) throw err;
    if (err.status === 404) throw err;
    return secondary();
  }
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
  const fromPrimary = async (): Promise<FipeBrand[]> => {
    const res = await fipeFetch(`${fipeBase()}/marcas`, options);
    return expectArray<FipeBrand>(await readJson(res, "as marcas"), "as marcas");
  };

  const data = await withFallback(fromPrimary, async () => {
    const base = fallbackBase();
    const res = await fetch(`${base}/marcas/v1/carros`, { cache: "no-store" });
    if (!res.ok) throw new FipeUnavailableError(`Fallback respondeu ${res.status}`, res.status);
    const list = expectArray<{ nome?: unknown; valor?: unknown }>(
      await readJson(res, "as marcas"),
      "as marcas"
    );
    return list
      .filter((b) => b?.nome && b?.valor)
      .map((b) => ({ codigo: String(b.valor), nome: String(b.nome) }));
  });

  data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return data;
}

export async function fetchFipeModels(
  brandId: string,
  options?: RequestInit
): Promise<FipeModel[]> {
  const fromPrimary = async (): Promise<FipeModel[]> => {
    const res = await fipeFetch(`${fipeBase()}/marcas/${brandId}/modelos`, options);
    const body = await readJson<{ modelos?: unknown }>(res, "os modelos");
    /*
     * The endpoint wraps the list in `modelos`. When the quota is gone it
     * returns `{ error }` instead — reading `.modelos` blindly is what crashed
     * the route with a TypeError and surfaced as a generic "502 Bad Gateway".
     */
    return expectArray<FipeModel>(body?.modelos, "os modelos");
  };

  const modelos = await withFallback(fromPrimary, async () => {
    const base = fallbackBase();
    const res = await fetch(`${base}/veiculos/v1/carros/${brandId}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new FipeUnavailableError(`Fallback respondeu ${res.status}`, res.status);
    const list = expectArray<{ modelo?: unknown; valor?: unknown }>(
      await readJson(res, "os modelos"),
      "os modelos"
    );
    return list
      .filter((m) => m?.modelo && m?.valor)
      .map((m) => ({ codigo: Number(m.valor), nome: String(m.modelo) }));
  });

  modelos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return modelos;
}

export async function fetchFipeYears(
  brandId: string,
  modelId: string,
  options?: RequestInit
): Promise<FipeYear[]> {
  const res = await fipeFetch(
    `${fipeBase()}/marcas/${brandId}/modelos/${modelId}/anos`,
    options
  );
  return expectArray<FipeYear>(await readJson(res, "os anos"), "os anos");
}

export async function fetchFipePrice(
  brandId: string,
  modelId: string,
  yearCode: string,
  options?: RequestInit
): Promise<FipePrice> {
  const res = await fipeFetch(
    `${fipeBase()}/marcas/${brandId}/modelos/${modelId}/anos/${yearCode}`,
    options
  );
  const body = await readJson<FipePrice | null>(res, "o preço");
  if (!body || typeof body !== "object" || !("Valor" in body)) {
    throw new FipeUnavailableError(
      "A Tabela FIPE devolveu o preço em formato inesperado."
    );
  }
  return body;
}
