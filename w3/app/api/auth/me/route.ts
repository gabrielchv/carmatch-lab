import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * Who am I?
 *
 * Returns 200 with `user: null` when nobody is signed in, rather than a 401.
 * "Not signed in" is a valid answer to this question, not an error — and the
 * 401 fired a console error on every page load for every logged-out visitor,
 * which is most of them on a public marketplace.
 *
 * Callers check `data.user`; page-level guards redirect to /auth.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ?? null });
}
