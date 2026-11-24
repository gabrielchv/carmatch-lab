import { NextResponse } from "next/server";
import { readData, getItemById } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildContact, findMyMatchWith } from "@/lib/contact";
import { pricedMatchContact } from "@/lib/preco-message";
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
  let contact = buildContact({
    target: post,
    ownerName: owner?.name,
    myPosts,
    matches,
    origin,
  });

  /*
   * When there is a real match, the WhatsApp message must carry the price:
   * both fair values plus the recommended settlement and its justification.
   *
   * `buildContact` (lib/contact.ts) stays the single source of truth for the
   * base message; lib/preco-message.ts wraps it, so the endpoint and the card
   * cannot drift apart on who pays whom. If no match is found we leave the
   * interest message exactly as it was.
   */
  if (contact.matched) {
    const found = findMyMatchWith(post.id, myPosts, matches);
    if (found) {
      const priced = pricedMatchContact({
        match: found.match,
        myPost: found.myPost,
        targetPost: post,
        ownerName: owner?.name,
        origin,
      });

      contact = { ...contact, message: priced.message, href: priced.href };
    }
  }

  return NextResponse.json({
    ...contact,
    ownerName: owner?.name ?? "Dono do anúncio",
    ownerWhatsapp: post.contactInfo?.whatsapp ?? null,
  });
}
