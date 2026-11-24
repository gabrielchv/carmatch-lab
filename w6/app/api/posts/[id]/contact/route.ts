import { NextResponse } from "next/server";
import { readData, getItemById } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildContact } from "@/lib/contact";
import type { CarPost, Match, User } from "@/lib/types";

/**
 * The WhatsApp payload for one listing, computed for the current viewer.
 *
 * Server-side because it needs the viewer's own listings and the match set;
 * doing it here keeps the client from shipping every match to build one link.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json({ error: "Anúncio não encontrado" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Entre para falar no WhatsApp", code: "login-required" },
      { status: 401 }
    );
  }

  if (post.userId === user.id) {
    return NextResponse.json(
      { error: "Este anúncio é seu", code: "self" },
      { status: 400 }
    );
  }

  const owner = getItemById<User>("users", post.userId);
  const myPosts = readData<CarPost>("posts").filter(
    (p) => p.userId === user.id && p.isActive !== false
  );

  // Only matches touching one of my posts can produce a match message.
  const myPostIds = new Set(myPosts.map((p) => p.id));
  const matches = readData<Match>("matches").filter(
    (m) => myPostIds.has(m.postAId) || myPostIds.has(m.postBId)
  );

  const origin = new URL(request.url).origin;
  const contact = buildContact({
    target: post,
    ownerName: owner?.name,
    myPosts,
    matches,
    origin,
  });

  return NextResponse.json({
    ...contact,
    ownerName: owner?.name ?? "Dono do anúncio",
    ownerWhatsapp: post.contactInfo?.whatsapp ?? null,
  });
}
