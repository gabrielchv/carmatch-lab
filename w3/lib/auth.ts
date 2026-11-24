import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "./types";
import { getItemById } from "./db";

const SESSION_COOKIE = "carmatch-session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

interface SessionData {
  userId: string;
  name: string;
}

/**
 * The session secret signs the cookie so a visitor can no longer hand-write
 * `{"userId":"<someone else>"}` and become that user.
 *
 * In development we fall back to a fixed local secret so `npm run dev` works
 * out of the box. In production a real secret is mandatory — silently using a
 * public constant there would defeat the signature entirely.
 */
function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV !== "production") return "carmatch-dev-only-secret";
  throw new Error(
    "SESSION_SECRET is not set (needs >= 16 chars). Refusing to issue unsigned sessions."
  );
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
}

function encode(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data), "utf-8").toString(
    "base64url"
  );
  return `${payload}.${sign(payload)}`;
}

function decode(value: string): SessionData | null {
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return null;

  const payload = value.slice(0, idx);
  const provided = value.slice(idx + 1);
  const expected = sign(payload);

  // Constant-time compare; length check first because timingSafeEqual throws.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    ) as SessionData;
    if (typeof parsed?.userId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createSession(user: User): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    encode({ userId: user.id, name: user.name }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    }
  );
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionData(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie) return null;
  return decode(cookie.value);
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSessionData();
  if (!session) return null;
  return getItemById<User>("users", session.userId) ?? null;
}
