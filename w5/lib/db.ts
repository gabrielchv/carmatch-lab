import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.CARMATCH_DATA_DIR
  ? path.resolve(process.env.CARMATCH_DATA_DIR)
  : path.join(process.cwd(), "data");

function filePath(filename: string): string {
  return path.join(DATA_DIR, `${filename}.json`);
}

export function readData<T>(filename: string): T[] {
  const fp = filePath(filename);
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, "utf-8");
  if (!raw.trim()) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    // Never silently return [] on a corrupt file: the next write would then
    // overwrite real data with a single record. Fail loudly instead.
    throw new Error(
      `Corrupt data file ${filename}.json — refusing to continue. Inspect or restore it.`
    );
  }
}

/**
 * Writes via a temp file in the same directory and an atomic rename.
 *
 * The original wrote in place, so a crash (or a Cloud Run instance being
 * killed) mid-write left a truncated JSON file — which then read back as
 * "[]" and was overwritten on the next save. rename(2) is atomic on both
 * local disks and gcsfuse-mounted buckets, so readers see either the old
 * file or the new one, never half of either.
 */
export function writeData<T>(filename: string, data: T[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const fp = filePath(filename);
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;

  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.renameSync(tmp, fp);
  } catch (err) {
    // gcsfuse can refuse rename across some mount configurations; fall back
    // to a direct write rather than losing the update.
    try {
      fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf-8");
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
    if (!fs.existsSync(fp)) throw err;
  }
}

export function addItem<T extends { id: string }>(
  filename: string,
  item: T
): T {
  const items = readData<T>(filename);
  items.push(item);
  writeData(filename, items);
  return item;
}

export function updateItem<T extends { id: string }>(
  filename: string,
  id: string,
  partial: Partial<T>
): T | null {
  const items = readData<T>(filename);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  items[index] = { ...items[index], ...partial };
  writeData(filename, items);
  return items[index];
}

export function deleteItem<T extends { id: string }>(
  filename: string,
  id: string
): boolean {
  const items = readData<T>(filename);
  const filtered = items.filter((item) => item.id !== id);
  if (filtered.length === items.length) return false;
  writeData(filename, filtered);
  return true;
}

export function getItemById<T extends { id: string }>(
  filename: string,
  id: string
): T | undefined {
  const items = readData<T>(filename);
  return items.find((item) => item.id === id);
}

export function clearData(filename: string): void {
  writeData(filename, []);
}
