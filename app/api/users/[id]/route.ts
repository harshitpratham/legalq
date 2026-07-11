import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/api";
import { hashPassword, toDbRole, toPublicUser } from "@/lib/auth/users";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user: actor } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: {
    name?: string;
    role?: "ADMIN" | "USER";
    active?: boolean;
    passwordHash?: string;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (body.role === "admin" || body.role === "user") {
    data.role = toDbRole(body.role);
  }
  if (typeof body.active === "boolean") {
    data.active = body.active;
  }
  if (typeof body.password === "string" && body.password.length >= 4) {
    data.passwordHash = await hashPassword(body.password);
  }

  if (data.active === false || data.role === "USER") {
    const wouldDemoteOrDeactivate =
      (data.active === false && existing.role === "ADMIN" && existing.active) ||
      (data.role === "USER" && existing.role === "ADMIN" && existing.active && data.active !== false);

    if (wouldDemoteOrDeactivate || data.active === false) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: id } },
      });
      if (existing.role === "ADMIN" && existing.active && activeAdmins === 0) {
        if (data.active === false || data.role === "USER") {
          return NextResponse.json(
            { error: "Cannot deactivate or demote the last active admin" },
            { status: 400 }
          );
        }
      }
    }
  }

  const updated = await prisma.user.update({ where: { id }, data });

  const auditType =
    data.active === false && existing.active
      ? "USER_DEACTIVATED"
      : "USER_UPDATED";

  await prisma.auditEvent.create({
    data: {
      type: auditType,
      userId: actor!.id,
      payload: {
        targetUserId: id,
        changes: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.passwordHash !== undefined && { passwordChanged: true }),
        },
      },
    },
  });

  return NextResponse.json({ user: toPublicUser(updated) });
}
