import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fromDbRole } from "@/lib/auth/users";

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  }
  const { prisma } = await import("@/lib/db/prisma");
  const user = await prisma.user.findFirst({
    where: { id: session.user.id, active: true },
  });
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  }
  return { error: null, user, role: fromDbRole(user.role) };
}

export async function requireAdmin() {
  const auth = await requireAuth();
  if (auth.error) return auth;
  if (auth.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
      role: auth.role,
    };
  }
  return auth;
}

/** Google Sheet Apps Script intake — header: Authorization: Bearer <SHEET_WEBHOOK_SECRET> */
export function verifySheetWebhookSecret(request: Request): boolean {
  const secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const apiKey = request.headers.get("x-api-key");
  return apiKey === secret;
}

/** Cron jobs — header: Authorization: Bearer <CRON_SECRET> */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
