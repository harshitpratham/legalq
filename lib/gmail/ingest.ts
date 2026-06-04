import { prisma } from "@/lib/db/prisma";
import { triageEmail } from "@/lib/bedrock/triage";
import { listUnreadInboxMessages, markMessageAsRead } from "@/lib/gmail/client";
import {
  createTicketFromEmail,
  findTicketForEmail,
  ingestStakeholderReply,
} from "@/lib/tickets/service";

export type IngestResult = {
  processed: number;
  created: number;
  replies: number;
  skipped: number;
  errors: string[];
};

export async function pollInboxAndIngest(): Promise<IngestResult> {
  const result: IngestResult = {
    processed: 0,
    created: 0,
    replies: 0,
    skipped: 0,
    errors: [],
  };

  let emails;
  try {
    emails = await listUnreadInboxMessages(25);
  } catch (err) {
    result.errors.push(`Failed to list inbox: ${String(err)}`);
    return result;
  }

  const systemFrom = (
    process.env.SYSTEM_EMAIL_FROM ??
    process.env.GMAIL_INBOX_EMAIL ??
    ""
  ).toLowerCase();

  for (const email of emails) {
    result.processed++;

    const alreadyProcessed = await prisma.processedEmail.findUnique({
      where: { gmailMessageId: email.id },
    });
    if (alreadyProcessed) {
      result.skipped++;
      continue;
    }

    if (systemFrom && email.from === systemFrom) {
      await markProcessed(email.id);
      result.skipped++;
      continue;
    }

    try {
      const existingTicket = await findTicketForEmail({
        threadId: email.threadId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        from: email.from,
      });

      if (existingTicket) {
        if (email.from === existingTicket.requesterEmail.toLowerCase()) {
          await ingestStakeholderReply({
            ticketId: existingTicket.id,
            body: email.body || email.snippet,
            gmailMessageId: email.id,
            autoMoveToInProgress: true,
          });
          result.replies++;
        } else {
          result.skipped++;
        }
        await markProcessed(email.id);
        continue;
      }

      const duplicateByMessage = await prisma.ticket.findUnique({
        where: { gmailMessageId: email.id },
      });
      if (duplicateByMessage) {
        result.skipped++;
        await markProcessed(email.id);
        continue;
      }

      const triage = await triageEmail({
        subject: email.subject,
        body: email.body || email.snippet,
        from: email.from,
      });

      if (!triage.isLegalRequest || triage.confidence < 0.3) {
        result.skipped++;
        await markProcessed(email.id);
        continue;
      }

      await createTicketFromEmail({
        title: triage.title,
        description: triage.summary || email.body || email.snippet,
        category: triage.category,
        urgency: triage.urgency,
        requesterEmail: email.from,
        requesterName: email.fromName,
        gmailThreadId: email.threadId,
        gmailMessageId: email.id,
      });

      result.created++;
      await markProcessed(email.id);
    } catch (err) {
      result.errors.push(`Message ${email.id}: ${String(err)}`);
    }
  }

  return result;
}

async function markProcessed(gmailMessageId: string) {
  await prisma.processedEmail.upsert({
    where: { gmailMessageId },
    create: { gmailMessageId },
    update: { processedAt: new Date() },
  });

  try {
    await markMessageAsRead(gmailMessageId);
  } catch {
    // non-fatal
  }
}
