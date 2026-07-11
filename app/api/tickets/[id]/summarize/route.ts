import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { summarizeTicket } from "@/lib/ai/summarize";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const summary = await summarizeTicket(id, user!.id);
  if (!summary) {
    return NextResponse.json(
      { error: "Could not generate summary (check OPENAI_API_KEY)" },
      { status: 502 }
    );
  }

  return NextResponse.json({ summary });
}
