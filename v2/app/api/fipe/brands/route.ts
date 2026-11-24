import { NextResponse } from "next/server";
import { fetchFipeBrands } from "@/lib/fipe-api";

export async function GET() {
  try {
    const data = await fetchFipeBrands({ next: { revalidate: 86400 } });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Erro ao buscar marcas da Tabela FIPE" },
      { status: 502 }
    );
  }
}
