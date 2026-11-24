import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/upload";

/**
 * Serve uploaded images from disk at request time.
 *
 * Why this exists: in production `/app/public/uploads` is a gcsfuse mount, and
 * Next's built-in `public/` handler only knows about the files present when the
 * instance booted. An image uploaded *after* boot 404s until the service is
 * redeployed — the user sees a broken photo in a listing they just published.
 *
 * Files that existed at boot are still served by the static handler; anything
 * newer falls through to this route, which reads the mount directly and always
 * sees the current contents.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // Only plain filenames. `basename` plus this pattern makes traversal
  // (`../`, absolute paths, URLs) impossible rather than merely unlikely.
  const name = path.basename(segments.join("/"));
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = path.join(UPLOAD_DIR, name);

  // Belt and braces: the resolved path must still live inside UPLOAD_DIR.
  if (!file.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(name).toLowerCase();

  // Allowlist, not a charset filter. Anything that is not a known image is not
  // served at all: the uploads directory is a bucket in production, so an
  // object placed there by other means must not become a downloadable file
  // with an attacker-chosen extension.
  const TYPES: Record<string, string> = {
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  const type = TYPES[ext];
  if (!type) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": type,
      "content-length": String(bytes.byteLength),
      // Uploaded filenames are UUIDs and never change contents.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
