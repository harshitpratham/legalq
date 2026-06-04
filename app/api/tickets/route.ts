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

export async function POST(request: Request) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    title,
    description,
    category = "OTHER",
    urgency = "MEDIUM",
    requesterEmail,
    requesterName,
  } = body;

  if (!title || !description || !requesterEmail) {
    return NextResponse.json(
      { error: "title, description, and requesterEmail are required" },
      { status: 400 }
    );
  }

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description,
      category,
      urgency,
      requesterEmail,
      requesterName,
      assigneeId: user!.id,
      auditEvents: {
        create: {
          type: "CREATED",
          userId: user!.id,
          payload: { source: "manual" },
        },
      },
      messages: {
        create: {
          direction: "INBOUND",
          authorType: "STAKEHOLDER",
          body: description,
        },
      },
    },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
