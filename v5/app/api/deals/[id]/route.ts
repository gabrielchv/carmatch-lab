import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDealViewForUser } from "@/lib/deal";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const deal = getDealViewForUser(id, user.id);

  // Não-participante recebe o mesmo 404 de "não existe": não confirmamos que
  // uma negociação alheia existe com aquele id.
  if (!deal) {
    return NextResponse.json(
      { error: "Negociação não encontrada." },
      { status: 404 }
    );
  }

  return NextResponse.json({ deal });
}
