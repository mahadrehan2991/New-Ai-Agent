import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "harmony_admin_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public assets & API routes that don't need UI auth
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/clinical") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE_NAME);
  const rawValue = session?.value ? decodeURIComponent(session.value) : "";
  const isValidFormat =
    rawValue.includes(".") &&
    (rawValue.startsWith("admin:") || rawValue.startsWith("admin_"));

  // If already logged in and visiting /login -> redirect to dashboard
  if (pathname.startsWith("/login")) {
    if (isValidFormat) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Protected routes require valid session cookie
  if (!isValidFormat) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (session?.value) {
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
