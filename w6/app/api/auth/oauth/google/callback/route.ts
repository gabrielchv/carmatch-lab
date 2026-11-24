import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeGoogleCode,
  fetchGoogleProfile,
  getRedirectUri,
} from "@/lib/oauth";
import { addItem, readData, writeData } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { generateId, nowISO } from "@/lib/utils";
import type { User } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // Build a proper base URL from headers — request.url on Cloud Run
  // internally uses 0.0.0.0:8080 which would break redirects
  const host = request.headers.get("host") ?? "carmatch-404714657867.southamerica-east1.run.app";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  const redirectToError = (error: string) =>
    NextResponse.redirect(new URL(`/auth?error=${error}`, baseUrl));

  // Google returned an error (e.g. user denied consent)
  if (errorParam) return redirectToError("acesso_negado");
  if (!code || !returnedState) return redirectToError("parametros_invalidos");

  // Verify CSRF state
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get("oauth-state");
  if (!stateCookie) return redirectToError("sessao_expirada");

  let stateData: { state: string; redirectTo: string };
  try {
    stateData = JSON.parse(stateCookie.value);
  } catch {
    return redirectToError("state_invalido");
  }

  if (stateData.state !== returnedState) return redirectToError("state_invalido");

  // State verified — clean up the cookie
  cookieStore.delete("oauth-state");

  // Exchange code for tokens
  let profile: { email: string; name: string; avatar: string | null };
  try {
    const tokens = await exchangeGoogleCode(code, getRedirectUri(request));
    profile = await fetchGoogleProfile(tokens.access_token);
  } catch (err) {
    console.error("OAuth token/profile error:", err);
    return redirectToError("erro_autenticacao");
  }

  if (!profile.email) return redirectToError("sem_email");

  // Find or create the user
  const users = readData<User>("users");
  let user = users.find((u) => u.email === profile.email);

  if (!user) {
    user = {
      id: generateId(),
      name: profile.name,
      email: profile.email,
      provider: "google",
      avatar: profile.avatar ?? undefined,
      createdAt: nowISO(),
    };
    addItem("users", user);
  } else {
    // Update name/avatar from Google in case they changed
    const existing = users.find((u) => u.id === user!.id);
    if (existing) {
      existing.name = profile.name;
      existing.avatar = profile.avatar ?? undefined;
      existing.provider = "google";
      const idx = users.findIndex((u) => u.id === user!.id);
      if (idx >= 0) {
        users[idx] = existing;
        writeData("users", users);
      }
    }
  }

  // Create session and redirect
  await createSession(user);

  const redirectTo = stateData.redirectTo || "/my-posts";

  // Google never returns a phone number, and WhatsApp is the only contact
  // channel in this product — so a fresh Google account has one mandatory step
  // left. Send them there first, carrying where they wanted to go.
  if (!user.whatsapp) {
    const complete = new URL("/completar-perfil", baseUrl);
    complete.searchParams.set("redirectTo", redirectTo);
    complete.searchParams.set("novo", "1");
    return NextResponse.redirect(complete);
  }

  return NextResponse.redirect(new URL(redirectTo, baseUrl));
}
