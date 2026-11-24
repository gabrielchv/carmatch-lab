import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDealViewForUser, setDealTask } from "@/lib/deal";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Informe taskId e done." },
      { status: 400 }
    );
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.taskId !== "string" || raw.taskId.length === 0) {
    return NextResponse.json({ error: "Informe o taskId." }, { status: 400 });
  }
  if (typeof raw.done !== "boolean") {
    return NextResponse.json(
      { error: "O campo done precisa ser booleano." },
      { status: 400 }
    );
  }

  const result = setDealTask(id, user.id, raw.taskId, raw.done);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, blockers: result.blockers },
      { status: result.status }
    );
  }

  return NextResponse.json({ deal: getDealViewForUser(id, user.id) });
}
