import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api";

export async function GET() {
  const { error, user } = await requireAuth();
  if (error) return error;

  const tickets = await prisma.ticket.findMany({
    orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ tickets, user });
}
