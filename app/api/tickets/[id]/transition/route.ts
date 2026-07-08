import { NextResponse } from "next/server";
import type { TicketStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/api";
import { transitionTicket } from "@/lib/tickets/service";

const VALID_STATUSES: TicketStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "COMPLETE",
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { status, comment, notifyStakeholder } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const ticket = await transitionTicket({
      ticketId: id,
      newStatus: status,
      comment,
      userId: user!.id,
      notifyStakeholder: notifyStakeholder !== false,
    });
    return NextResponse.json({ ticket });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transition failed" },
      { status: 400 }
    );
  }
}
