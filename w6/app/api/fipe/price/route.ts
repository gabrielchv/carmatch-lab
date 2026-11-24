import { NextResponse } from "next/server";
import { fetchFipePrice } from "@/lib/fipe-api";
import { unavailableBody } from "@/lib/fipe-route";

/**
 * The reference price for one year of one model.
 *
 * Deliberately has **no** snapshot fallback: this value fills the estimated
 * price of a listing, and a month-old number presented as today's FIPE would be
 * worse than an empty field the user fills in. A stale year list is harmless; a
 * stale price is money.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const modelId = searchParams.get("modelId");
  const yearCode = searchParams.get("yearCode");

  if (!brandId || !modelId || !yearCode) {
    return NextResponse.json(
      { error: "Parâmetros brandId, modelId e yearCode são obrigatórios" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchFipePrice(brandId, modelId, yearCode, {
      next: { revalidate: 86400 },
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(unavailableBody(), { status: 503 });
  }
}
