import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed-data";
import { debugGuard } from "@/lib/debug-guard";

/** Seeding rewrites the whole database, so it is gated like `/clear`. */
export async function POST(request: Request) {
  const denied = debugGuard(request);
  if (denied) return denied;

  try {
    const result = await seedDatabase();
    return NextResponse.json({
      success: true,
      users: result.users.length,
      posts: result.posts.length,
      matches: result.matchCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    );
  }
}
