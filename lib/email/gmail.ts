import { createSign } from "crypto";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SCOPES = `${GMAIL_SEND_SCOPE} ${GMAIL_READONLY_SCOPE}`;

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
  internalDate?: string;
};

export type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
};

export type GmailHistoryRecord = {
  id: string;
  messages?: { id: string; threadId: string }[];
  messagesAdded?: { message: { id: string; threadId: string } }[];
  labelsAdded?: { message: { id: string; threadId: string }; labelIds?: string[] }[];
};

export type GmailWatchResult = {
  historyId: string;
  expiration: string;
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function getInboxEmail(): string {
  return process.env.GMAIL_INBOX_EMAIL ?? process.env.GMAIL_SEND_AS ?? "legal@prathaminternational.org";
}

function getFromAddress() {
  return {
    email: process.env.GMAIL_SEND_AS ?? "legal@prathaminternational.org",
    name: process.env.GMAIL_FROM_NAME ?? "Pratham Legal",
  };
}

function normalizePrivateKey(key: string): string {
  const trimmed = key.replace(/\\n/g, "\n").trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed;
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function getServiceAccountCreds(): { clientEmail: string; privateKey: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: normalizePrivateKey(parsed.private_key),
        };
      }
    } catch {
      console.error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON");
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (email && key) {
    return { clientEmail: email, privateKey: normalizePrivateKey(key) };
  }

  return null;
}

function createServiceAccountJwt(
  clientEmail: string,
  privateKey: string,
  subject: string,
  scope: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: clientEmail,
      sub: subject,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(privateKey, "base64url");
  return `${signInput}.${signature}`;
}

async function getServiceAccountAccessToken(
  subject: string,
  scope: string = GMAIL_SCOPES
): Promise<string | null> {
  const creds = getServiceAccountCreds();
  if (!creds) return null;

  const jwt = createServiceAccountJwt(creds.clientEmail, creds.privateKey, subject, scope);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Google service account token error:", res.status, errText);
    return null;
  }

  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function getRefreshTokenAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Google refresh token error:", res.status, errText);
    return null;
  }

  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function getGmailAccessToken(): Promise<string | null> {
  const inboxEmail = getInboxEmail();
  return (await getServiceAccountAccessToken(inboxEmail)) ?? (await getRefreshTokenAccessToken());
}

async function gmailFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGmailAccessToken();
  if (!token) {
    throw new Error("Gmail not configured — set service account or OAuth env vars");
  }

  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function buildRawEmail(params: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const from = getFromAddress();
  const lines = [
    `From: ${from.name} <${from.email}>`,
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];

  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`);
  }
  if (params.references) {
    lines.push(`References: ${params.references}`);
  }

  lines.push("", Buffer.from(params.body).toString("base64"));
  return lines.join("\r\n");
}

function encodeGmailRaw(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}): Promise<{ id: string; threadId: string } | null> {
  const token = await getGmailAccessToken();
  if (!token) {
    console.warn(
      "Gmail not configured — set service account (domain-wide delegation) or OAuth refresh token env vars"
    );
    return null;
  }

  const sendBody: { raw: string; threadId?: string } = {
    raw: encodeGmailRaw(
      buildRawEmail({
        to: params.to,
        subject: params.subject,
        body: params.body,
        inReplyTo: params.inReplyTo ?? undefined,
        references: params.references ?? params.inReplyTo ?? undefined,
      })
    ),
  };

  if (params.threadId) {
    sendBody.threadId = params.threadId;
  }

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sendBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { id: string; threadId: string };
  return { id: data.id, threadId: data.threadId };
}

export async function fetchMessage(messageId: string): Promise<GmailMessage | null> {
  const res = await gmailFetch(`/messages/${messageId}?format=full`);
  if (!res.ok) {
    const errText = await res.text();
    console.error(`fetchMessage ${messageId} failed:`, res.status, errText);
    return null;
  }
  return (await res.json()) as GmailMessage;
}

export async function listHistory(
  startHistoryId: string
): Promise<{ history: GmailHistoryRecord[]; historyId?: string } | null> {
  const params = new URLSearchParams({
    startHistoryId,
    labelId: "INBOX",
  });
  params.append("historyTypes", "messageAdded");
  params.append("historyTypes", "labelAdded");

  const res = await gmailFetch(`/history?${params.toString()}`);
  if (res.status === 404) {
    console.warn("Gmail historyId expired — reset watch to continue from current point");
    return { history: [] };
  }
  if (!res.ok) {
    const errText = await res.text();
    console.error("listHistory failed:", res.status, errText);
    return null;
  }

  const data = (await res.json()) as {
    history?: GmailHistoryRecord[];
    historyId?: string;
  };
  return { history: data.history ?? [], historyId: data.historyId };
}

export async function registerWatch(): Promise<GmailWatchResult | null> {
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) {
    console.error("GMAIL_PUBSUB_TOPIC not set");
    return null;
  }

  const res = await gmailFetch("/watch", {
    method: "POST",
    body: JSON.stringify({
      topicName: topic,
      labelIds: ["INBOX"],
      labelFilterBehavior: "include",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("registerWatch failed:", res.status, errText);
    return null;
  }

  return (await res.json()) as GmailWatchResult;
}

export async function stopWatch(): Promise<void> {
  await gmailFetch("/stop", { method: "POST" });
}

export async function getGmailProfile(): Promise<{ historyId: string; emailAddress: string } | null> {
  const res = await gmailFetch("/profile");
  if (!res.ok) {
    const errText = await res.text();
    console.error("getGmailProfile failed:", res.status, errText);
    return null;
  }
  return (await res.json()) as { historyId: string; emailAddress: string };
}
