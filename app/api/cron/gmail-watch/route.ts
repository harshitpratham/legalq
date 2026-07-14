import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api";
import { renewGmailWatch, syncGmailInbox } from "@/lib/email/gmailSync";

/**
 * POST /api/cron/gmail-watch
 * Renews Gmail users.watch (expires every ~7 days) and syncs any missed inbox messages.
 */
export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Sync first so renew never races ahead of unprocessed inbox mail.
    const sync = await syncGmailInbox();
    const watch = await renewGmailWatch();
    return NextResponse.json({ ok: true, watch, sync });
  } catch (err) {
    console.error("Gmail watch/sync failed:", err);
    return NextResponse.json({ error: "Watch/sync failed" }, { status: 500 });
  }
}
