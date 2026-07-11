import type { Ticket, TicketStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { findMatchingTicket } from "@/lib/ai/threadMatch";
import { queueTicketSummary } from "@/lib/ai/summarize";
import { sendEmail } from "@/lib/email/gmail";
import type { ParsedInboundEmail } from "@/lib/email/parse";
import { statusUpdateEmail, ticketCreatedEmail, agentReplyEmail } from "@/lib/email/templates";

export async function appendStakeholderMessage(params: {
  ticketId: string;
  body: string;
  sheetRowId?: string | null;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  rfcMessageId?: string | null;
  matchedVia?: "thread" | "ai" | "sheet";
}) {
  const ticket = await prisma.ticket.findUnique({ where: { id: params.ticketId } });
  if (!ticket) throw new Error("Ticket not found");

  const now = new Date();

  await prisma.message.create({
    data: {
      ticketId: ticket.id,
      direction: "INBOUND",
      authorType: "STAKEHOLDER",
      body: params.body,
      gmailMessageId: params.gmailMessageId ?? undefined,
    },
  });

  const auditPayload: Prisma.InputJsonValue = {
    matchedVia: params.matchedVia ?? "ai",
  };
  if (params.sheetRowId) (auditPayload as Record<string, unknown>).sheetRowId = params.sheetRowId;
  if (params.gmailMessageId) (auditPayload as Record<string, unknown>).gmailMessageId = params.gmailMessageId;
  if (params.rfcMessageId) (auditPayload as Record<string, unknown>).rfcMessageId = params.rfcMessageId;
  if (params.matchedVia === "ai") (auditPayload as Record<string, unknown>).matchedViaAI = true;
  if (params.matchedVia === "thread") (auditPayload as Record<string, unknown>).matchedViaThread = true;

  await prisma.auditEvent.create({
    data: {
      ticketId: ticket.id,
      type: "EMAIL_RECEIVED",
      payload: auditPayload,
    },
  });

  const ticketUpdate: {
    lastStakeholderUpdateAt: Date;
    gmailThreadId?: string;
  } = { lastStakeholderUpdateAt: now };

  if (params.gmailThreadId && !ticket.gmailThreadId) {
    ticketUpdate.gmailThreadId = params.gmailThreadId;
  }

  let updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: ticketUpdate,
  });

  if (ticket.status === "IN_REVIEW") {
    updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: ticket.startedAt ?? now,
      },
    });
    await prisma.auditEvent.create({
      data: {
        ticketId: ticket.id,
        type: "STATUS_CHANGED",
        payload: {
          from: "IN_REVIEW",
          to: "IN_PROGRESS",
          reason:
            params.matchedVia === "thread"
              ? "stakeholder_reply_thread_match"
              : "stakeholder_reply_ai_match",
        },
      },
    });
  }

  queueTicketSummary(ticket.id);
  return updated;
}

export async function createTicketFromGmail(
  parsed: ParsedInboundEmail
): Promise<{ ticket: Ticket; created: boolean; matched?: boolean; skipped?: boolean }> {
  const processed = await prisma.processedEmail.findUnique({
    where: { gmailMessageId: parsed.gmailMessageId },
  });
  if (processed) {
    const existingMessage = await prisma.message.findFirst({
      where: { gmailMessageId: parsed.gmailMessageId },
      include: { ticket: true },
    });
    if (existingMessage?.ticket) {
      return { ticket: existingMessage.ticket, created: false, skipped: true };
    }
    return { ticket: {} as Ticket, created: false, skipped: true };
  }

  const threadTicket = await prisma.ticket.findFirst({
    where: {
      gmailThreadId: parsed.gmailThreadId,
      status: { not: "COMPLETE" },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (threadTicket) {
    const ticket = await appendStakeholderMessage({
      ticketId: threadTicket.id,
      body: parsed.body,
      gmailMessageId: parsed.gmailMessageId,
      gmailThreadId: parsed.gmailThreadId,
      rfcMessageId: parsed.rfcMessageId,
      matchedVia: "thread",
    });

    await prisma.processedEmail.upsert({
      where: { gmailMessageId: parsed.gmailMessageId },
      create: { gmailMessageId: parsed.gmailMessageId },
      update: { processedAt: new Date() },
    });

    return { ticket, created: false, matched: true };
  }

  const match = await findMatchingTicket({
    title: parsed.subject,
    description: parsed.body,
    requesterEmail: parsed.requesterEmail,
  });

  if (match.matchedTicketId) {
    const ticket = await appendStakeholderMessage({
      ticketId: match.matchedTicketId,
      body: parsed.body,
      gmailMessageId: parsed.gmailMessageId,
      gmailThreadId: parsed.gmailThreadId,
      rfcMessageId: parsed.rfcMessageId,
      matchedVia: "ai",
    });

    await prisma.processedEmail.upsert({
      where: { gmailMessageId: parsed.gmailMessageId },
      create: { gmailMessageId: parsed.gmailMessageId },
      update: { processedAt: new Date() },
    });

    return { ticket, created: false, matched: true };
  }

  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: parsed.subject,
      description: parsed.body,
      category: "OTHER",
      urgency: "MEDIUM",
      requesterEmail: parsed.requesterEmail,
      requesterName: parsed.requesterName,
      gmailThreadId: parsed.gmailThreadId,
      gmailMessageId: parsed.gmailMessageId,
      lastStakeholderUpdateAt: now,
      status: "NOT_STARTED",
      messages: {
        create: {
          direction: "INBOUND",
          authorType: "STAKEHOLDER",
          body: parsed.body,
          gmailMessageId: parsed.gmailMessageId,
        },
      },
      auditEvents: {
        create: {
          type: "CREATED",
          payload: {
            source: "gmail",
            gmailMessageId: parsed.gmailMessageId,
            gmailThreadId: parsed.gmailThreadId,
            rfcMessageId: parsed.rfcMessageId,
          },
        },
      },
    },
  });

  await sendTicketCreatedEmail(ticket, parsed.rfcMessageId);
  queueTicketSummary(ticket.id);

  await prisma.processedEmail.upsert({
    where: { gmailMessageId: parsed.gmailMessageId },
    create: { gmailMessageId: parsed.gmailMessageId },
    update: { processedAt: new Date() },
  });

  return { ticket, created: true, matched: false };
}

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
}): Promise<{ ticket: Ticket; created: boolean; matched?: boolean }> {
  const dedupeId =
    (params.externalId ? `sheet-${params.externalId}` : null) ??
    (params.sheetRowId ? `sheet-row-${params.sheetRowId}` : null);

  if (dedupeId) {
    const processed = await prisma.processedEmail.findUnique({
      where: { gmailMessageId: dedupeId },
    });
    if (processed) {
      if (params.sheetRowId) {
        const priorAppend = await prisma.auditEvent.findFirst({
          where: {
            type: "EMAIL_RECEIVED",
            payload: { path: ["sheetRowId"], equals: params.sheetRowId },
          },
          include: { ticket: true },
          orderBy: { createdAt: "desc" },
        });
        if (priorAppend?.ticket) {
          return { ticket: priorAppend.ticket, created: false, matched: true };
        }
      }

      const existing = await prisma.ticket.findUnique({
        where: { gmailMessageId: dedupeId },
      });
      if (existing) return { ticket: existing, created: false };
    }

    const existing = await prisma.ticket.findUnique({
      where: { gmailMessageId: dedupeId },
    });
    if (existing) return { ticket: existing, created: false };
  }

  const match = await findMatchingTicket({
    title: params.title,
    description: params.description,
    requesterEmail: params.requesterEmail,
  });

  if (match.matchedTicketId) {
    const ticket = await appendStakeholderMessage({
      ticketId: match.matchedTicketId,
      body: params.description,
      sheetRowId: params.sheetRowId,
      matchedVia: "ai",
    });

    if (dedupeId) {
      await prisma.processedEmail.upsert({
        where: { gmailMessageId: dedupeId },
        create: { gmailMessageId: dedupeId },
        update: { processedAt: new Date() },
      });
    }

    return { ticket, created: false, matched: true };
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

  queueTicketSummary(ticket.id);

  if (dedupeId) {
    await prisma.processedEmail.upsert({
      where: { gmailMessageId: dedupeId },
      create: { gmailMessageId: dedupeId },
      update: { processedAt: new Date() },
    });
  }

  return { ticket, created: true, matched: false };
}

async function getThreadReplyHeaders(ticketId: string): Promise<{
  threadId: string | null;
  inReplyTo: string | null;
}> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { gmailThreadId: true },
  });

  const lastReceived = await prisma.auditEvent.findFirst({
    where: { ticketId, type: "EMAIL_RECEIVED" },
    orderBy: { createdAt: "desc" },
    select: { payload: true },
  });

  const created = await prisma.auditEvent.findFirst({
    where: { ticketId, type: "CREATED" },
    orderBy: { createdAt: "asc" },
    select: { payload: true },
  });

  const receivedPayload = lastReceived?.payload as { rfcMessageId?: string } | null;
  const createdPayload = created?.payload as { rfcMessageId?: string } | null;
  const rfcMessageId = receivedPayload?.rfcMessageId ?? createdPayload?.rfcMessageId ?? null;

  return {
    threadId: ticket?.gmailThreadId ?? null,
    inReplyTo: rfcMessageId,
  };
}

async function recordOutboundEmail(
  ticket: Ticket,
  body: string,
  sent: { id: string; threadId: string },
  auditKind: string,
  auditExtra?: Record<string, unknown>
) {
  const ticketUpdate: { gmailThreadId?: string } = {};
  if (!ticket.gmailThreadId) {
    ticketUpdate.gmailThreadId = sent.threadId;
  }

  if (Object.keys(ticketUpdate).length > 0) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: ticketUpdate,
    });
  }

  await prisma.message.create({
    data: {
      ticketId: ticket.id,
      direction: "OUTBOUND",
      authorType: "SYSTEM",
      body,
      gmailMessageId: sent.id,
    },
  });

  await prisma.auditEvent.create({
    data: {
      ticketId: ticket.id,
      type: "EMAIL_SENT",
      payload: {
        kind: auditKind,
        gmailMessageId: sent.id,
        gmailThreadId: sent.threadId,
        ...auditExtra,
      },
    },
  });
}

async function sendTicketCreatedEmail(ticket: Ticket, inReplyToRfc?: string | null) {
  const { subject, body } = ticketCreatedEmail(ticket);
  const headers = await getThreadReplyHeaders(ticket.id);

  try {
    const sent = await sendEmail({
      to: ticket.requesterEmail,
      subject,
      body,
      threadId: ticket.gmailThreadId ?? headers.threadId,
      inReplyTo: inReplyToRfc ?? headers.inReplyTo,
      references: inReplyToRfc ?? headers.inReplyTo,
    });

    if (sent) {
      await recordOutboundEmail(ticket, body, sent, "ticket_created");
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
  const headers = await getThreadReplyHeaders(ticket.id);

  try {
    const sent = await sendEmail({
      to: ticket.requesterEmail,
      subject,
      body,
      threadId: ticket.gmailThreadId ?? headers.threadId,
      inReplyTo: headers.inReplyTo,
      references: headers.inReplyTo,
    });

    if (sent) {
      await recordOutboundEmail(ticket, body, sent, "status_update", { status });
    }
  } catch (err) {
    console.error("Failed to send status notification:", err);
  }
}

export async function sendAgentReply(ticket: Ticket, reply: string) {
  const { subject, body } = agentReplyEmail(ticket, reply);
  const headers = await getThreadReplyHeaders(ticket.id);

  try {
    const sent = await sendEmail({
      to: ticket.requesterEmail,
      subject,
      body,
      threadId: ticket.gmailThreadId ?? headers.threadId,
      inReplyTo: headers.inReplyTo,
      references: headers.inReplyTo,
    });

    if (sent) {
      await recordOutboundEmail(ticket, body, sent, "agent_reply");
    }
  } catch (err) {
    console.error("Failed to send agent reply:", err);
    throw err;
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
    await sendAgentReply(ticket, params.body);
  }

  queueTicketSummary(ticket.id, params.userId);
  return message;
}
