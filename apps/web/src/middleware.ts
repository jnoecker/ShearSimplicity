import { NextResponse, type NextRequest } from "next/server";

// Stamps the current pathname into a request header so server components
// can read it (Next 15 still doesn't surface the active pathname directly).
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
