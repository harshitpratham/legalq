import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, requireAuth } from "@/lib/api";

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
      assignee: { select: { id: true, name: true, email: true, username: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      },
      attachments: true,
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, name: true, username: true } } },
      },
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
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { title, description, category, urgency, assigneeId, dueAt } = body;

  const existing = await prisma.ticket.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(category !== undefined && { category }),
      ...(urgency !== undefined && { urgency }),
      ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
    },
    include: {
      assignee: { select: { id: true, name: true, email: true, username: true } },
    },
  });

  if (category !== undefined && category !== existing.category) {
    await prisma.auditEvent.create({
      data: {
        ticketId: id,
        type: "CATEGORY_CHANGED",
        userId: user!.id,
        payload: { from: existing.category, to: category },
      },
    });
  }

  if (assigneeId !== undefined && (assigneeId || null) !== existing.assigneeId) {
    await prisma.auditEvent.create({
      data: {
        ticketId: id,
        type: "ASSIGNEE_CHANGED",
        userId: user!.id,
        payload: { from: existing.assigneeId, to: assigneeId || null },
      },
    });
  }

  const nextDue = dueAt !== undefined ? (dueAt ? new Date(dueAt).toISOString() : null) : undefined;
  const prevDue = existing.dueAt?.toISOString() ?? null;
  if (dueAt !== undefined && nextDue !== prevDue) {
    await prisma.auditEvent.create({
      data: {
        ticketId: id,
        type: "DUE_DATE_CHANGED",
        userId: user!.id,
        payload: { from: prevDue, to: nextDue },
      },
    });
  }

  return NextResponse.json({ ticket });
}
