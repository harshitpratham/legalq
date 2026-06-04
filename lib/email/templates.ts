import type { Ticket, TicketStatus } from "@prisma/client";

const SYSTEM_NAME = process.env.SYSTEM_EMAIL_FROM_NAME ?? "Pratham Legal";

export function ticketCreatedEmail(ticket: Ticket): { subject: string; body: string } {
  return {
    subject: `[Legal] Request received: ${ticket.title}`,
    body: `Hello${ticket.requesterName ? ` ${ticket.requesterName}` : ""},

We have received your legal request and created ticket #${ticket.id.slice(-8)}.

Summary: ${ticket.description.slice(0, 500)}${ticket.description.length > 500 ? "..." : ""}

You will receive an update when the legal team begins working on your request.

Thank you,
${SYSTEM_NAME}`,
  };
}

export function statusUpdateEmail(
  ticket: Ticket,
  newStatus: TicketStatus,
  comment?: string
): { subject: string; body: string } {
  const statusMessages: Record<TicketStatus, string> = {
    NOT_STARTED: "Your request is queued and not yet started.",
    IN_PROGRESS: "The legal team has started working on your request.",
    IN_REVIEW:
      "We need additional information to proceed. Please reply to this email with your answers.",
    COMPLETE: "Your legal request has been completed. Please see the details below.",
  };

  let body = `Hello${ticket.requesterName ? ` ${ticket.requesterName}` : ""},

${statusMessages[newStatus]}

Ticket: #${ticket.id.slice(-8)}
Subject: ${ticket.title}
`;

  if (comment) {
    body += `\n---\n${comment}\n---\n`;
  }

  body += `\nThank you,\n${SYSTEM_NAME}`;

  return {
    subject: `[Legal] Update: ${ticket.title}`,
    body,
  };
}

export function reminderEmail(ticket: Ticket): { subject: string; body: string } {
  return {
    subject: `[Legal] Status update: ${ticket.title}`,
    body: `Hello${ticket.requesterName ? ` ${ticket.requesterName}` : ""},

This is a brief update on your legal request (ticket #${ticket.id.slice(-8)}).

Current status: ${ticket.status.replace(/_/g, " ")}

We are still working on your request and will follow up as soon as there is progress.

Thank you,
${SYSTEM_NAME}`,
  };
}

export function agentReplyNotificationEmail(
  ticket: Ticket,
  replyPreview: string
): { subject: string; body: string } {
  return {
    subject: `[LegalQ] Stakeholder replied: ${ticket.title}`,
    body: `A stakeholder has replied on ticket #${ticket.id.slice(-8)}.

From: ${ticket.requesterEmail}
Subject: ${ticket.title}

Preview:
${replyPreview.slice(0, 1000)}${replyPreview.length > 1000 ? "..." : ""}

View the ticket in LegalQ to respond.`,
  };
}
