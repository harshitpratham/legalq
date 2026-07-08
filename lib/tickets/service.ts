import type { Ticket, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { statusUpdateEmail, ticketCreatedEmail } from "@/lib/email/templates";

export async function createTicketFromSheet(params: {
  title: string;
  description: string;
  category: Ticket["category"];
  urgency: Ticket["urgency"];
  requesterEmail: string;
  requesterName?: string | null;
  sheetRowId?: string | null;
  externalId?: string | null;
  sendWelcomeEmail?: boolean;
}) {
  const dedupeId =
    (params.externalId ? `sheet-${params.externalId}` : null) ??
    (params.sheetRowId ? `sheet-row-${params.sheetRowId}` : null);

  if (dedupeId) {
    const existing = await prisma.ticket.findUnique({
      where: { gmailMessageId: dedupeId },
    });
    if (existing) return { ticket: existing, created: false };
  }

  const ticket = await prisma.ticket.create({
    data: {
      title: params.title,
      description: params.description,
      category: params.category,
      urgency: params.urgency,
      requesterEmail: params.requesterEmail,
      requesterName: params.requesterName,
      gmailMessageId: dedupeId,
      status: "NOT_STARTED",
      messages: {
        create: {
          direction: "INBOUND",
          authorType: "STAKEHOLDER",
          body: params.description,
        },
      },
      auditEvents: {
        create: {
          type: "CREATED",
          payload: {
            source: "sheet",
            sheetRowId: params.sheetRowId,
            externalId: params.externalId,
          },
        },
      },
    },
  });

  if (params.sendWelcomeEmail !== false) {
    await sendTicketCreatedEmail(ticket);
  }

  return { ticket, created: true };
}

async function sendTicketCreatedEmail(ticket: Ticket) {
  const { subject, body } = ticketCreatedEmail(ticket);
  try {
    const sent = await sendEmail({
      to: ticket.requesterEmail,
      subject,
      body,
    });

    if (sent) {
      await prisma.message.create({
        data: {
          ticketId: ticket.id,
          direction: "OUTBOUND",
          authorType: "SYSTEM",
          body,
        },
      });
      await prisma.auditEvent.create({
        data: {
          ticketId: ticket.id,
          type: "EMAIL_SENT",
          payload: { kind: "ticket_created", resendId: sent.id },
        },
      });
    }
  } catch (err) {
    console.error("Failed to send ticket created email:", err);
  }
}

export async function transitionTicket(params: {
  ticketId: string;
  newStatus: TicketStatus;
  comment?: string;
  userId?: string;
  notifyStakeholder?: boolean;
}) {
  const ticket = await prisma.ticket.findUnique({ where: { id: params.ticketId } });
  if (!ticket) throw new Error("Ticket not found");

  const previousStatus = ticket.status;
  const now = new Date();
  const updateData: {
    status: TicketStatus;
    startedAt?: Date;
    completedAt?: Date;
  } = { status: params.newStatus };

  if (params.newStatus === "IN_PROGRESS" && !ticket.startedAt) {
    updateData.startedAt = now;
  }
  if (params.newStatus === "COMPLETE") {
    updateData.completedAt = now;
  }

  const updated = await prisma.ticket.update({
    where: { id: params.ticketId },
    data: updateData,
  });

  await prisma.auditEvent.create({
    data: {
      ticketId: ticket.id,
      type: "STATUS_CHANGED",
      userId: params.userId,
      payload: { from: previousStatus, to: params.newStatus, comment: params.comment },
    },
  });

  if (params.comment) {
    await prisma.message.create({
      data: {
        ticketId: ticket.id,
        direction: "OUTBOUND",
        authorType: "AGENT",
        body: params.comment,
        authorId: params.userId,
      },
    });
    await prisma.auditEvent.create({
      data: {
        ticketId: ticket.id,
        type: "COMMENT_ADDED",
        userId: params.userId,
        payload: { comment: params.comment },
      },
    });
  }

  const shouldNotify = params.notifyStakeholder !== false;
  if (shouldNotify && previousStatus !== params.newStatus) {
    await sendStatusNotification(updated, params.newStatus, params.comment);
  }

  return updated;
}

export async function sendStatusNotification(
  ticket: Ticket,
  status: TicketStatus,
  comment?: string
) {
  const { subject, body } = statusUpdateEmail(ticket, status, comment);
  try {
    const sent = await sendEmail({
      to: ticket.requesterEmail,
      subject,
      body,
    });

    if (sent) {
      await prisma.message.create({
        data: {
          ticketId: ticket.id,
          direction: "OUTBOUND",
          authorType: "SYSTEM",
          body,
        },
      });
      await prisma.auditEvent.create({
        data: {
          ticketId: ticket.id,
          type: "EMAIL_SENT",
          payload: { kind: "status_update", status, resendId: sent.id },
        },
      });
    }
  } catch (err) {
    console.error("Failed to send status notification:", err);
  }
}

export async function addComment(params: {
  ticketId: string;
  body: string;
  userId: string;
  sendToStakeholder?: boolean;
}) {
  const ticket = await prisma.ticket.findUnique({ where: { id: params.ticketId } });
  if (!ticket) throw new Error("Ticket not found");

  const message = await prisma.message.create({
    data: {
      ticketId: ticket.id,
      direction: "OUTBOUND",
      authorType: "AGENT",
      body: params.body,
      authorId: params.userId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      ticketId: ticket.id,
      type: "COMMENT_ADDED",
      userId: params.userId,
      payload: { messageId: message.id },
    },
  });

  if (params.sendToStakeholder) {
    await sendStatusNotification(ticket, ticket.status, params.body);
  }

  return message;
}
