import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateItem } from "@/lib/db";
import { USER_SIGNALS, isVerificationKey, userTrust } from "@/lib/confianca";
import type { User, UserVerifications } from "@/lib/types";

/**
 * Toggle one identity signal for the signed-in user.
 *
 * Only booleans are stored — never the CPF, the CNH number or an image of a
 * document. The product needs "was this checked?" to put a badge on a listing,
 * not the personal data itself.
 *
 * Body: { signal: VerificationKey, confirmed?: boolean }
 * Without `confirmed` the signal is toggled, which is what the /confianca
 * switch does. With it, the caller states the desired end state — retrying a
 * toggle after a dropped response must not flip it back.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Entre para confirmar suas verificações.", code: "login-required" },
      { status: 401 }
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

  const { signal, confirmed } = (body ?? {}) as {
    signal?: unknown;
    confirmed?: unknown;
  };

  // Reject unknown keys instead of writing a flag nothing can read: a typo in
  // the UI would otherwise look saved and score nothing.
  if (typeof signal !== "string" || !isVerificationKey(signal)) {
    return NextResponse.json(
      {
        error: "Sinal de verificação inválido.",
        code: "invalid_signal",
        allowed: USER_SIGNALS.map((item) => item.key),
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

  const current: UserVerifications = user.verifications ?? {};
  const nextValue =
    typeof confirmed === "boolean" ? confirmed : current[signal] !== true;

  const verifications: UserVerifications = { ...current, [signal]: nextValue };

  const updated = updateItem<User>("users", user.id, { verifications });
  if (!updated) {
    // The session pointed at a user that no longer exists (data cleared
    // underneath a live cookie). 404 is the honest answer.
    return NextResponse.json(
      { error: "Usuário não encontrado.", code: "user-not-found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    signal,
    confirmed: nextValue,
    verifications,
    trust: userTrust(updated),
  });
}
