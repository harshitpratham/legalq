import { getGmailClient } from "@/lib/gmail/client";

function encodeMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmailInThread(options: {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyToMessageId?: string | null;
}): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient();
  const from = process.env.SYSTEM_EMAIL_FROM ?? process.env.GMAIL_INBOX_EMAIL;
  const fromName = process.env.SYSTEM_EMAIL_FROM_NAME ?? "Pratham Legal";

  if (!from) {
    throw new Error("SYSTEM_EMAIL_FROM or GMAIL_INBOX_EMAIL must be set");
  }

  const headers = [
    `From: ${fromName} <${from}>`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];

  if (options.inReplyToMessageId) {
    headers.push(`In-Reply-To: <${options.inReplyToMessageId}>`);
    headers.push(`References: <${options.inReplyToMessageId}>`);
  }

  const raw = [...headers, "", options.body].join("\r\n");
  const encoded = encodeMessage(raw);

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      threadId: options.threadId ?? undefined,
    },
  });

  return {
    messageId: res.data.id ?? "",
    threadId: res.data.threadId ?? options.threadId ?? "",
  };
}
