import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConversationById } from "@/lib/chat";
import { readData } from "@/lib/db";
import type { CarPost, User } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = getConversationById(id, user.id);
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const posts = readData<CarPost>("posts");
  const users = readData<User>("users");
  const post = posts.find((p) => p.id === conversation.postId);
  const otherUserId = conversation.participantIds.find((id) => id !== user.id);
  const otherUser = users.find((u) => u.id === otherUserId);

  return NextResponse.json({
    conversation: {
      ...conversation,
      postTitle: post?.title ?? "Anúncio removido",
      postImage: post?.images?.[0] ?? null,
      otherUserName: otherUser?.name ?? "Usuário",
    },
  });
}
