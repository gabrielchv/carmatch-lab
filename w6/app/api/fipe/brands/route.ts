import { NextResponse } from "next/server";
import { fetchFipeBrands } from "@/lib/fipe-api";
import {
  loadCatalogue,
  catalogueHeaders,
  unavailableBody,
} from "@/lib/fipe-route";

export async function GET() {
  try {
    const result = await loadCatalogue("brands", () =>
      fetchFipeBrands({ next: { revalidate: 86400 } })
    );
    return NextResponse.json(result.data, { headers: catalogueHeaders(result) });
  } catch {
    return NextResponse.json(unavailableBody(), { status: 503 });
  }
}
