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
    const watch = await renewGmailWatch();
    const sync = await syncGmailInbox();
    return NextResponse.json({ ok: true, watch, sync });
  } catch (err) {
    console.error("Gmail watch/sync failed:", err);
    return NextResponse.json({ error: "Watch/sync failed" }, { status: 500 });
  }
}
