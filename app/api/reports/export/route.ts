import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api";
import { differenceInCalendarDays, startOfDay, subDays } from "date-fns";

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

  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: from, lte: to } },
    include: { assignee: { select: { name: true, username: true } } },
    orderBy: { createdAt: "desc" },
  });

  const header = [
    "id",
    "title",
    "status",
    "category",
    "urgency",
    "requesterEmail",
    "requesterName",
    "assignee",
    "createdAt",
    "completedAt",
    "dueAt",
    "daysOpen",
    "aiSummary",
  ];

  const rows = tickets.map((t) => {
    const end = t.completedAt ?? now;
    return [
      t.id,
      t.title,
      t.status,
      t.category,
      t.urgency,
      t.requesterEmail,
      t.requesterName ?? "",
      t.assignee?.name ?? t.assignee?.username ?? "",
      t.createdAt.toISOString(),
      t.completedAt?.toISOString() ?? "",
      t.dueAt?.toISOString() ?? "",
      String(differenceInCalendarDays(end, t.createdAt)),
      t.aiSummary ?? "",
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tickets-report.csv"',
    },
  });
}
