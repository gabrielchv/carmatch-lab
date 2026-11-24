import { NextResponse } from "next/server";
import { fetchFipeModels } from "@/lib/fipe-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");

  if (!brandId) {
    return NextResponse.json(
      { error: "Parâmetro brandId é obrigatório" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchFipeModels(brandId, { next: { revalidate: 86400 } });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Erro ao buscar modelos da Tabela FIPE" },
      { status: 502 }
    );
  }
}
