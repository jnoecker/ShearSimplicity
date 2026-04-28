import { NextResponse } from "next/server";
import { DEV_SESSION_COOKIE } from "@/lib/dev-session";

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.redirect(
    new URL("/sign-in", "http://localhost:3000"),
    { status: 303 },
  );
  res.cookies.delete(DEV_SESSION_COOKIE);
  return res;
}
