import { google } from "googleapis";

export type ParsedEmail = {
  id: string;
  threadId: string;
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  body: string;
  snippet: string;
  inReplyTo: string | null;
  references: string[];
  date: Date;
};

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function extractHeader(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string
): string | null {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function extractBody(payload: {
  mimeType?: string | null;
  body?: { data?: string | null };
  parts?: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] }[];
}): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  }
  return "";
}

function parseFromHeader(from: string): { email: string; name: string | null } {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim().toLowerCase() };
  }
  return { name: null, email: from.trim().toLowerCase() };
}

export function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail credentials not configured (GMAIL_REFRESH_TOKEN required)");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: "v1", auth: oauth2 });
}

export function parseGmailMessage(
  message: {
    id?: string | null;
    threadId?: string | null;
    snippet?: string | null;
    internalDate?: string | null;
    payload?: {
      headers?: { name?: string | null; value?: string | null }[];
      mimeType?: string | null;
      body?: { data?: string | null };
      parts?: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] }[];
    };
  }
): ParsedEmail | null {
  if (!message.id || !message.threadId) return null;

  const headers = message.payload?.headers;
  const fromRaw = extractHeader(headers, "From") ?? "";
  const { email, name } = parseFromHeader(fromRaw);
  const referencesRaw = extractHeader(headers, "References");
  const references = referencesRaw ? referencesRaw.split(/\s+/).filter(Boolean) : [];

  return {
    id: message.id,
    threadId: message.threadId,
    from: email,
    fromName: name,
    to: extractHeader(headers, "To") ?? "",
    subject: extractHeader(headers, "Subject") ?? "(no subject)",
    body: extractBody(message.payload ?? {}),
    snippet: message.snippet ?? "",
    inReplyTo: extractHeader(headers, "In-Reply-To"),
    references,
    date: new Date(Number(message.internalDate ?? Date.now())),
  };
}

export async function listUnreadInboxMessages(maxResults = 20) {
  const gmail = getGmailClient();
  const inboxEmail = process.env.GMAIL_INBOX_EMAIL;

  let query = "is:unread in:inbox";
  if (inboxEmail) {
    query += ` to:${inboxEmail}`;
  }

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = list.data.messages ?? [];
  const parsed: ParsedEmail[] = [];

  for (const m of messages) {
    if (!m.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "full",
    });
    const p = parseGmailMessage(full.data);
    if (p) parsed.push(p);
  }

  return parsed;
}

export async function getMessageById(messageId: string) {
  const gmail = getGmailClient();
  const full = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return parseGmailMessage(full.data);
}

export async function markMessageAsRead(messageId: string) {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}
