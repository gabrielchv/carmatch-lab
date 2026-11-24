import { FipeUnavailableError } from "./fipe-api";
import { readSnapshot, writeSnapshot } from "./fipe-snapshot";

/**
 * Shared plumbing for the FIPE routes: try the service, keep a copy, and fall
 * back to that copy when the service is out.
 *
 * The catalogue is a free third-party API with a hard quota. When it answers
 * 429, every brand the app has not fetched before stops working — the exact
 * failure the user hit on VW and Ford. A car listing app that cannot name a car
 * is unusable, so the last known catalogue is served instead, explicitly marked
 * as such so nothing pretends it is current.
 */

export interface CatalogueResult<T> {
  data: T;
  /** True when upstream failed and this came from the saved copy. */
  stale: boolean;
  /** ISO timestamp of the fetch that produced the copy, when stale. */
  fetchedAt?: string;
}

/** The catalogue is unavailable and there is no copy to fall back on. */
export class CatalogueUnavailableError extends Error {
  constructor(readonly cause?: unknown) {
    super("A Tabela FIPE está temporariamente indisponível.");
    this.name = "CatalogueUnavailableError";
  }
}

/**
 * Read a catalogue slice, saving what came back.
 *
 * @param key snapshot name — must match fipe-snapshot's safe-key pattern
 * @param load the upstream call
 */
export async function loadCatalogue<T>(
  key: string,
  load: () => Promise<T>
): Promise<CatalogueResult<T>> {
  try {
    const data = await load();
    writeSnapshot(key, data);
    return { data, stale: false };
  } catch (err) {
    /*
     * Only an outage earns a fallback. A 404 means the brand/model genuinely
     * does not exist, and answering that from a snapshot would invent a car.
     */
    if (err instanceof FipeUnavailableError && err.status === 404) {
      throw new CatalogueUnavailableError(err);
    }

    const snapshot = readSnapshot<T>(key);
    if (snapshot) {
      return { data: snapshot.data, stale: true, fetchedAt: snapshot.fetchedAt };
    }
    throw new CatalogueUnavailableError(err);
  }
}

/** Headers that tell the client (and a curious human) where the data came from. */
export function catalogueHeaders(result: CatalogueResult<unknown>): Record<string, string> {
  const headers: Record<string, string> = {
    "x-fipe-source": result.stale ? "snapshot" : "live",
  };
  if (result.fetchedAt) headers["x-fipe-fetched-at"] = result.fetchedAt;
  return headers;
}

/** The body for "there is no catalogue and no copy". Never pretends success. */
export function unavailableBody() {
  return {
    error: "A Tabela FIPE está temporariamente indisponível.",
    hint:
      "A API pública da FIPE limita as requisições. Isso costuma passar em alguns minutos.",
    code: "fipe_unavailable",
    retryable: true,
  };
}
