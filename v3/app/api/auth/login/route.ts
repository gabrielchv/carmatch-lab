import { NextResponse } from "next/server";
import { addItem, readData } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { generateId, nowISO } from "@/lib/utils";
import type { User } from "@/lib/types";

/**
 * Password-less dev login.
 *
 * The original accepted `{name, email}` for any email and, if the user
 * already existed, logged you in as them without any proof — account takeover
 * of any registered user, including in production. It was "not exposed in the
 * UI", which is not a control.
 *
 * Now it requires BOTH `ALLOW_DEV_LOGIN=1` and a development build, so a
 * leaked env file cannot open it in a deployment.
 *
 * For throwaway test deployments there is an explicit second switch,
 * `UNSAFE_ALLOW_DEV_LOGIN=1`, which works in a production build too. It is a
 * deliberately ugly name: enabling it on a public URL exposes password-less
 * login and, because it also takes over existing accounts, session forgery for
 * every user. Only ever set it on a deployment you are willing to see wiped.
 */
export async function POST(request: Request) {
  const devBuild = process.env.NODE_ENV === "development";
  const optedIn = process.env.ALLOW_DEV_LOGIN === "1";
  const unsafeOptedIn = process.env.UNSAFE_ALLOW_DEV_LOGIN === "1";

  // Either the normal (dev-only) path, or the explicit throwaway-deployment path.
  const allowed = (optedIn && devBuild) || unsafeOptedIn;

  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { name, email } = await request.json();

    if (!name || !email || typeof name !== "string" || typeof email !== "string") {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = readData<User>("users");
    const existing = users.find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );

    if (existing) {
      // Taking over an existing account is only reachable on a local dev
      // server — the guard above already required NODE_ENV=development.
      await createSession(existing);
      return NextResponse.json({ user: existing, devTakeover: true });
    }

    const user: User = {
      id: generateId(),
      name: name.trim(),
      email: normalizedEmail,
      provider: "email",
      createdAt: nowISO(),
    };
    addItem("users", user);

    await createSession(user);

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
