#!/usr/bin/env node
/**
 * Diagnose recent Gmail inbox messages and why they were skipped/processed.
 * Usage: GOOGLE_SERVICE_ACCOUNT_JSON="$(cat .secrets/legalq-gmail-sender.json)" node scripts/diagnose-gmail-inbox.mjs
 */
import { createSign } from "crypto";
import { readFileSync } from "fs";

const INBOX = process.env.GMAIL_INBOX_EMAIL || "legal@prathaminternational.org";
const HISTORY_ID = process.argv[2] || "9100";

function base64url(v) {
  return Buffer.from(v).toString("base64url");
}

function getCreds() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const p = JSON.parse(json);
    return { email: p.client_email, key: p.private_key.replace(/\\n/g, "\n") };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (email && key) return { email, key };
  throw new Error("Set GOOGLE_SERVICE_ACCOUNT_JSON or EMAIL+PRIVATE_KEY");
}

async function token() {
  const { email, key } = getCreds();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: email,
      sub: INBOX,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signInput);
  const jwt = `${signInput}.${sign.sign(key, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token failed: " + JSON.stringify(data));
  return data.access_token;
}

async function gmail(path, accessToken) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

function getHeader(msg, name) {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function decodeBody(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const t = decodeBody(child);
    if (t) return t;
  }
  return "";
}

function skipReason(fromEmail, body) {
  if (fromEmail === INBOX.toLowerCase()) return "from_inbox_self";
  if (!body.trim()) return "empty_body";
  if (/mailer-daemon|postmaster|noreply|no-reply|donotreply|notifications?@/i.test(fromEmail))
    return "automated_sender";
  return null;
}

const accessToken = await token();
const profile = await gmail("/profile", accessToken);
console.log("Inbox:", INBOX);
console.log("Profile historyId:", profile.historyId);

const params = new URLSearchParams({ startHistoryId: HISTORY_ID, labelId: "INBOX" });
params.append("historyTypes", "messageAdded");
params.append("historyTypes", "labelAdded");
const history = await gmail(`/history?${params}`, accessToken);

const ids = new Set();
for (const rec of history.history ?? []) {
  for (const a of rec.messagesAdded ?? []) ids.add(a.message.id);
  for (const l of rec.labelsAdded ?? []) {
    if (l.labelIds?.includes("INBOX")) ids.add(l.message.id);
  }
}

console.log(`\nMessages since history ${HISTORY_ID}:`, ids.size);

for (const id of ids) {
  const msg = await gmail(`/messages/${id}?format=full`, accessToken);
  const from = getHeader(msg, "From") ?? "";
  const email = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  const subject = getHeader(msg, "Subject") ?? "(no subject)";
  const body = decodeBody(msg.payload).slice(0, 200);
  const inInbox = msg.labelIds?.includes("INBOX");
  const skip = !inInbox ? "not_in_inbox" : skipReason(email, body);
  console.log("\n---");
  console.log("id:", id, "thread:", msg.threadId);
  console.log("labels:", msg.labelIds?.join(", "));
  console.log("from:", email);
  console.log("subject:", subject);
  console.log("body preview:", body.replace(/\n/g, " ").slice(0, 120));
  console.log("would:", skip ? `SKIP (${skip})` : "PROCESS");
}

// Recent inbox messages
const list = await gmail("/messages?labelIds=INBOX&maxResults=5", accessToken);
console.log("\n=== Last 5 INBOX messages ===");
for (const m of list.messages ?? []) {
  const msg = await gmail(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, accessToken);
  console.log(m.id, getHeader(msg, "Subject"), "|", getHeader(msg, "From"));
}
