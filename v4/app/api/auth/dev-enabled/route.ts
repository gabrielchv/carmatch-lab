import { NextResponse } from "next/server";

/**
 * Lets the auth screen know whether the password-less dev login is available.
 *
 * Must mirror the exact condition in `app/api/auth/login/route.ts`, which in
 * this fork requires `ALLOW_DEV_LOGIN=1` **and** a development build. An
 * earlier version of this route only checked the variable, so a production
 * build rendered a login form whose endpoint answered 404 — a form that could
 * never work.
 */
export async function GET() {
  const devBuild = process.env.NODE_ENV === "development";
  const optedIn = process.env.ALLOW_DEV_LOGIN === "1";
  const unsafeOptedIn = process.env.UNSAFE_ALLOW_DEV_LOGIN === "1";

  return NextResponse.json({
    enabled: (optedIn && devBuild) || unsafeOptedIn,
    unsafe: unsafeOptedIn && !devBuild,
  });
}
