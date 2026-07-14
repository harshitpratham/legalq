import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  startOfDay,
  subDays,
} from "date-fns";

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const url = new URL(request.url);
  const now = new Date();
  const from = url.searchParams.get("from")
    ? startOfDay(new Date(url.searchParams.get("from")!))
    : startOfDay(subDays(now, 29));
  const toRaw = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : now;
  const to = new Date(toRaw);
  to.setHours(23, 59, 59, 999);

  const [created, completed, allInRange, openTickets, topRequesters] = await Promise.all([
    prisma.ticket.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { completedAt: { gte: from, lte: to, not: null } },
      select: { createdAt: true, completedAt: true, startedAt: true },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        category: true,
        urgency: true,
        status: true,
        requesterEmail: true,
        assigneeId: true,
      },
    }),
    prisma.ticket.findMany({
      where: { status: { not: "COMPLETE" }, archivedAt: null },
      select: {
        createdAt: true,
        dueAt: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true, username: true } },
      },
    }),
    prisma.ticket.groupBy({
      by: ["requesterEmail"],
      where: { createdAt: { gte: from, lte: to } },
      _count: true,
      orderBy: { _count: { requesterEmail: "desc" } },
      take: 10,
    }),
  ]);

  const days = eachDayOfInterval({ start: from, end: to });
  const volume = days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return {
      date: key,
      created: created.filter((t) => format(t.createdAt, "yyyy-MM-dd") === key).length,
      completed: completed.filter(
        (t) => t.completedAt && format(t.completedAt, "yyyy-MM-dd") === key
      ).length,
    };
  });

  const mix = {
    category: {} as Record<string, number>,
    urgency: {} as Record<string, number>,
    status: {} as Record<string, number>,
  };
  for (const t of allInRange) {
    mix.category[t.category] = (mix.category[t.category] ?? 0) + 1;
    mix.urgency[t.urgency] = (mix.urgency[t.urgency] ?? 0) + 1;
    mix.status[t.status] = (mix.status[t.status] ?? 0) + 1;
  }

  const durations = completed
    .filter((t) => t.completedAt)
    .map((t) => differenceInCalendarDays(t.completedAt!, t.createdAt));
  const startDurations = completed
    .filter((t) => t.completedAt && t.startedAt)
    .map((t) => differenceInCalendarDays(t.completedAt!, t.startedAt!));

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const aging = { d0_2: 0, d3_7: 0, d8_14: 0, d15_plus: 0 };
  let pastDue = 0;
  const workloadMap = new Map<string, { name: string; count: number }>();
  let unassigned = 0;

  for (const t of openTickets) {
    const age = differenceInCalendarDays(now, t.createdAt);
    if (age <= 2) aging.d0_2++;
    else if (age <= 7) aging.d3_7++;
    else if (age <= 14) aging.d8_14++;
    else aging.d15_plus++;
    if (t.dueAt && t.dueAt < now) pastDue++;
    if (!t.assigneeId) unassigned++;
    else {
      const key = t.assigneeId;
      const name = t.assignee?.name ?? t.assignee?.username ?? "User";
      const cur = workloadMap.get(key) ?? { name, count: 0 };
      cur.count++;
      workloadMap.set(key, cur);
    }
  }

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    volume,
    mix,
    throughput: {
      avgDaysCreatedToComplete: avg(durations),
      medianDaysCreatedToComplete: median(durations),
      avgDaysStartedToComplete: avg(startDurations),
      completedCount: completed.length,
    },
    workload: [
      ...[...workloadMap.entries()].map(([id, v]) => ({ id, name: v.name, openCount: v.count })),
      { id: null, name: "Unassigned", openCount: unassigned },
    ],
    topRequesters: topRequesters.map((r) => ({
      email: r.requesterEmail,
      count: r._count,
    })),
    aging,
    pastDue,
  });
}
