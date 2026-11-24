import { NextResponse } from "next/server";
import { addItem, readData, writeData } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { generateId, nowISO } from "@/lib/utils";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import type { User } from "@/lib/types";

/**
 * Password-less dev/test login.
 *
 * Conditions (unchanged from the previous generation):
 *   - `ALLOW_DEV_LOGIN=1` **and** a development build, or
 *   - `UNSAFE_ALLOW_DEV_LOGIN=1` on a throwaway deployment.
 *
 * New in this generation: WhatsApp is mandatory. It is the only contact channel
 * in the product, so an account without a number cannot do anything useful.
 */
export async function POST(request: Request) {
  const devBuild = process.env.NODE_ENV === "development";
  const optedIn = process.env.ALLOW_DEV_LOGIN === "1";
  const unsafeOptedIn = process.env.UNSAFE_ALLOW_DEV_LOGIN === "1";

  if (!((optedIn && devBuild) || unsafeOptedIn)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, email, whatsapp } = body ?? {};

    if (!name || !email || typeof name !== "string" || typeof email !== "string") {
      return NextResponse.json(
        { error: "Informe seu nome e e-mail." },
        { status: 400 }
      );
    }

    const normalizedWhatsapp = normalizeWhatsapp(String(whatsapp ?? ""));
    if (!normalizedWhatsapp) {
      return NextResponse.json(
        {
          error:
            "Informe um WhatsApp válido com DDD. É por ele que as pessoas vão te encontrar.",
          field: "whatsapp",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = readData<User>("users");
    const existing = users.find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );

    if (existing) {
      // Account takeover is reachable here by design on a throwaway deployment
      // (UNSAFE_ALLOW_DEV_LOGIN). Never enable that with real data.
      if (!existing.whatsapp) {
        existing.whatsapp = normalizedWhatsapp;
        const index = users.findIndex((u) => u.id === existing.id);
        if (index >= 0) {
          users[index] = existing;
          writeData("users", users);
        }
      }
      await createSession(existing);
      return NextResponse.json({ user: existing, devTakeover: true });
    }

    const user: User = {
      id: generateId(),
      name: name.trim(),
      email: normalizedEmail,
      provider: "email",
      whatsapp: normalizedWhatsapp,
      createdAt: nowISO(),
    };
    addItem("users", user);

    await createSession(user);
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Erro interno ao entrar." },
      { status: 500 }
    );
  }
}
