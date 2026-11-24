import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, getRedirectUri } from "@/lib/oauth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirectTo") || "/my-posts";

  const state = crypto.randomUUID();

  // Store state + redirectTo in a cookie for CSRF protection
  const stateCookie = JSON.stringify({ state, redirectTo });
  const response = NextResponse.redirect(
    buildGoogleAuthUrl(state, getRedirectUri(request))
  );

  response.cookies.set("oauth-state", stateCookie, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
