import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api";
import { renewGmailWatch } from "@/lib/email/gmailSync";

/**
 * POST /api/cron/gmail-watch
 * Renews Gmail users.watch (expires every ~7 days). Secured with CRON_SECRET.
 */
export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await renewGmailWatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Gmail watch renewal failed:", err);
    return NextResponse.json({ error: "Watch renewal failed" }, { status: 500 });
  }
}
