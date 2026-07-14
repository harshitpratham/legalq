import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/** Simple liveness check for Railway — no auth or env vars required */
export async function GET() {
  let lastGmailSyncAt: string | null = null;
  let gmailSyncAgeSeconds: number | null = null;

  try {
    const state = await prisma.gmailSyncState.findUnique({ where: { id: "default" } });
    if (state?.updatedAt) {
      lastGmailSyncAt = state.updatedAt.toISOString();
      gmailSyncAgeSeconds = Math.round((Date.now() - state.updatedAt.getTime()) / 1000);
    }
  } catch {
    // DB not reachable yet — still report ok so Railway's healthcheck doesn't loop-restart.
  }

  return NextResponse.json({
    ok: true,
    service: "legalq",
    lastGmailSyncAt,
    gmailSyncAgeSeconds,
  });
}
