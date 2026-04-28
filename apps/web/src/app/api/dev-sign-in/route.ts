import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { DEV_SESSION_COOKIE, signDevSession } from "@/lib/dev-session";

export async function POST(): Promise<NextResponse> {
  if (serverEnv.authProvider !== "dev") {
    return NextResponse.json(
      { error: "Dev sign-in disabled (AUTH_PROVIDER != dev)" },
      { status: 403 },
    );
  }

  const cookie = signDevSession(
    {
      userId: serverEnv.devUserId,
      email: serverEnv.devUserEmail,
      salonId: serverEnv.devSalonId,
      salonSlug: serverEnv.devSalonSlug,
    },
    serverEnv.devAuthSecret,
  );

  const res = NextResponse.redirect(new URL("/", "http://localhost:3000"), {
    status: 303,
  });
  res.cookies.set(DEV_SESSION_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // 7 days. Cheap dev convenience; not a security boundary.
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
