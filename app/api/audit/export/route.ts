import { NextResponse } from "next/server";
import type { AuditEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/api";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as AuditEventType | null;
  const ticketId = url.searchParams.get("ticketId");
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();

  const where: Prisma.AuditEventWhereInput = {};
  if (type) where.type = type;
  if (ticketId) where.ticketId = ticketId;
  if (userId) where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  if (q) {
    where.OR = [
      { ticket: { title: { contains: q, mode: "insensitive" } } },
      { user: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      ticket: { select: { id: true, title: true } },
      user: { select: { id: true, name: true, username: true } },
    },
  });

  const header = ["createdAt", "type", "actor", "ticketId", "ticketTitle", "payload"];
  const rows = events.map((e) => [
    e.createdAt.toISOString(),
    e.type,
    e.user?.name ?? e.user?.username ?? "",
    e.ticketId ?? "",
    e.ticket?.title ?? "",
    JSON.stringify(e.payload ?? {}),
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
