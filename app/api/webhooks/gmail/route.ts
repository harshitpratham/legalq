import { NextResponse } from "next/server";
import { processInboundGmailHistory, verifyPubSubJwt } from "@/lib/email/gmailSync";

type PubSubPushBody = {
  message?: {
    data?: string;
    messageId?: string;
  };
  subscription?: string;
};

/**
 * POST /api/webhooks/gmail
 * Gmail Pub/Sub push subscription endpoint.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const verified = await verifyPubSubJwt(authHeader);
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PubSubPushBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataB64 = body.message?.data;
  if (!dataB64) {
    return NextResponse.json({ error: "Missing message data" }, { status: 400 });
  }

  let notification: { emailAddress?: string; historyId?: string };
  try {
    notification = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  if (!notification.historyId) {
    return NextResponse.json({ error: "Missing historyId" }, { status: 400 });
  }

  try {
    const result = await processInboundGmailHistory(notification.historyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Gmail webhook processing failed:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
