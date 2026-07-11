import { NextResponse } from "next/server";
import type { AuditEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/api";

function parseFilters(url: URL) {
  const type = url.searchParams.get("type") as AuditEventType | null;
  const ticketId = url.searchParams.get("ticketId");
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));

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
      { user: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  return { where, page, limit };
}

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const { where, page, limit } = parseFilters(url);

  const [total, events] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        ticket: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, username: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({
    events,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
