import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role;
    const path = req.nextUrl.pathname;

    if (path.startsWith("/admin") && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      authorized: ({ token }) => !!token?.id && !!token?.role,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/board/:path*",
    "/tickets/:path*",
    "/reports/:path*",
    "/ticket/:path*",
    "/admin/:path*",
    "/api/tickets/:path*",
    "/api/users/:path*",
    "/api/audit/:path*",
    "/api/reports/:path*",
  ],
};
