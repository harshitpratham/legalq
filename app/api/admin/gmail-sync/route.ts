import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { syncGmailInbox } from "@/lib/email/gmailSync";

/**
 * POST /api/admin/gmail-sync
 * Manual Gmail inbox sync for admins (session auth).
 */
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const sync = await syncGmailInbox();
    return NextResponse.json({ ok: true, ...sync });
  } catch (err) {
    console.error("Admin Gmail sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
