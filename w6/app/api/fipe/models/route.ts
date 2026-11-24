import { NextResponse } from "next/server";
import { fetchFipeModels, type FipeModel } from "@/lib/fipe-api";
import { simplifyModels, groupByLine } from "@/lib/car-simplify";
import {
  loadCatalogue,
  catalogueHeaders,
  unavailableBody,
} from "@/lib/fipe-route";

/**
 * FIPE models for a brand.
 *
 * `?simplified=1` answers a different question from the raw list: not "which of
 * these 557 entries is my car" but "which of these ~40 lines is my car, and
 * which engine should I pick inside it". The raw list stays available because
 * the listing form's FIPE codes and the year/price lookups key off real model
 * codes — simplified options carry the representative codes in `codes`.
 *
 * Both shapes come from one saved copy of the raw list, so a brand fetched once
 * keeps working while the upstream quota is exhausted.
 */
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
    const result = await loadCatalogue<FipeModel[]>(`models-${brandId}`, () =>
      fetchFipeModels(brandId, { next: { revalidate: 86400 } })
    );
    const models = result.data;
    const headers = catalogueHeaders(result);

    if (searchParams.get("simplified") !== "1") {
      return NextResponse.json(models, { headers });
    }

    const simplified = simplifyModels(models);
    const lines = groupByLine(simplified);

    return NextResponse.json(
      {
        brandId,
        stats: {
          before: models.length,
          after: simplified.length,
          lines: lines.length,
        },
        // `stale` lets the picker say the catalogue is a saved copy instead of
        // silently presenting it as current.
        stale: result.stale,
        fetchedAt: result.fetchedAt,
        lines: lines.map((line) => ({
          key: line.key,
          name: line.name,
          versions: line.versions,
        })),
      },
      { headers }
    );
  } catch {
    return NextResponse.json(unavailableBody(), { status: 503 });
  }
}
