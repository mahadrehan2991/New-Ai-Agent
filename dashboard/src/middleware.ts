import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Direct access: If user navigates to /login, redirect straight to dashboard home
  if (pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow all routes without password
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
