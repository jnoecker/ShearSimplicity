import { NextResponse, type NextRequest } from "next/server";
import { DEV_SESSION_COOKIE } from "@/lib/dev-session";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.redirect(new URL("/sign-in", req.url), {
    status: 303,
  });
  res.cookies.delete(DEV_SESSION_COOKIE);
  return res;
}
