import { createVerify, X509Certificate } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { createTicketFromGmail } from "@/lib/tickets/service";
import { fetchMessage, getGmailProfile, listHistory, registerWatch } from "@/lib/email/gmail";
import { parseGmailMessage, shouldSkipInboundMessage } from "@/lib/email/parse";

const PRODUCTION_PUSH_ENDPOINT =
  "https://legalq-production.up.railway.app/api/webhooks/gmail";

function getGmailPushAudiences(): string[] {
  const audiences = new Set<string>([PRODUCTION_PUSH_ENDPOINT]);
  if (process.env.GMAIL_PUSH_ENDPOINT) {
    audiences.add(process.env.GMAIL_PUSH_ENDPOINT);
  }
  return [...audiences];
}

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";
const WATCH_RENEW_BUFFER_MS = 24 * 60 * 60 * 1000;

let cachedCerts: Record<string, string> | null = null;
let certsFetchedAt = 0;

async function getGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now - certsFetchedAt < 60 * 60 * 1000) {
    return cachedCerts;
  }
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error("Failed to fetch Google certs");
  cachedCerts = (await res.json()) as Record<string, string>;
  certsFetchedAt = now;
  return cachedCerts;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

export async function verifyPubSubJwt(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const header = decodeJwtPart(parts[0]) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) return false;

  const certs = await getGoogleCerts();
  const certPem = certs[header.kid];
  if (!certPem) return false;

  const cert = new X509Certificate(certPem);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  if (!verifier.verify(cert.publicKey, parts[2], "base64url")) return false;

  const payload = decodeJwtPart(parts[1]) as {
    iss?: string;
    aud?: string;
    exp?: number;
    email?: string;
  };

  if (payload.iss !== "https://accounts.google.com") return false;

  const audiences = getGmailPushAudiences();
  if (!payload.aud || !audiences.includes(payload.aud)) return false;

  if (!payload.exp || payload.exp * 1000 < Date.now()) return false;
  if (!payload.email?.endsWith("@gcp-sa-pubsub.iam.gserviceaccount.com")) return false;

  return true;
}

async function getSyncState() {
  return prisma.gmailSyncState.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

function collectInboxMessageIds(history: { messagesAdded?: { message: { id: string } }[]; labelsAdded?: { message: { id: string }; labelIds?: string[] }[] }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const record of history) {
    for (const added of record.messagesAdded ?? []) {
      const id = added.message?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    for (const labelChange of record.labelsAdded ?? []) {
      if (!labelChange.labelIds?.includes("INBOX")) continue;
      const id = labelChange.message?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}

async function processGmailMessageId(messageId: string): Promise<"processed" | "skipped"> {
  const raw = await fetchMessage(messageId);
  if (!raw) return "skipped";

  if (!raw.labelIds?.includes("INBOX")) {
    return "skipped";
  }

  const parsed = parseGmailMessage(raw);
  if (!parsed) return "skipped";

  const skipReason = shouldSkipInboundMessage(parsed);
  if (skipReason) {
    await prisma.processedEmail.upsert({
      where: { gmailMessageId: parsed.gmailMessageId },
      create: { gmailMessageId: parsed.gmailMessageId },
      update: { processedAt: new Date() },
    });
    return "skipped";
  }

  const result = await createTicketFromGmail(parsed);
  return result.skipped ? "skipped" : "processed";
}

export async function processInboundGmailHistory(notificationHistoryId: string) {
  const state = await getSyncState();
  const startHistoryId = state.historyId;

  if (!startHistoryId) {
    await prisma.gmailSyncState.update({
      where: { id: "default" },
      data: { historyId: notificationHistoryId },
    });
    return { processed: 0, skipped: 0, reason: "no_start_history" };
  }

  const historyResult = await listHistory(startHistoryId);
  if (!historyResult) {
    return { processed: 0, skipped: 0, error: "history_list_failed" };
  }

  let processed = 0;
  let skipped = 0;

  const messageIds = collectInboxMessageIds(historyResult.history);
  for (const messageId of messageIds) {
    const outcome = await processGmailMessageId(messageId);
    if (outcome === "processed") {
      processed++;
    } else {
      skipped++;
    }
  }

  await prisma.gmailSyncState.update({
    where: { id: "default" },
    data: { historyId: notificationHistoryId },
  });

  return { processed, skipped };
}

export async function renewGmailWatch() {
  const state = await getSyncState();
  const now = Date.now();

  if (state.watchExpiresAt && state.watchExpiresAt.getTime() - now > WATCH_RENEW_BUFFER_MS) {
    return {
      renewed: false,
      historyId: state.historyId,
      watchExpiresAt: state.watchExpiresAt.toISOString(),
    };
  }

  const watch = await registerWatch();
  if (!watch) {
    throw new Error("Failed to register Gmail watch");
  }

  const watchExpiresAt = new Date(Number(watch.expiration));

  await prisma.gmailSyncState.update({
    where: { id: "default" },
    data: {
      historyId: watch.historyId,
      watchExpiresAt,
    },
  });

  return {
    renewed: true,
    historyId: watch.historyId,
    watchExpiresAt: watchExpiresAt.toISOString(),
  };
}

/** Poll Gmail history and process any missed inbound messages (fallback if Pub/Sub push fails). */
export async function syncGmailInbox() {
  const profile = await getGmailProfile();
  if (!profile?.historyId) {
    return { processed: 0, skipped: 0, error: "profile_fetch_failed" };
  }
  return processInboundGmailHistory(profile.historyId);
}
