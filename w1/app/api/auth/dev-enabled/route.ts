import { NextResponse } from "next/server";

/**
 * Lets the auth screen know whether the password-less dev login is available.
 *
 * Must mirror the exact condition in `app/api/auth/login/route.ts` — a UI that
 * shows the form while the API returns 404 is worse than no form at all.
 */
export async function GET() {
  const devBuild = process.env.NODE_ENV === "development";
  const optedIn = process.env.ALLOW_DEV_LOGIN === "1";
  const unsafeOptedIn = process.env.UNSAFE_ALLOW_DEV_LOGIN === "1";

  return NextResponse.json({
    enabled: (optedIn && devBuild) || unsafeOptedIn,
    // Lets the UI label the form honestly on a throwaway deployment.
    unsafe: unsafeOptedIn && !devBuild,
  });
}
