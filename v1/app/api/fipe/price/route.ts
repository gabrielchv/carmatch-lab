import { NextResponse } from "next/server";
import { fetchFipePrice } from "@/lib/fipe-api";

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
    const data = await fetchFipePrice(brandId, modelId, yearCode, { next: { revalidate: 86400 } });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Erro ao buscar preço na Tabela FIPE" },
      { status: 502 }
    );
  }
}
