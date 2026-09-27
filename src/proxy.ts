import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthPage, signInPathForArea } from "@/lib/roles";

// Optimistic redirect only; every protected page and action checks the session on the server.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isAuthPage(pathname)) return NextResponse.next();
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL(signInPathForArea(pathname), request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/user/:path*",
    "/organisation/:path*",
    "/admin/:path*",
    "/hiring-manager/:path*",
  ],
};
