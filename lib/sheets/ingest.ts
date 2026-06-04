import { prisma } from "@/lib/db/prisma";
import type { TicketCategory, Urgency } from "@prisma/client";
import { createTicketFromZapier } from "@/lib/tickets/service";
import { fetchSheetRows, rowGet, rowIsLegal } from "@/lib/sheets/client";

const CATEGORIES: TicketCategory[] = ["AGREEMENT", "DATA_PROTECTION", "OTHER"];
const URGENCIES: Urgency[] = ["LOW", "MEDIUM", "HIGH"];

function normalizeCategory(value?: string): TicketCategory {
  const s = (value ?? "OTHER").toUpperCase().replace(/\s+/g, "_");
  if (CATEGORIES.includes(s as TicketCategory)) return s as TicketCategory;
  if (s.includes("AGREEMENT") || s.includes("CONTRACT")) return "AGREEMENT";
  if (s.includes("DATA") || s.includes("PRIVACY") || s.includes("GDPR")) {
    return "DATA_PROTECTION";
  }
  return "OTHER";
}

function normalizeUrgency(value?: string): Urgency {
  const s = (value ?? "MEDIUM").toUpperCase();
  if (URGENCIES.includes(s as Urgency)) return s as Urgency;
  return "MEDIUM";
}

export type SheetIngestResult = {
  scanned: number;
  legalRows: number;
  created: number;
  skipped: number;
  errors: string[];
};

export async function pollSheetAndIngest(): Promise<SheetIngestResult> {
  const result: SheetIngestResult = {
    scanned: 0,
    legalRows: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  const rows = await fetchSheetRows();

  for (const row of rows) {
    result.scanned++;
    if (!rowIsLegal(row)) continue;
    result.legalRows++;

    const sheetRowId =
      rowGet(row, "row_id", "rowid", "id", "sheet_row_id") ?? row._sheet_row_number;
    const dedupeKey = `sheet-row-${sheetRowId}`;

    const already = await prisma.processedEmail.findUnique({
      where: { gmailMessageId: dedupeKey },
    });
    if (already) {
      result.skipped++;
      continue;
    }

    const title = rowGet(row, "title", "subject");
    const description = rowGet(row, "summary", "description", "body");
    const requesterEmail = rowGet(row, "from", "requester_email", "requesteremail", "sender_email");

    if (!title || !description || !requesterEmail) {
      result.errors.push(`Row ${sheetRowId}: missing title, summary, or from`);
      continue;
    }

    try {
      const { created } = await createTicketFromZapier({
        title,
        description,
        requesterEmail,
        requesterName: rowGet(row, "from_name", "requester_name", "requestername"),
        category: normalizeCategory(rowGet(row, "category")),
        urgency: normalizeUrgency(rowGet(row, "urgency")),
        sheetRowId,
        gmailMessageId: rowGet(row, "message_id", "gmail_message_id"),
        gmailThreadId: rowGet(row, "thread_id", "gmail_thread_id"),
        notifyRequester: false,
      });

      if (created) result.created++;
      else result.skipped++;

      await prisma.processedEmail.upsert({
        where: { gmailMessageId: dedupeKey },
        create: { gmailMessageId: dedupeKey },
        update: { processedAt: new Date() },
      });
    } catch (err) {
      result.errors.push(`Row ${sheetRowId}: ${String(err)}`);
    }
  }

  return result;
}
