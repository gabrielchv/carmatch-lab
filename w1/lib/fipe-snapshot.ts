import fs from "node:fs";
import path from "node:path";

/**
 * A local copy of the FIPE catalogue, written whenever a fetch succeeds.
 *
 * The catalogue is a third-party service on a free quota. When it answers 429,
 * every brand the app has never seen becomes unusable — which is what the user
 * saw on VW and Ford. A listing app that cannot name a car is dead, so the last
 * known catalogue is kept on disk and served when the service is out.
 *
 * This is deliberately *not* a cache that expires: staleness is far cheaper
 * than an empty picker. Each entry records when it was captured so the UI can
 * say so instead of pretending it is current.
 */

/** Resolved per call: tests point it at a temp dir, and a container mounts one. */
function cacheDir(): string {
  const dataDir = process.env.CARMATCH_DATA_DIR
    ? path.resolve(process.env.CARMATCH_DATA_DIR)
    : path.join(process.cwd(), "data");
  return path.join(dataDir, "fipe-cache");
}

/** Only our own keys: no slashes, no traversal. */
const SAFE_KEY = /^[a-z0-9-]{1,40}$/;

export interface Snapshot<T> {
  data: T;
  /** ISO timestamp of the successful fetch that produced this copy. */
  fetchedAt: string;
}

const filePath = (key: string) => path.join(cacheDir(), `${key}.json`);

/**
 * Read the last good copy.
 *
 * Returns null when there is none, when the file is corrupt, or when the key is
 * not one of ours — a broken snapshot must degrade to "no snapshot", never to a
 * crash on top of the outage it was meant to soften.
 */
export function readSnapshot<T>(key: string): Snapshot<T> | null {
  if (!SAFE_KEY.test(key)) return null;
  try {
    const raw = fs.readFileSync(filePath(key), "utf-8");
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (!parsed || !("data" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save the last good copy.
 *
 * Best effort by design: a read-only filesystem (a container without a writable
 * volume) must not turn a successful FIPE fetch into a failed request. The
 * write is atomic — temp file plus rename — so a killed process cannot leave a
 * truncated snapshot that would later be served as real data.
 */
export function writeSnapshot(key: string, data: unknown): void {
  if (!SAFE_KEY.test(key)) return;
  try {
    const dir = cacheDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const target = filePath(key);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    const payload: Snapshot<unknown> = {
      data,
      fetchedAt: new Date().toISOString(),
    };
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf-8");
    fs.renameSync(tmp, target);
  } catch {
    /* leitura somente: seguir sem snapshot é melhor que falhar a requisição */
  }
}

/** Age of a snapshot in whole days, for an honest "de <data>" message. */
export function snapshotAgeDays(snapshot: Snapshot<unknown>): number {
  const then = Date.parse(snapshot.fetchedAt);
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}
