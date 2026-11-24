import { NextResponse } from "next/server";
import { readData, getItemById } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { CarPost, Match } from "@/lib/types";

/**
 * Matches for one post.
 *
 * The original served this to anyone, for any post id. A match is a
 * relationship between two private listings (one of which may be someone
 * else's), so it is now limited to the owner of `id`.
 *
 * `viewerPostId` is echoed back so the UI can tell which side of the match the
 * viewer is on — the original UI guessed, and got the cash direction wrong.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.userId !== user.id) {
    return NextResponse.json({ error: "Proibido" }, { status: 403 });
  }

  const allMatches = readData<Match>("matches");
  const postMatches = allMatches.filter(
    (m) => m.postAId === id || m.postBId === id
  );

  const matchesWithPosts = postMatches.map((m) => {
    const otherPostId = m.postAId === id ? m.postBId : m.postAId;
    const otherPost = getItemById<CarPost>("posts", otherPostId);
    return {
      match: m,
      otherPost: otherPost ?? null,
      viewerPostId: id,
    };
  });

  // Best matches first; drop pairs whose other listing disappeared.
  matchesWithPosts.sort((a, b) => b.match.score - a.match.score);

  return NextResponse.json({
    matches: matchesWithPosts.filter((m) => m.otherPost !== null),
  });
}
