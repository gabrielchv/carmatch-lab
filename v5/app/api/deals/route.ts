import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createDealForUser,
  getDealViewForUser,
  listDealViewsForUser,
} from "@/lib/deal";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  return NextResponse.json({ deals: listDealViewsForUser(user.id) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Informe um matchId ou os dois anúncios." },
      { status: 400 }
    );
  }

  const raw = body as Record<string, unknown>;
  const matchId = typeof raw.matchId === "string" ? raw.matchId : undefined;
  const postId = typeof raw.postId === "string" ? raw.postId : undefined;
  const otherPostId =
    typeof raw.otherPostId === "string" ? raw.otherPostId : undefined;
  const cashFromA =
    typeof raw.cashFromA === "number" && Number.isFinite(raw.cashFromA)
      ? raw.cashFromA
      : undefined;

  const result = createDealForUser(user.id, {
    matchId,
    postId,
    otherPostId,
    cashFromA,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const deal = getDealViewForUser(result.deal.id, user.id);
  return NextResponse.json(
    { deal, created: result.created },
    { status: result.created ? 201 : 200 }
  );
}
