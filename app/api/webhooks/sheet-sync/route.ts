import { NextResponse } from "next/server";
import type { TicketCategory, Urgency } from "@prisma/client";
import { verifySheetWebhookSecret } from "@/lib/api";
import { createTicketFromSheet } from "@/lib/tickets/service";

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
 * POST /api/webhooks/sheet-sync
 * Auth: Authorization: Bearer <SHEET_WEBHOOK_SECRET>
 *
 * Called by the Apps Script bound to the Google Sheet
 * (scripts/apps-script-sheet-sync.gs) — no Zapier involved.
 */
export async function POST(request: Request) {
  if (!verifySheetWebhookSecret(request)) {
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
    const result = await createTicketFromSheet({
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
      sheetRowId: pick(body, ["sheetRowId", "sheet_row_id", "row_id", "Row ID"]),
      externalId: pick(body, ["externalId", "external_id", "id", "ID"]),
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
    console.error("Sheet sync webhook error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create ticket" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/webhooks/sheet-sync",
    auth: "Authorization: Bearer <SHEET_WEBHOOK_SECRET>",
    requiredFields: ["title", "description|summary", "requesterEmail|from"],
    source: "Google Apps Script (see scripts/apps-script-sheet-sync.gs)",
  });
}
