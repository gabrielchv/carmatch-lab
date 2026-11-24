import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getConversationsForUser,
  createManualConversation,
} from "@/lib/chat";
import { readData } from "@/lib/db";
import type { CarPost, User } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const conversations = getConversationsForUser(user.id);
  const posts = readData<CarPost>("posts");
  const users = readData<User>("users");

  const enriched = conversations.map((conv) => {
    const post = posts.find((p) => p.id === conv.postId);
    const otherUserId = conv.participantIds.find((id) => id !== user.id);
    const otherUser = users.find((u) => u.id === otherUserId);

    return {
      id: conv.id,
      postId: conv.postId,
      postTitle: post?.title ?? "Anúncio removido",
      postImage: post?.images?.[0] ?? null,
      otherUserId: otherUserId ?? "",
      otherUserName: otherUser?.name ?? "Usuário",
      matchId: conv.matchId ?? null,
      lastMessageAt: conv.updatedAt,
      createdAt: conv.createdAt,
    };
  });

  return NextResponse.json({ conversations: enriched });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { postId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.postId) {
    return NextResponse.json(
      { error: "postId is required" },
      { status: 400 }
    );
  }

  const posts = readData<CarPost>("posts");
  const post = posts.find((p) => p.id === body.postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Don't allow chatting with yourself
  if (post.userId === user.id) {
    return NextResponse.json(
      { error: "Cannot chat with yourself" },
      { status: 400 }
    );
  }

  const conversation = createManualConversation(body.postId, post.userId, user.id);

  return NextResponse.json({ conversation }, { status: 201 });
}
