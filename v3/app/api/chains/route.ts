import { NextResponse } from "next/server";
import { readData } from "@/lib/db";
import {
  detectChains,
  MAX_CHAIN_LENGTH,
  MAX_CHAINS,
  MAX_SEARCH_STEPS,
  MIN_CHAIN_LENGTH,
} from "@/lib/chains";
import type { CarPost, User } from "@/lib/types";

/**
 * Public read of swap chains.
 *
 * Only active posts and public owner identity (id + name) are exposed —
 * never `data/matches.json`, which records private pairwise relationships.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const posts = readData<CarPost>("posts").filter((post) => post.isActive);
  const users = readData<User>("users");
  const ownerById = new Map(
    users.map((user) => [user.id, { id: user.id, name: user.name }])
  );

  const chains = detectChains(posts).map((chain) => ({
    ...chain,
    owners: Object.fromEntries(
      chain.posts.map((post) => [post.id, ownerById.get(post.userId) ?? null])
    ),
  }));

  return NextResponse.json({
    chains,
    /** Chains whose cash legs close — what the badge/navbar should count. */
    count: chains.filter((chain) => chain.feasible).length,
    /** Every directed ring found, including ones with unbalanced cash. */
    detected: chains.length,
    limits: {
      minLength: MIN_CHAIN_LENGTH,
      maxLength: MAX_CHAIN_LENGTH,
      maxSteps: MAX_SEARCH_STEPS,
      maxChains: MAX_CHAINS,
    },
  });
}
