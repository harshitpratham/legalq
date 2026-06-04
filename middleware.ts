import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/board/:path*",
    "/ticket/:path*",
    "/api/tickets/:path*",
    // /api/webhooks/* is public (uses ZAPIER_WEBHOOK_SECRET instead)
  ],
};
