import crypto from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Gate for the maintenance endpoints.
 *
 * They must never be reachable without an operator secret: `/api/debug/clear`
 * was an open wipe-everything endpoint. Returns a Response when the caller is
 * not allowed, or null when it is.
 */
export function debugGuard(request: Request): NextResponse | null {
  const expected = process.env.DEBUG_TOKEN;

  // No token configured → the endpoints are off, everywhere.
  if (!expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const provided = request.headers.get("x-debug-token") ?? "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
