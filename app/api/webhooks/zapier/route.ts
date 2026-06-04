import { NextResponse } from "next/server";
import type { TicketCategory, Urgency } from "@prisma/client";
import { verifyZapierSecret } from "@/lib/api";
import { createTicketFromZapier } from "@/lib/tickets/service";

const CATEGORIES: TicketCategory[] = ["AGREEMENT", "DATA_PROTECTION", "OTHER"];
const URGENCIES: Urgency[] = ["LOW", "MEDIUM", "HIGH"];

function normalizeCategory(value: unknown): TicketCategory {
  const s = String(value ?? "OTHER").toUpperCase().replace(/\s+/g, "_");
  if (CATEGORIES.includes(s as TicketCategory)) return s as TicketCategory;
  if (s.includes("AGREEMENT") || s.includes("CONTRACT")) return "AGREEMENT";
  if (s.includes("DATA") || s.includes("PRIVACY") || s.includes("GDPR")) {
    return "DATA_PROTECTION";
  }
  return "OTHER";
}

function normalizeUrgency(value: unknown): Urgency {
  const s = String(value ?? "MEDIUM").toUpperCase();
  if (URGENCIES.includes(s as Urgency)) return s as Urgency;
  return "MEDIUM";
}

function pick(body: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = body[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return undefined;
}

/**
 * POST /api/webhooks/zapier
 * Auth: Authorization: Bearer <ZAPIER_WEBHOOK_SECRET>
 *
 * Accepts JSON from Zapier (Google Sheets row). Typical sheet columns map to:
 * title, summary/description, category, urgency, requesterEmail, requesterName,
 * gmailMessageId, gmailThreadId, sheetRowId, externalId
 */
export async function POST(request: Request) {
  if (!verifyZapierSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = pick(body, ["title", "Title", "ticket_title"]);
  const description = pick(body, [
    "description",
    "Description",
    "summary",
    "Summary",
    "body",
    "Body",
  ]);
  const requesterEmail = pick(body, [
    "requesterEmail",
    "requester_email",
    "from",
    "From",
    "sender_email",
    "Sender Email",
  ]);

  if (!title || !description || !requesterEmail) {
    return NextResponse.json(
      {
        error: "Missing required fields",
        required: ["title", "description (or summary)", "requesterEmail (or from)"],
        received: Object.keys(body),
      },
      { status: 400 }
    );
  }

  const isLegal = body.isLegalRequest ?? body.is_legal_request ?? body["Is Legal"];
  if (isLegal === false || isLegal === "false" || isLegal === "FALSE") {
    return NextResponse.json(
      { skipped: true, reason: "isLegalRequest is false" },
      { status: 200 }
    );
  }

  try {
    const result = await createTicketFromZapier({
      title,
      description,
      requesterEmail,
      requesterName: pick(body, [
        "requesterName",
        "requester_name",
        "from_name",
        "From Name",
        "sender_name",
      ]),
      category: normalizeCategory(
        body.category ?? body.Category ?? body["Category"]
      ),
      urgency: normalizeUrgency(body.urgency ?? body.Urgency ?? body["Urgency"]),
      gmailMessageId: pick(body, [
        "gmailMessageId",
        "gmail_message_id",
        "message_id",
        "Message ID",
      ]),
      gmailThreadId: pick(body, [
        "gmailThreadId",
        "gmail_thread_id",
        "thread_id",
        "Thread ID",
      ]),
      sheetRowId: pick(body, ["sheetRowId", "sheet_row_id", "row_id", "Row ID"]),
      externalId: pick(body, ["externalId", "external_id", "id", "ID"]),
      notifyRequester:
        body.notifyRequester === true ||
        body.notify_requester === true ||
        body.sendNotification === true,
    });

    return NextResponse.json(
      {
        ok: true,
        created: result.created,
        ticket: {
          id: result.ticket.id,
          title: result.ticket.title,
          status: result.ticket.status,
          category: result.ticket.category,
          urgency: result.ticket.urgency,
        },
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    console.error("Zapier webhook error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create ticket" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/webhooks/zapier",
    auth: "Authorization: Bearer <ZAPIER_WEBHOOK_SECRET>",
    requiredFields: ["title", "description|summary", "requesterEmail|from"],
  });
}
