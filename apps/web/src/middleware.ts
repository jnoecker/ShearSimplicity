import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const authProvider = process.env.AUTH_PROVIDER ?? "dev";

// Stamps the current pathname into a request header so server components
// can read it (Next 15 still doesn't surface the active pathname directly).
function stampPathname(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

// In Clerk mode we wrap our pathname-stamping logic in clerkMiddleware so
// `auth()` inside server components has session context. clerkMiddleware
// doesn't enforce protection by default — the (app) layout already gates
// access via getServerSession, so we don't restate route protection here.
const clerkComposed = clerkMiddleware((_auth, req) => stampPathname(req));

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (authProvider === "clerk") {
    return clerkComposed(req, event);
  }
  return stampPathname(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
