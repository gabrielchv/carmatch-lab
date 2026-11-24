import { NextResponse } from "next/server";
import { updateItem } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { nowISO } from "@/lib/utils";
import { isVerificationSignal, userTrust } from "@/lib/trust";
import type { User, UserVerifications } from "@/lib/types";

/**
 * Confirms (or un-confirms) one verification signal for the logged-in user.
 *
 * Local dev flow: no external provider is called. What matters for the
 * product is that the outcome is persisted on the user object, so every
 * listing/filter derives from the same source of truth.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;

  if (!isVerificationSignal(payload.signal)) {
    return NextResponse.json(
      { error: "Sinal de verificação desconhecido" },
      { status: 400 }
    );
  }
  const signal = payload.signal;

  if (
    payload.confirmed !== undefined &&
    typeof payload.confirmed !== "boolean"
  ) {
    return NextResponse.json(
      { error: "confirmed deve ser true ou false" },
      { status: 400 }
    );
  }

  // No `confirmed` means "toggle", which is what the UI buttons do.
  const confirmed =
    typeof payload.confirmed === "boolean"
      ? payload.confirmed
      : user.verifications?.[signal] !== true;

  const verifications: UserVerifications = { ...(user.verifications ?? {}) };
  verifications[signal] = confirmed;

  const confirmedAt = { ...(verifications.confirmedAt ?? {}) };
  if (confirmed) confirmedAt[signal] = nowISO();
  else delete confirmedAt[signal];
  verifications.confirmedAt = confirmedAt;

  const updated = updateItem<User>("users", user.id, { verifications });
  if (!updated) {
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    user: updated,
    trust: userTrust(updated),
  });
}
