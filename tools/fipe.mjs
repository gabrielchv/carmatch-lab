/**
 * FIPE API client for the seed generator.
 *
 * The app's own `lib/fipe-api.ts` runs inside Next.js. This is the standalone
 * equivalent used by the CLI, with a disk cache so re-running the seeder is
 * instant and does not hammer the public API (which rate-limits).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://parallelum.com.br/fipe/api/v1/carros";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, ".cache", "fipe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cacheFile(url) {
  const slug = url
    .replace(BASE, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return path.join(CACHE_DIR, `${slug || "root"}.json`);
}

/**
 * GET with cache + bounded retry.
 * 4xx is a client error and is not retried; 5xx and network errors are.
 */
export async function getJson(url, { retries = 4, useCache = true } = {}) {
  const file = cacheFile(url);
  if (useCache) {
    try {
      return JSON.parse(await readFile(file, "utf-8"));
    } catch {
      /* not cached yet */
    }
  }

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const data = await res.json();
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(file, JSON.stringify(data), "utf-8");
        return data;
      }
      if (res.status < 500) {
        throw new Error(`FIPE ${res.status} for ${url}`);
      }
      lastError = new Error(`FIPE ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    // Backoff: the public API throttles bursts.
    await sleep(700 * (attempt + 1));
  }
  throw lastError ?? new Error(`FIPE request failed: ${url}`);
}

export function listBrands() {
  return getJson(`${BASE}/marcas`);
}

export async function listModels(brandId) {
  const data = await getJson(`${BASE}/marcas/${brandId}/modelos`);
  return data.modelos ?? [];
}

export function listYears(brandId, modelId) {
  return getJson(`${BASE}/marcas/${brandId}/modelos/${modelId}/anos`);
}

export function getPrice(brandId, modelId, yearCode) {
  return getJson(`${BASE}/marcas/${brandId}/modelos/${modelId}/anos/${yearCode}`);
}

/** "R$ 45.321,00" -> 45321 */
export function parseBRL(value) {
  if (typeof value === "number") return value;
  const digits = String(value).replace(/[^\d,]/g, "").replace(",", ".");
  const n = Number.parseFloat(digits);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** FIPE year codes look like "2014-1" (model year + fuel). */
export const yearFromCode = (code) => Number.parseInt(String(code).split("-")[0], 10);

export const isDiesel = (code) => String(code).endsWith("-3");
