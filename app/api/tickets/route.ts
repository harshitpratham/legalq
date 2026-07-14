import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");
  const urgency = url.searchParams.get("urgency");
  const category = url.searchParams.get("category");
  const assigneeId = url.searchParams.get("assigneeId");
  const stale = url.searchParams.get("stale") === "1";
  // archived: omit/active = non-archived (default), "1" = archived only, "all" = both
  const archived = url.searchParams.get("archived");

  const where: Prisma.TicketWhereInput = {};
  if (archived === "1") {
    where.archivedAt = { not: null };
  } else if (archived !== "all") {
    where.archivedAt = null;
  }

  if (status) where.status = status as Prisma.EnumTicketStatusFilter["equals"];
  if (urgency) where.urgency = urgency as Prisma.EnumUrgencyFilter["equals"];
  if (category) where.category = category as Prisma.EnumTicketCategoryFilter["equals"];
  if (assigneeId === "unassigned") where.assigneeId = null;
  else if (assigneeId) where.assigneeId = assigneeId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { requesterEmail: { contains: q, mode: "insensitive" } },
      { requesterName: { contains: q, mode: "insensitive" } },
      { aiSummary: { contains: q, mode: "insensitive" } },
    ];
  }
  if (stale) {
    const staleBefore = new Date();
    staleBefore.setDate(staleBefore.getDate() - 7);
    where.status = { not: "COMPLETE" };
    where.OR = [
      { lastStakeholderUpdateAt: { lt: staleBefore } },
      { AND: [{ lastStakeholderUpdateAt: null }, { updatedAt: { lt: staleBefore } }] },
    ];
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
    include: {
      assignee: { select: { id: true, name: true, email: true, username: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ tickets, user });
}
