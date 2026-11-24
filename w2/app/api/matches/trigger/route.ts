import { NextResponse } from "next/server";
import { runMatching } from "@/lib/matching-run";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const newMatches = runMatching();
  return NextResponse.json({
    success: true,
    newMatches: newMatches.length,
  });
}
