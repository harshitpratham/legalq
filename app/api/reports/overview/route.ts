import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api";
import { differenceInCalendarDays, startOfWeek, subDays } from "date-fns";

function daysBetween(a: Date, b: Date) {
  return Math.max(0, differenceInCalendarDays(b, a));
}

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const staleBefore = subDays(now, 7);
  const thirtyDaysAgo = subDays(now, 30);

  const [
    openTickets,
    urgentOpen,
    newThisWeek,
    completedThisWeek,
    completedLast30,
    byStatus,
    byCategory,
    byUrgency,
    openWithMeta,
    recentActivity,
    assignees,
  ] = await Promise.all([
    prisma.ticket.count({ where: { status: { not: "COMPLETE" } } }),
    prisma.ticket.count({ where: { status: { not: "COMPLETE" }, urgency: "HIGH" } }),
    prisma.ticket.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.ticket.count({
      where: { status: "COMPLETE", completedAt: { gte: weekStart } },
    }),
    prisma.ticket.findMany({
      where: {
        status: "COMPLETE",
        completedAt: { gte: thirtyDaysAgo, not: null },
      },
      select: { createdAt: true, completedAt: true },
    }),
    prisma.ticket.groupBy({ by: ["status"], _count: true }),
    prisma.ticket.groupBy({ by: ["category"], _count: true }),
    prisma.ticket.groupBy({ by: ["urgency"], _count: true }),
    prisma.ticket.findMany({
      where: { status: { not: "COMPLETE" } },
      select: {
        id: true,
        title: true,
        urgency: true,
        status: true,
        createdAt: true,
        dueAt: true,
        updatedAt: true,
        lastStakeholderUpdateAt: true,
        assigneeId: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { direction: true, createdAt: true },
        },
      },
    }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        ticket: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, username: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        username: true,
        _count: { select: { assignedTickets: { where: { status: { not: "COMPLETE" } } } } },
      },
    }),
  ]);

  const avgDaysToComplete =
    completedLast30.length === 0
      ? null
      : completedLast30.reduce(
          (sum, t) => sum + daysBetween(t.createdAt, t.completedAt!),
          0
        ) / completedLast30.length;

  const aging = { d0_2: 0, d3_7: 0, d8_14: 0, d15_plus: 0 };
  let staleOpen = 0;
  const needsAttention: typeof openWithMeta = [];
  let pastDue = 0;

  for (const t of openWithMeta) {
    const age = daysBetween(t.createdAt, now);
    if (age <= 2) aging.d0_2++;
    else if (age <= 7) aging.d3_7++;
    else if (age <= 14) aging.d8_14++;
    else aging.d15_plus++;

    const lastTouch = t.lastStakeholderUpdateAt ?? t.messages[0]?.createdAt ?? t.updatedAt;
    const isStale = lastTouch < staleBefore;
    if (isStale) staleOpen++;

    const awaitingReply = t.messages[0]?.direction === "INBOUND";
    if (t.urgency === "HIGH" || isStale || awaitingReply) {
      needsAttention.push(t);
    }
    if (t.dueAt && t.dueAt < now) pastDue++;
  }

  const unassignedOpen = openWithMeta.filter((t) => !t.assigneeId).length;

  return NextResponse.json({
    kpis: {
      openTickets,
      urgentOpen,
      newThisWeek,
      completedThisWeek,
      avgDaysToComplete: avgDaysToComplete !== null ? Math.round(avgDaysToComplete * 10) / 10 : null,
      staleOpen,
      pastDue,
    },
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count])),
    byUrgency: Object.fromEntries(byUrgency.map((r) => [r.urgency, r._count])),
    aging,
    needsAttention: needsAttention.slice(0, 15).map((t) => ({
      id: t.id,
      title: t.title,
      urgency: t.urgency,
      status: t.status,
      ageDays: daysBetween(t.createdAt, now),
      awaitingReply: t.messages[0]?.direction === "INBOUND",
    })),
    recentActivity,
    workload: [
      ...assignees.map((a) => ({
        id: a.id,
        name: a.name ?? a.username ?? "User",
        openCount: a._count.assignedTickets,
      })),
      { id: null, name: "Unassigned", openCount: unassignedOpen },
    ],
  });
}
