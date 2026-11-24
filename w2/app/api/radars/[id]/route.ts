import { NextResponse } from "next/server";
import { deleteItem, getItemById } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Radar } from "@/lib/radar";

/** Delete one of my radars. Owner only. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const radar = getItemById<Radar>("radars", id);
  if (!radar) {
    return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });
  }
  if (radar.userId !== user.id) {
    // 403 instead of 404: the id exists, it just is not yours. The UI never
    // shows other people's radars, so this only matters for hand-made calls.
    return NextResponse.json({ error: "Este alerta não é seu." }, { status: 403 });
  }

  deleteItem("radars", id);
  return NextResponse.json({ ok: true });
}
