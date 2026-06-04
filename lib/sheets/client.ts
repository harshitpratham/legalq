import { google } from "googleapis";

export function getSheetsClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GMAIL_CLIENT_SECRET;
  const refreshToken =
    process.env.GOOGLE_SHEETS_REFRESH_TOKEN ?? process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Sheets credentials missing (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN or GOOGLE_SHEETS_REFRESH_TOKEN)"
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.sheets({ version: "v4", auth: oauth2 });
}

export type SheetRow = Record<string, string>;

/** First row = headers, returns array of row objects */
export async function fetchSheetRows(): Promise<SheetRow[]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE ?? "Sheet1!A:Z";

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID is not set");
  }

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const values = res.data.values;
  if (!values || values.length < 2) return [];

  const headers = values[0].map((h) =>
    String(h ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
  );

  const rows: SheetRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const row: SheetRow = {};
    const line = values[i];
    headers.forEach((header, col) => {
      if (header) row[header] = String(line[col] ?? "").trim();
    });
    row._sheet_row_number = String(i + 1);
    rows.push(row);
  }

  return rows;
}

export function rowGet(row: SheetRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/\s+/g, "_");
    const v = row[normalized] ?? row[key];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

export function rowIsLegal(row: SheetRow): boolean {
  const raw =
    rowGet(row, "islegalrequest", "is_legal_request", "legal", "is_legal") ?? "";
  const v = raw.toLowerCase();
  return v === "true" || v === "yes" || v === "1" || v === "include";
}
