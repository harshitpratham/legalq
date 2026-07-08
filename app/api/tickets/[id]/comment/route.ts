import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api";
import { addComment } from "@/lib/tickets/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { comment, sendToStakeholder } = body;

  if (!comment?.trim()) {
    return NextResponse.json({ error: "comment is required" }, { status: 400 });
  }

  try {
    const message = await addComment({
      ticketId: id,
      body: comment.trim(),
      userId: user!.id,
      sendToStakeholder: Boolean(sendToStakeholder),
    });
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add comment" },
      { status: 400 }
    );
  }
}
