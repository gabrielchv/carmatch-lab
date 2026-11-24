/**
 * Real car photos for the seed generator.
 *
 * Source: Wikimedia Commons. It is the only large photo set that gives us
 * (a) genuine photographs of real models, (b) a machine-readable licence, and
 * (c) no scraping. Every download is recorded in CREDITS.md with its licence
 * and source page, because that is the condition of reuse.
 *
 * Images are normalised to 1200x750 JPEG (16:10, the card aspect) with
 * ImageMagick, which also keeps every file well under the app's 6 MB upload
 * limit and guarantees the magic bytes the upload validator checks.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, ".cache", "photos");
const CREDITS = path.join(CACHE_DIR, "CREDITS.md");

const UA = "carmatch-lab-seeder/1.0 (local development demo)";

/** Words that mean "this photo is not the car". */
const NOISE = [
  "interior", "dashboard", "engine", "motor", "seat", "bank", "wheel",
  "badge", "logo", "emblem", "accident", "crash", "damage", "wreck",
  "diagram", "blueprint", "drawing", "patent", "map",
  // A race car is not a car someone swaps. These matched real searches
  // (TC2000 Cronos, rally Yaris) and would misrepresent the listing.
  "tc2000", "touring", "stock car", "rally", "racing", "racecar", "competi",
  "turismo", "formula", "kart", "drift", "safety car",
  // Unusable framing/quality.
  "blur", "cutout", "collage", "montage",
];

const GOOD_LICENCES = ["cc0", "public domain", "cc by 4.0", "cc by-sa 4.0", "cc by 3.0", "cc by-sa 3.0", "cc by 2.0", "cc by-sa 2.0"];

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const stripHtml = (s) => String(s ?? "").replace(/<[^>]*>/g, "").trim();

function scoreCandidate(title, brand, model) {
  const t = title.toLowerCase();
  const modelWords = model.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const brandWord = brand.toLowerCase().split(/\s+/).pop();

  let score = 0;
  if (brandWord && t.includes(brandWord)) score += 4;
  if (modelWords[0] && t.includes(modelWords[0])) score += 8;

  for (const word of NOISE) {
    if (t.includes(word)) score -= 30;
  }
  // A rear shot still shows the car, but a front/three-quarter view sells better.
  if (t.includes("rear") || t.includes("traseira")) score -= 6;

  return score;
}

export async function searchCommons(query, limit = 12) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrlimit: String(limit),
    gsrnamespace: "6",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "1400",
    format: "json",
    origin: "*",
  }).toString();

  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Commons search ${res.status}`);

  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  return Object.values(pages).map((page) => {
    const info = page.imageinfo?.[0] ?? {};
    const meta = info.extmetadata ?? {};
    return {
      title: page.title ?? "",
      url: info.thumburl || info.url,
      mime: info.mime,
      width: info.thumbwidth ?? info.width,
      licence: stripHtml(meta.LicenseShortName?.value) || "desconhecida",
      artist: stripHtml(meta.Artist?.value) || "desconhecido",
      page: info.descriptionurl || "",
    };
  });
}

async function normalise(srcPath, destPath) {
  // 16:10 centre crop matches the card and detail hero aspect in every version.
  await run("convert", [
    srcPath,
    "-auto-orient",
    "-resize", "1200x750^",
    "-gravity", "center",
    "-extent", "1200x750",
    "-strip",
    "-quality", "82",
    destPath,
  ]);
}

/**
 * Deterministic fallback so the seeder never produces a post without a photo:
 * a flat gradient tile carrying the model name. Honest — it reads as a
 * placeholder, not as a photograph of a car we do not have.
 */
async function placeholder(brand, model, year, destPath) {
  // Short labels: long FIPE names overflow a 1200px tile.
  const label = `${brand} ${model.split(" ").slice(0, 2).join(" ")}`.replace(/["'\\]/g, "");
  const sub = String(year);
  await run("convert", [
    "-size", "1200x750",
    "xc:#f1f5f9",
    "-gravity", "center",
    "-fill", "#64748b",
    "-pointsize", "58",
    "-annotate", "+0-40", label,
    "-fill", "#94a3b8",
    "-pointsize", "34",
    "-annotate", "+0+40", sub,
    "-fill", "#cbd5e1",
    "-pointsize", "26",
    "-annotate", "+0+130", "sem foto disponível",
    destPath,
  ]);
}

/**
 * Fetch up to `count` photos for one car. Cached by car slug, so repeated
 * runs across the five versions download once.
 */
export async function fetchCarPhotos(car, { count = 2, log = () => {} } = {}) {
  const slug = slugify(`${car.brand} ${car.model} ${car.year}`);
  const dir = path.join(CACHE_DIR, slug);
  await mkdir(dir, { recursive: true });

  // Reuse anything already normalised for this car — but a placeholder is a
  // failure we want to retry, not a result. Leaving one cached meant every
  // later run (and all five versions) kept the drawn tile forever.
  const placeholderMarker = path.join(dir, ".placeholder");
  let cachedPlaceholder = false;
  try {
    await stat(placeholderMarker);
    cachedPlaceholder = true;
  } catch {
    /* no marker: cache is genuine */
  }

  const existing = [];
  if (!cachedPlaceholder) {
    for (let i = 0; i < count; i++) {
      const file = path.join(dir, `${i + 1}.jpg`);
      try {
        await stat(file);
        existing.push(file);
      } catch {
        break;
      }
    }
    if (existing.length >= count) return existing;
  }

  // "GM - Chevrolet" and "VW - VolksWagen" are FIPE display names, not what
  // people (or Commons) call the marque. Search on the real name.
  const marque = String(car.brand).includes("-")
    ? String(car.brand).split("-").pop().trim()
    : car.brand;
  const query = `${marque} ${car.model.split(" ")[0]} ${car.year}`;
  const marqueModel = `${marque} ${car.model.split(" ")[0]}`;
  let candidates = [];
  for (const attempt of [query, marqueModel]) {
    try {
      const found = await searchCommons(attempt, 14);
      if (found.length) {
        candidates = found;
        break;
      }
    } catch (err) {
      log(`    ! Commons: ${err.message}`);
    }
  }

  const ranked = candidates
    .filter((c) => c.url && (c.mime === "image/jpeg" || c.mime === "image/png"))
    .filter((c) => GOOD_LICENCES.some((l) => c.licence.toLowerCase().includes(l)))
    .map((c) => ({ ...c, score: scoreCandidate(c.title, car.brand, car.model) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const files = [...existing];

  for (const candidate of ranked) {
    if (files.length >= count) break;
    const index = files.length;
    // Keep the downloaded bytes in their own directory with the RIGHT extension:
    // ImageMagick decides the format from the suffix, and a `.raw` file is read
    // as a camera RAW (DNG), which fails on every ordinary JPEG download.
    const rawDir = path.join(dir, "raw");
    await mkdir(rawDir, { recursive: true });
    const ext = candidate.mime === "image/png" ? "png" : "jpg";
    const raw = path.join(rawDir, `${index + 1}.${ext}`);
    const out = path.join(dir, `${index + 1}.jpg`);

    try {
      const res = await fetch(candidate.url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) continue;

      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 8_000) continue; // icon or error page

      await writeFile(raw, bytes);
      await normalise(raw, out);

      files.push(out);
      await rm(placeholderMarker, { force: true }).catch(() => {});
      await appendCredit({
        car: `${car.brand} ${car.model} ${car.year}`,
        title: candidate.title,
        licence: candidate.licence,
        artist: candidate.artist,
        page: candidate.page,
        file: path.relative(CACHE_DIR, out),
      });
      log(`    foto ${index + 1}: ${candidate.title.slice(0, 62)} [${candidate.licence}]`);
    } catch (err) {
      log(`    ! foto: ${err.message}`);
    }
  }

  // Only when we found no real photo at all do we draw one — and mark the
  // directory so a later run tries again. Padding a real photo with a fake
  // second one would put a fake image in the gallery.
  if (files.length === 0) {
    await writeFile(placeholderMarker, new Date().toISOString(), "utf-8").catch(() => {});
  }
  const padTarget = files.length === 0 ? count : files.length;
  while (files.length < padTarget) {
    const out = path.join(dir, `${files.length + 1}.jpg`);
    try {
      await placeholder(car.brand, car.model, car.year, out);
      files.push(out);
      await appendCredit({
        car: `${car.brand} ${car.model} ${car.year}`,
        title: "placeholder gerado localmente",
        licence: "n/a (gerado)",
        artist: "carmatch-lab",
        page: "",
        file: path.relative(CACHE_DIR, out),
      });
    } catch {
      break;
    }
  }

  return files;
}

async function appendCredit(entry) {
  let header = "";
  try {
    await readFile(CREDITS, "utf-8");
  } catch {
    header =
      "# Créditos das imagens\n\n" +
      "Fotos obtidas do Wikimedia Commons para uso local em demonstração.\n" +
      "Cada linha traz carro, arquivo original, licença e autor.\n\n" +
      "| Carro | Arquivo Commons | Licença | Autor | Link |\n|---|---|---|---|---|\n";
  }
  const line = `| ${entry.car} | ${entry.title.replace(/\|/g, "/")} | ${entry.licence} | ${entry.artist.replace(/\|/g, "/").slice(0, 60)} | ${entry.page} |\n`;
  await writeFile(CREDITS, header + line, { flag: header ? "w" : "a" }).catch(async () => {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CREDITS, header + line, { flag: header ? "w" : "a" });
  });
}

export const photoCacheDir = CACHE_DIR;
