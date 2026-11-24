import { NextResponse } from "next/server";
import { readData } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { CarPost, Match, User } from "@/lib/types";

export interface MatchView {
  match: Match;
  otherPost: CarPost;
  viewerPostId: string;
}

export interface OverviewResponse {
  user: User;
  posts: CarPost[];
  matchesByPost: Record<string, MatchView[]>;
  totalMatches: number;
  /** Absolute origin, so the client can build wa.me links identically to SSR. */
  origin: string;
}

/**
 * Everything the "my posts" / home dashboard needs, in one request.
 *
 * Before, those pages fetched every post in the system, filtered client-side,
 * then fired one match request per own post (N+1 round trips over the whole
 * match list). This builds the same view in a single pass on the server.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const allPosts = readData<CarPost>("posts");
  const postById = new Map(allPosts.map((p) => [p.id, p]));
  const myPosts = allPosts
    .filter((p) => p.userId === user.id)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const myPostIds = new Set(myPosts.map((p) => p.id));
  const matches = readData<Match>("matches");

  const matchesByPost: Record<string, MatchView[]> = {};
  for (const id of myPostIds) matchesByPost[id] = [];

  for (const match of matches) {
    // A match can touch two of the user's posts; count it for both sides.
    for (const viewerPostId of [match.postAId, match.postBId]) {
      if (!myPostIds.has(viewerPostId)) continue;

      const otherPostId =
        match.postAId === viewerPostId ? match.postBId : match.postAId;
      const otherPost = postById.get(otherPostId);
      if (!otherPost) continue;

      matchesByPost[viewerPostId].push({ match, otherPost, viewerPostId });
    }
  }

  let totalMatches = 0;
  for (const id of Object.keys(matchesByPost)) {
    matchesByPost[id].sort((a, b) => b.match.score - a.match.score);
    totalMatches += matchesByPost[id].length;
  }

  const body: OverviewResponse = {
    user,
    posts: myPosts,
    matchesByPost,
    totalMatches,
    origin: new URL(request.url).origin,
  };

  return NextResponse.json(body);
}
