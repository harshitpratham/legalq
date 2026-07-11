import type { GmailMessage, GmailMessagePart } from "@/lib/email/gmail";
import { getInboxEmail } from "@/lib/email/gmail";

export type ParsedInboundEmail = {
  gmailMessageId: string;
  gmailThreadId: string;
  requesterEmail: string;
  requesterName: string | null;
  subject: string;
  body: string;
  rfcMessageId: string | null;
};

const SKIP_FROM_PATTERNS = [
  /mailer-daemon/i,
  /postmaster/i,
  /noreply/i,
  /no-reply/i,
  /donotreply/i,
  /notifications?@/i,
];

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function getHeader(message: GmailMessage, name: string): string | null {
  const headers = message.payload?.headers ?? [];
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function extractBodyFromPart(part: GmailMessagePart): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.parts) {
    for (const child of part.parts) {
      const text = extractBodyFromPart(child);
      if (text) return text;
    }
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    const html = decodeBase64Url(part.body.data);
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }

  return "";
}

function stripQuotedReply(body: string): string {
  const lines = body.split("\n");
  const cleaned: string[] = [];

  for (const line of lines) {
    if (/^On .+wrote:?\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(line.trim())) break;
    if (/^From:\s*.+$/i.test(line.trim()) && cleaned.length > 0) break;
    if (line.trim().startsWith(">")) continue;
    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

function parseFromHeader(value: string): { email: string; name: string | null } {
  const angleMatch = value.match(/<([^>]+)>/);
  if (angleMatch) {
    const email = angleMatch[1].trim().toLowerCase();
    const name = value.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || null;
    return { email, name };
  }
  return { email: value.trim().toLowerCase(), name: null };
}

export function shouldSkipInboundMessage(parsed: ParsedInboundEmail): string | null {
  const inboxEmail = getInboxEmail().toLowerCase();

  if (parsed.requesterEmail === inboxEmail) {
    return "from_inbox_self";
  }

  if (!parsed.body.trim()) {
    return "empty_body";
  }

  for (const pattern of SKIP_FROM_PATTERNS) {
    if (pattern.test(parsed.requesterEmail)) {
      return "automated_sender";
    }
  }

  return null;
}

export function parseGmailMessage(message: GmailMessage): ParsedInboundEmail | null {
  if (!message.id || !message.threadId) return null;

  const from = getHeader(message, "From");
  if (!from) return null;

  const { email, name } = parseFromHeader(from);
  const subject = getHeader(message, "Subject") ?? "(no subject)";
  const rawBody = message.payload ? extractBodyFromPart(message.payload) : message.snippet ?? "";
  const body = stripQuotedReply(rawBody) || rawBody.trim();

  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    requesterEmail: email,
    requesterName: name,
    subject,
    body,
    rfcMessageId: getHeader(message, "Message-ID"),
  };
}
