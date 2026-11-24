import { NextResponse } from "next/server";
import { fetchFipeYears } from "@/lib/fipe-api";

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
    const data = await fetchFipeYears(brandId, modelId, { next: { revalidate: 86400 } });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Erro ao buscar anos da Tabela FIPE" },
      { status: 502 }
    );
  }
}
