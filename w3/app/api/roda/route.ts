import { NextResponse } from "next/server";
import { readData } from "@/lib/db";
import {
  countRingsFeaturingCar,
  findRings,
  type RodaRing,
} from "@/lib/roda";
import type { CarPost, User } from "@/lib/types";

/**
 * Public ring feed.
 *
 * Rings are read-only, derived data, so there is nothing to authenticate and
 * nothing to persist: the engine runs over the active listings on every request
 * and the response is enriched with owner names and WhatsApp numbers (the same
 * contact data already exposed by `GET /api/posts`).
 *
 * `?summary=1` returns counts only. The navbar and the onboarding hint poll it
 * on every page, and shipping every ring just to render a badge would be waste.
 */

// The JSON store changes outside Next's build graph, so never serve a cached
// ring list after a listing is added, edited or deactivated.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const posts = readData<CarPost>("posts").filter((post) => post.isActive !== false);
  const result = findRings(posts);

  if (searchParams.get("summary") === "1") {
    const brand = searchParams.get("carBrand")?.trim() ?? "";
    const model = searchParams.get("carModel")?.trim() ?? "";
    const featuring =
      brand && model
        ? countRingsFeaturingCar(result.rings, { brand, model })
        : null;

    return NextResponse.json({
      count: result.rings.length,
      bySize: result.stats.bySize,
      featuringCar: featuring,
      stats: result.stats,
    });
  }

  const usersById = new Map(readData<User>("users").map((user) => [user.id, user]));
  const postsById = new Map(posts.map((post) => [post.id, post]));

  const rings: RodaRing[] = result.rings.map((ring) => ({
    ...ring,
    participants: ring.participants.map((participant) => {
      const owner = usersById.get(participant.userId);
      const post = postsById.get(participant.postId);
      return {
        ...participant,
        ownerName: owner?.name ?? "Anunciante",
        // The listing's own contact number wins: that is the number the owner
        // chose to publish for this specific car.
        ownerWhatsapp:
          post?.contactInfo?.whatsapp ?? owner?.whatsapp ?? null,
      };
    }),
  }));

  return NextResponse.json({
    rings,
    count: rings.length,
    stats: result.stats,
  });
}
