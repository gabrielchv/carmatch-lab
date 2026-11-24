import { NextResponse } from "next/server";
import { getItemById } from "@/lib/db";
import { valuationForPost } from "@/lib/valuation";
import type { CarPost } from "@/lib/types";

/**
 * Public valuation for a listing.
 *
 * Deliberately no auth: the product thesis is that BOTH sides of a swap can
 * inspect the same defensible number. The result includes the full breakdown so
 * a client cannot display the number without its reasoning.
 */
export async function GET(
  _request: Request,
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

  const valuation = valuationForPost(post);

  return NextResponse.json({
    postId: post.id,
    car: {
      brand: post.car.brand,
      model: post.car.model,
      year: post.car.year,
      estimatedValue: post.car.estimatedValue,
      mileage: post.car.mileage,
    },
    valuation,
  });
}
