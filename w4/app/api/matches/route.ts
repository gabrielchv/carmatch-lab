import { NextResponse } from "next/server";
import { readData } from "@/lib/db";
import type { Match } from "@/lib/types";

export async function GET() {
  const matches = readData<Match>("matches");
  return NextResponse.json({ matches });
}
