import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { advanceDeal, getDealViewForUser } from "@/lib/deal";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  // Corpo é opcional: só serve para uma nota curta na trilha de auditoria.
  let note: string | undefined;
  try {
    const body = (await request.json()) as { note?: unknown } | null;
    if (body && typeof body.note === "string") note = body.note;
  } catch {
    // sem corpo / JSON inválido não impede a tentativa de avanço
  }

  const result = advanceDeal(id, user.id, note);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        blockers: result.blockers ?? [],
      },
      { status: result.status }
    );
  }

  return NextResponse.json({ deal: getDealViewForUser(id, user.id) });
}
