import { NextResponse } from "next/server";
import { fetchFipeYears, type FipeYear } from "@/lib/fipe-api";
import {
  loadCatalogue,
  catalogueHeaders,
  unavailableBody,
} from "@/lib/fipe-route";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const modelId = searchParams.get("modelId");

  if (!brandId || !modelId) {
    return NextResponse.json(
      { error: "Parâmetros brandId e modelId são obrigatórios" },
      { status: 400 }
    );
  }

  try {
    const result = await loadCatalogue<FipeYear[]>(`anos-${brandId}-${modelId}`, () =>
      fetchFipeYears(brandId, modelId, { next: { revalidate: 86400 } })
    );
    return NextResponse.json(result.data, { headers: catalogueHeaders(result) });
  } catch {
    return NextResponse.json(unavailableBody(), { status: 503 });
  }
}
