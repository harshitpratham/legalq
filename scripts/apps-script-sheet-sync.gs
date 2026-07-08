/**
 * LegalQ — Google Sheet → Webhook sync (Apps Script)
 *
 * No Zapier. Bind this script to the Google Sheet that has legal
 * rows (isLegalRequest = TRUE), and it will POST new rows directly
 * to the LegalQ webhook on a timer.
 *
 * SETUP:
 *   1. Open the Sheet → Extensions → Apps Script
 *   2. Delete any placeholder code, paste this whole file
 *   3. Update the CONFIG block below
 *   4. Run `setupTrigger` once from the editor (Run ▶ button) and
 *      approve the permission prompt
 *   5. Done — `syncLegalRows` now runs automatically every 5 minutes
 *
 * Expected header row (row 1), case-insensitive, any order:
 *   row_id | isLegalRequest | title | summary | category | urgency | from | from_name
 *
 * Only `title`, `summary` (or `description`), and `from` (or
 * `requesterEmail`) are required. Everything else is optional.
 */

const CONFIG = {
  WEBHOOK_URL: "https://legalq-production.up.railway.app/api/webhooks/sheet-sync",
  WEBHOOK_SECRET: "glHuje2N0Og5ehBbITvjSIJtSNaDSddg9mQKs2N7", // must match SHEET_WEBHOOK_SECRET on Railway
  SHEET_NAME: "", // leave blank to use the first sheet/tab
  SYNCED_COLUMN_NAME: "synced_at",
};

function setupTrigger() {
  // Remove existing triggers for this function to avoid duplicates
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "syncLegalRows") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("syncLegalRows")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("Trigger created: syncLegalRows will run every 5 minutes.");

  // Run once immediately so you can verify it works right away
  syncLegalRows();
}

function syncLegalRows() {
  const sheet = CONFIG.SHEET_NAME
    ? SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME)
    : SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  if (!sheet) {
    Logger.log("Sheet not found: " + CONFIG.SHEET_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  const headers = data[0].map((h) => String(h || "").trim().toLowerCase());
  let syncedCol = headers.indexOf(CONFIG.SYNCED_COLUMN_NAME.toLowerCase());

  if (syncedCol === -1) {
    syncedCol = headers.length;
    sheet.getRange(1, syncedCol + 1).setValue(CONFIG.SYNCED_COLUMN_NAME);
    headers.push(CONFIG.SYNCED_COLUMN_NAME.toLowerCase());
  }

  const idx = (names) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const col = {
    rowId: idx(["row_id", "rowid", "id"]),
    isLegal: idx(["islegalrequest", "is_legal_request", "legal", "is_legal"]),
    title: idx(["title", "subject"]),
    summary: idx(["summary", "description", "body"]),
    category: idx(["category"]),
    urgency: idx(["urgency"]),
    from: idx(["from", "requester_email", "requesteremail", "sender_email"]),
    fromName: idx(["from_name", "requester_name", "requestername"]),
  };

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const alreadySynced = syncedCol < row.length && row[syncedCol];
    if (alreadySynced) continue;

    const isLegalRaw = col.isLegal !== -1 ? String(row[col.isLegal] || "").toLowerCase() : "true";
    const isLegal = ["true", "yes", "1"].includes(isLegalRaw);

    if (!isLegal) {
      sheet.getRange(r + 1, syncedCol + 1).setValue(new Date().toISOString());
      skipped++;
      continue;
    }

    const title = col.title !== -1 ? String(row[col.title] || "").trim() : "";
    const summary = col.summary !== -1 ? String(row[col.summary] || "").trim() : "";
    const from = col.from !== -1 ? String(row[col.from] || "").trim() : "";

    if (!title || !summary || !from) {
      Logger.log("Row " + (r + 1) + " missing title/summary/from — skipping");
      skipped++;
      continue;
    }

    const payload = {
      sheetRowId: col.rowId !== -1 ? String(row[col.rowId]) : String(r + 1),
      isLegalRequest: true,
      title: title,
      description: summary,
      requesterEmail: from,
      requesterName: col.fromName !== -1 ? String(row[col.fromName] || "") : "",
      category: col.category !== -1 ? String(row[col.category] || "") : "",
      urgency: col.urgency !== -1 ? String(row[col.urgency] || "") : "",
    };

    try {
      const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + CONFIG.WEBHOOK_SECRET },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const status = response.getResponseCode();
      if (status === 200 || status === 201) {
        sheet.getRange(r + 1, syncedCol + 1).setValue(new Date().toISOString());
        sent++;
      } else {
        Logger.log("Row " + (r + 1) + " failed (" + status + "): " + response.getContentText());
        failed++;
      }
    } catch (err) {
      Logger.log("Row " + (r + 1) + " error: " + err);
      failed++;
    }
  }

  Logger.log("Sync done. sent=" + sent + " skipped=" + skipped + " failed=" + failed);
}
