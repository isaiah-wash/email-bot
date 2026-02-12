import { NextRequest, NextResponse } from "next/server";

const protectedPaths = [
  "/dashboard",
  "/contacts",
  "/campaigns",
  "/compose",
  "/templates",
  "/settings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path is protected
  const isProtected = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  if (!isProtected) return NextResponse.next();

  // Check for session cookie (next-auth.session-token or __Secure-next-auth.session-token)
  const hasSession =
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token") ||
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/contacts/:path*",
    "/campaigns/:path*",
    "/compose/:path*",
    "/templates/:path*",
    "/settings/:path*",
  ],
};
