import { NextResponse } from "next/server";
import { getItemById } from "@/lib/db";
import type { CarPost } from "@/lib/types";
import {
  PRECO_DISCLAIMER,
  parseExtrasParam,
  recommendedSplit,
  valuate,
} from "@/lib/preco";

/**
 * GET /api/preco/[postId]
 *
 * The valuation of one listing, with its full breakdown, so the number can be
 * checked outside the React tree (and by anyone who wants to build on it).
 *
 * Optional query params:
 *   · `extras=singleOwner,fullServiceHistory` — owner-declared condition items.
 *   · `against=<postId>` — also return the recommended settlement between the
 *     two listings, with the same sign convention as `Match.suggestedCashFromA`
 *     (positive = first post pays the second).
 *
 * Reads the JSON store, so never cached.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;

  const post = getItemById<CarPost>("posts", postId);
  if (!post) {
    return NextResponse.json(
      { error: "Anúncio não encontrado" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const extras = parseExtrasParam(searchParams.get("extras"));
  const valuation = valuate({ ...post.car, extras });

  const againstId = searchParams.get("against");
  let against:
    | {
        postId: string;
        car: CarPost["car"];
        valuation: ReturnType<typeof valuate>;
        fromFirstToSecond: number;
        low: number;
        high: number;
        reason: string;
      }
    | null = null;

  if (againstId) {
    const other = getItemById<CarPost>("posts", againstId);
    if (!other) {
      return NextResponse.json(
        { error: "Anúncio de comparação não encontrado" },
        { status: 404 }
      );
    }

    const split = recommendedSplit(post, other);

    against = {
      postId: other.id,
      car: other.car,
      valuation: split.valuationB,
      fromFirstToSecond: split.fromAtoB,
      low: split.low,
      high: split.high,
      reason: split.reason,
    };
  }

  return NextResponse.json({
    postId: post.id,
    car: post.car,
    valuation,
    against,
    disclaimer: PRECO_DISCLAIMER,
  });
}
