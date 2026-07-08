import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { toDbRole } from "@/lib/auth/users";

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  }
  const { prisma } = await import("@/lib/db/prisma");
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined,
      role: toDbRole(session.user.role),
    },
    create: {
      email: session.user.email,
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined,
      role: toDbRole(session.user.role),
    },
  });
  return { error: null, user, role: session.user.role };
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
