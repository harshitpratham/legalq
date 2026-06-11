import { NextResponse } from "next/server";

/** Simple liveness check for Railway — no auth or env vars required */
export async function GET() {
  return NextResponse.json({ ok: true, service: "legalq" });
}
