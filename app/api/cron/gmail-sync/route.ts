import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api";
import { syncGmailInbox } from "@/lib/email/gmailSync";

/**
 * POST /api/cron/gmail-sync
 * Polls Gmail history and processes missed inbound emails. Secured with CRON_SECRET.
 */
export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sync = await syncGmailInbox();
    return NextResponse.json({ ok: true, ...sync });
  } catch (err) {
    console.error("Gmail sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
