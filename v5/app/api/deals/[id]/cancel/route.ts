import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cancelDeal, getDealViewForUser } from "@/lib/deal";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  let reason: string | undefined;
  try {
    const body = (await request.json()) as { reason?: unknown } | null;
    if (body && typeof body.reason === "string") reason = body.reason;
  } catch {
    // cancelar sem motivo informado é permitido
  }

  const result = cancelDeal(id, user.id, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ deal: getDealViewForUser(id, user.id) });
}
