import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import type { User } from "@/lib/types";

/**
 * Complete a profile that is missing a WhatsApp number.
 *
 * Google sign-in never returns a phone number, and existing accounts predate the
 * requirement, so this is the one place a number can be added. It is also how
 * the onboarding wizard saves what the user told us.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: {
    whatsapp?: string;
    onboarding?: User["onboarding"];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const users = readData<User>("users");
  const index = users.findIndex((u) => u.id === user.id);
  if (index === -1) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const updated: User = { ...users[index] };

  if (body.whatsapp !== undefined) {
    const normalized = normalizeWhatsapp(body.whatsapp);
    if (!normalized) {
      return NextResponse.json(
        {
          error: "Informe um WhatsApp válido com DDD.",
          field: "whatsapp",
        },
        { status: 400 }
      );
    }
    updated.whatsapp = normalized;
  }

  if (body.onboarding !== undefined) {
    // Store only what we asked for; never trust arbitrary client shapes.
    const o = body.onboarding;
    if (o && typeof o === "object") {
      const have = o.have;
      const want = o.want;
      updated.onboarding = {
        completedAt: new Date().toISOString(),
        have:
          have && typeof have.brand === "string" && typeof have.model === "string"
            ? {
                brand: have.brand,
                model: have.model,
                year: Number.isFinite(Number(have.year)) ? Number(have.year) : undefined,
                estimatedValue: Number.isFinite(Number(have.estimatedValue))
                  ? Number(have.estimatedValue)
                  : undefined,
              }
            : undefined,
        want:
          want && typeof want.brand === "string" && typeof want.model === "string"
            ? {
                brand: want.brand,
                model: want.model,
                yearMin: Number.isFinite(Number(want.yearMin)) ? Number(want.yearMin) : undefined,
                yearMax: Number.isFinite(Number(want.yearMax)) ? Number(want.yearMax) : undefined,
              }
            : undefined,
        city: typeof o.city === "string" ? o.city : undefined,
        radiusKm: Number.isFinite(Number(o.radiusKm)) ? Number(o.radiusKm) : undefined,
      };
    }
  }

  users[index] = updated;
  writeData("users", users);

  return NextResponse.json({ user: updated });
}
