import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api";
import { pollSheetAndIngest } from "@/lib/sheets/ingest";

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollSheetAndIngest();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sheet poll failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
