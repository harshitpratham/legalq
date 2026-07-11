import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, requireAuth } from "@/lib/api";
import { hashPassword, toDbRole, toPublicUser, userEmail, fromDbRole } from "@/lib/auth/users";

export async function GET() {
  const { error, role } = await requireAuth();
  if (error) return error;

  // Admins see all; viewers see active users for assignee picker (no emails of deactivated)
  const users = await prisma.user.findMany({
    where: role === "admin" ? undefined : { active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    users: users.map((u) =>
      role === "admin"
        ? toPublicUser(u)
        : {
            id: u.id,
            name: u.name,
            username: u.username,
            role: fromDbRole(u.role),
            active: u.active,
          }
    ),
  });
}

export async function POST(request: Request) {
  const { error, user: actor } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  const roleInput = body.role === "admin" ? "admin" : "user";

  if (!username || username.length < 2) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email: userEmail(username) }] },
  });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const created = await prisma.user.create({
    data: {
      username,
      email: userEmail(username),
      name,
      passwordHash,
      role: toDbRole(roleInput),
      active: true,
    },
  });

  await prisma.auditEvent.create({
    data: {
      type: "USER_CREATED",
      userId: actor!.id,
      payload: { targetUserId: created.id, username, role: created.role },
    },
  });

  return NextResponse.json({ user: toPublicUser(created) }, { status: 201 });
}
