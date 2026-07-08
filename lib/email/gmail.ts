import { createSign } from "crypto";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
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
  subject: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: clientEmail,
      sub: subject,
      scope: GMAIL_SEND_SCOPE,
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

async function getServiceAccountAccessToken(subject: string): Promise<string | null> {
  const creds = getServiceAccountCreds();
  if (!creds) return null;

  const jwt = createServiceAccountJwt(creds.clientEmail, creds.privateKey, subject);
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

async function getAccessToken(): Promise<string | null> {
  const sendAs = getFromAddress().email;
  return (await getServiceAccountAccessToken(sendAs)) ?? (await getRefreshTokenAccessToken());
}

function buildRawEmail(params: { to: string; subject: string; body: string }): string {
  const from = getFromAddress();
  return [
    `From: ${from.name} <${from.email}>`,
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.body).toString("base64"),
  ].join("\r\n");
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
}): Promise<{ id: string } | null> {
  const token = await getAccessToken();
  if (!token) {
    console.warn(
      "Gmail not configured — set service account (domain-wide delegation) or OAuth refresh token env vars"
    );
    return null;
  }

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: encodeGmailRaw(buildRawEmail(params)),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { id: string };
  return { id: data.id };
}
