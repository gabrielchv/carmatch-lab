import { NextResponse } from "next/server";
import { clearData } from "@/lib/db";
import { debugGuard } from "@/lib/debug-guard";

/**
 * Wipes every collection.
 *
 * This was a completely unauthenticated POST — anyone who guessed
 * `/api/debug/clear` could erase the production database. It now requires a
 * `DEBUG_TOKEN` secret sent as `x-debug-token`, and is disabled entirely when
 * the variable is unset (including in production).
 */
export async function POST(request: Request) {
  const denied = debugGuard(request);
  if (denied) return denied;

  clearData("users");
  clearData("posts");
  clearData("matches");
  clearData("conversations");
  clearData("messages");

  return NextResponse.json({ success: true });
}
