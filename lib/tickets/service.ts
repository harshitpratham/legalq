import type { Ticket, TicketStatus, User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  agentReplyNotificationEmail,
  reminderEmail,
  statusUpdateEmail,
  ticketCreatedEmail,
} from "@/lib/email/templates";
import { sendEmailInThread } from "@/lib/gmail/send";

export async function createTicketFromEmail(params: {
  title: string;
  description: string;
  category: Ticket["category"];
  urgency: Ticket["urgency"];
  requesterEmail: string;
  requesterName?: string | null;
  gmailThreadId: string;
  gmailMessageId: string;
}) {
  const existing = await prisma.ticket.findUnique({
    where: { gmailMessageId: params.gmailMessageId },
  });
  if (existing) return existing;

  const ticket = await prisma.ticket.create({
    data: {
      title: params.title,
      description: params.description,
      category: params.category,
      urgency: params.urgency,
      requesterEmail: params.requesterEmail,
      requesterName: params.requesterName,
      gmailThreadId: params.gmailThreadId,
      gmailMessageId: params.gmailMessageId,
      status: "NOT_STARTED",
      messages: {
        create: {
          direction: "INBOUND",
          authorType: "STAKEHOLDER",
          body: params.description,
          gmailMessageId: params.gmailMessageId,
        },
      },
      auditEvents: {
        create: { type: "CREATED", payload: { source: "email" } },
      },
    },
    include: { messages: true },
  });

  await notifyTicketCreated(ticket);
  return ticket;
}

export async function createTicketFromZapier(params: {
  title: string;
  description: string;
  category: Ticket["category"];
  urgency: Ticket["urgency"];
  requesterEmail: string;
  requesterName?: string | null;
  externalId?: string | null;
  gmailThreadId?: string | null;
  gmailMessageId?: string | null;
  sheetRowId?: string | null;
  notifyRequester?: boolean;
}) {
  const dedupeId =
    params.gmailMessageId ??
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
      gmailThreadId: params.gmailThreadId,
      gmailMessageId: dedupeId,
      status: "NOT_STARTED",
      messages: {
        create: {
          direction: "INBOUND",
          authorType: "STAKEHOLDER",
          body: params.description,
          gmailMessageId: params.gmailMessageId ?? undefined,
        },
      },
      auditEvents: {
        create: {
          type: "CREATED",
          payload: {
            source: "zapier",
            sheetRowId: params.sheetRowId,
            externalId: params.externalId,
          },
        },
      },
    },
  });

  const shouldNotify =
    params.notifyRequester !== false &&
    Boolean(params.gmailThreadId && params.gmailMessageId);

  if (shouldNotify) {
    await notifyTicketCreated(ticket);
  }

  return { ticket, created: true };
}

export async function notifyTicketCreated(ticket: Ticket) {
  const { subject, body } = ticketCreatedEmail(ticket);
  try {
    const sent = await sendEmailInThread({
      to: ticket.requesterEmail,
      subject,
      body,
      threadId: ticket.gmailThreadId,
      inReplyToMessageId: ticket.gmailMessageId,
    });

    await prisma.message.create({
      data: {
        ticketId: ticket.id,
        direction: "OUTBOUND",
        authorType: "SYSTEM",
        body,
        gmailMessageId: sent.messageId,
      },
    });

    await prisma.auditEvent.create({
      data: {
        ticketId: ticket.id,
        type: "EMAIL_SENT",
        payload: { kind: "ticket_created", messageId: sent.messageId },
      },
    });

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastStakeholderUpdateAt: new Date() },
    });
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
    const sent = await sendEmailInThread({
      to: ticket.requesterEmail,
      subject,
      body,
      threadId: ticket.gmailThreadId,
      inReplyToMessageId: ticket.gmailMessageId,
    });

    await prisma.message.create({
      data: {
        ticketId: ticket.id,
        direction: "OUTBOUND",
        authorType: "SYSTEM",
        body,
        gmailMessageId: sent.messageId,
      },
    });

    await prisma.auditEvent.create({
      data: {
        ticketId: ticket.id,
        type: "EMAIL_SENT",
        payload: { kind: "status_update", status, messageId: sent.messageId },
      },
    });

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastStakeholderUpdateAt: new Date() },
    });
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

export async function ingestStakeholderReply(params: {
  ticketId: string;
  body: string;
  gmailMessageId: string;
  autoMoveToInProgress?: boolean;
}) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.ticketId },
  });
  if (!ticket) return null;

  await prisma.message.create({
    data: {
      ticketId: ticket.id,
      direction: "INBOUND",
      authorType: "STAKEHOLDER",
      body: params.body,
      gmailMessageId: params.gmailMessageId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      ticketId: ticket.id,
      type: "EMAIL_RECEIVED",
      payload: { gmailMessageId: params.gmailMessageId },
    },
  });

  let updated: Ticket = ticket;
  if (params.autoMoveToInProgress && ticket.status === "IN_REVIEW") {
    updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "IN_PROGRESS", startedAt: ticket.startedAt ?? new Date() },
    });
    await prisma.auditEvent.create({
      data: {
        ticketId: ticket.id,
        type: "STATUS_CHANGED",
        payload: { from: "IN_REVIEW", to: "IN_PROGRESS", reason: "stakeholder_reply" },
      },
    });
  }

  await notifyAgentOfReply(updated, params.body);
  return updated;
}

async function notifyAgentOfReply(ticket: Ticket, replyPreview: string) {
  const notifyEmail = process.env.LEGAL_TEAM_NOTIFY_EMAIL;
  if (!notifyEmail) return;

  const { subject, body } = agentReplyNotificationEmail(ticket, replyPreview);
  try {
    await sendEmailInThread({
      to: notifyEmail,
      subject,
      body,
      threadId: undefined,
    });
  } catch (err) {
    console.error("Failed to notify agent of reply:", err);
  }
}

export async function sendIdleReminders(daysIdle = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysIdle);

  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW"] },
      OR: [
        { lastStakeholderUpdateAt: { lt: cutoff } },
        { lastStakeholderUpdateAt: null, updatedAt: { lt: cutoff } },
      ],
      AND: [
        {
          OR: [
            { lastReminderSentAt: null },
            { lastReminderSentAt: { lt: cutoff } },
          ],
        },
      ],
    },
  });

  for (const ticket of tickets) {
    const { subject, body } = reminderEmail(ticket);
    try {
      await sendEmailInThread({
        to: ticket.requesterEmail,
        subject,
        body,
        threadId: ticket.gmailThreadId,
        inReplyToMessageId: ticket.gmailMessageId,
      });

      await prisma.auditEvent.create({
        data: {
          ticketId: ticket.id,
          type: "REMINDER_SENT",
          payload: { daysIdle },
        },
      });

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          lastReminderSentAt: new Date(),
          lastStakeholderUpdateAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`Reminder failed for ticket ${ticket.id}:`, err);
    }
  }

  return tickets.length;
}

export async function findTicketForEmail(email: {
  threadId: string;
  inReplyTo: string | null;
  references: string[];
  from: string;
}) {
  const byThread = await prisma.ticket.findFirst({
    where: { gmailThreadId: email.threadId },
    orderBy: { createdAt: "desc" },
  });
  if (byThread) return byThread;

  const refIds = [
    ...(email.inReplyTo ? [email.inReplyTo.replace(/[<>]/g, "")] : []),
    ...email.references.map((r) => r.replace(/[<>]/g, "")),
  ].filter(Boolean);

  if (refIds.length > 0) {
    const byMessage = await prisma.ticket.findFirst({
      where: { gmailMessageId: { in: refIds } },
    });
    if (byMessage) return byMessage;
  }

  return null;
}
