import fs from "node:fs";
import path from "node:path";
import { generateId } from "./utils";

/** Uploads land next to the app (or on the mounted bucket in production). */
export const UPLOAD_DIR = process.env.CARMATCH_UPLOAD_DIR
  ? path.resolve(process.env.CARMATCH_UPLOAD_DIR)
  : path.join(process.cwd(), "public", "uploads");

const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 MB
const MAX_IMAGES_PER_POST = 8;

/**
 * Only real bitmap images are accepted.
 *
 * The original saved whatever was uploaded, keeping the client-supplied
 * extension, straight into `public/uploads/`. That let anyone publish an
 * `.html` or `.svg` file on the app's own origin — stored XSS against every
 * visitor, and unbounded disk use. Extension, declared type and the actual
 * magic bytes now all have to agree before anything is written.
 */
const ALLOWED: Record<string, { mime: string[]; magic: number[][] }> = {
  jpg: {
    mime: ["image/jpeg"],
    magic: [[0xff, 0xd8, 0xff]],
  },
  jpeg: {
    mime: ["image/jpeg"],
    magic: [[0xff, 0xd8, 0xff]],
  },
  png: {
    mime: ["image/png"],
    magic: [[0x89, 0x50, 0x4e, 0x47]],
  },
  webp: {
    mime: ["image/webp"],
    magic: [
      [0x52, 0x49, 0x46, 0x46], // "RIFF"
    ],
  },
};

export interface SavedImage {
  filename: string;
}

export class UploadError extends Error {}

function matchesMagic(buffer: Buffer, magic: number[][]): boolean {
  return magic.some((sig) =>
    sig.every((byte, i) => buffer.length > i && buffer[i] === byte)
  );
}

/** WEBP needs "RIFF" at 0 and "WEBP" at 8 — guard both. */
function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

export async function saveImages(
  files: File[],
  limit = MAX_IMAGES_PER_POST
): Promise<SavedImage[]> {
  const accepted = files.filter((f) => f && f.size > 0);

  if (accepted.length > limit) {
    throw new UploadError(`Envie no máximo ${limit} fotos por anúncio.`);
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const saved: SavedImage[] = [];

  for (const file of accepted) {
    if (file.size > MAX_FILE_BYTES) {
      throw new UploadError(
        `A foto "${file.name}" tem mais de 6 MB. Comprima antes de enviar.`
      );
    }

    const ext = (path.extname(file.name).replace(".", "") || "").toLowerCase();
    const rule = ALLOWED[ext];
    if (!rule) {
      throw new UploadError(
        `Formato não suportado em "${file.name}". Use JPG, PNG ou WEBP.`
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (rule.mime.length && file.type && !rule.mime.includes(file.type)) {
      throw new UploadError(`O arquivo "${file.name}" não é uma imagem válida.`);
    }

    const magicOk = ext === "webp" ? isWebp(buffer) : matchesMagic(buffer, rule.magic);
    if (!magicOk) {
      throw new UploadError(`O arquivo "${file.name}" não é uma imagem válida.`);
    }

    // Generate the name ourselves — never trust the client's.
    const safeExt = ext === "jpeg" ? "jpg" : ext;
    const filename = `${generateId()}.${safeExt}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    saved.push({ filename });
  }

  return saved;
}

export function deleteUpload(filename: string): void {
  // Reject traversal outright; filenames are always plain basenames.
  const base = path.basename(filename);
  const fp = path.join(UPLOAD_DIR, base);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}
