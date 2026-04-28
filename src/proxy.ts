import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const protectedRoutes = ["/create", "/dashboard", "/generating", "/settings"];

export function proxy(request: NextRequest) {
  if (request.headers.has("x-middleware-subrequest")) {
    return new NextResponse(null, { status: 400 });
  }

  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isProtected && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/create",
    "/create/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/generating",
    "/generating/:path*",
    "/settings",
    "/settings/:path*",
  ],
};
