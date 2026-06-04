import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api";
import { sendIdleReminders } from "@/lib/tickets/service";

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Number(process.env.REMINDER_IDLE_DAYS ?? "7");
  try {
    const count = await sendIdleReminders(days);
    return NextResponse.json({ ok: true, remindersSent: count, daysIdle: days });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Reminders failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
