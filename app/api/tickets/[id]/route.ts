import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
      attachments: true,
      auditEvents: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { title, description, category, urgency, assigneeId } = body;

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(category !== undefined && { category }),
      ...(urgency !== undefined && { urgency }),
      ...(assigneeId !== undefined && { assigneeId }),
    },
  });

  if (category !== undefined) {
    await prisma.auditEvent.create({
      data: {
        ticketId: id,
        type: "CATEGORY_CHANGED",
        userId: user!.id,
        payload: { category },
      },
    });
  }

  return NextResponse.json({ ticket });
}
