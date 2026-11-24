import { NextResponse } from "next/server";
import { getItemById, updateItem } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  DOSSIER_ITEMS,
  dossierScore,
  isDossierKey,
  listingTrust,
} from "@/lib/confianca";
import type { CarPost, User, VehicleDossier } from "@/lib/types";

/**
 * The vehicle dossier of one listing.
 *
 * GET  — public read: the badge on the listing page must work for a visitor
 *        who has not signed in, and it contains no personal data (only which
 *        documents the owner confirmed). It is also what the detail page uses
 *        to draw the badge, so the page and the API can never disagree.
 * POST — owner-only toggle of one item.
 *
 * Body: { item: DossierKey, confirmed?: boolean }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json(
      { error: "Anúncio não encontrado." },
      { status: 404 }
    );
  }

  const owner = getItemById<User>("users", post.userId);

  return NextResponse.json({
    postId: post.id,
    dossier: post.dossier ?? {},
    dossierScore: dossierScore(post),
    trust: listingTrust(post, owner),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Entre para editar o dossiê do veículo.", code: "login-required" },
      { status: 401 }
    );
  }

  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json(
      { error: "Anúncio não encontrado." },
      { status: 404 }
    );
  }

  if (post.userId !== user.id) {
    return NextResponse.json(
      {
        error: "Só o dono do anúncio pode confirmar o dossiê.",
        code: "not-owner",
      },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido.", code: "invalid_body" },
      { status: 400 }
    );
  }

  const { item, confirmed } = (body ?? {}) as {
    item?: unknown;
    confirmed?: unknown;
  };

  if (typeof item !== "string" || !isDossierKey(item)) {
    return NextResponse.json(
      {
        error: "Item de dossiê inválido.",
        code: "invalid_item",
        allowed: DOSSIER_ITEMS.map((entry) => entry.key),
      },
      { status: 400 }
    );
  }

  if (confirmed !== undefined && typeof confirmed !== "boolean") {
    return NextResponse.json(
      { error: "O campo confirmed deve ser booleano.", code: "invalid_confirmed" },
      { status: 400 }
    );
  }

  const current: VehicleDossier = post.dossier ?? {};
  const nextValue =
    typeof confirmed === "boolean" ? confirmed : current[item] !== true;
  const dossier: VehicleDossier = { ...current, [item]: nextValue };

  const updated = updateItem<CarPost>("posts", id, { dossier });
  if (!updated) {
    return NextResponse.json(
      { error: "Anúncio não encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    item,
    confirmed: nextValue,
    dossier,
    dossierScore: dossierScore(updated),
    trust: listingTrust(updated, user),
  });
}
