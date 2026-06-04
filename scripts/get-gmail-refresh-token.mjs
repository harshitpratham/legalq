/**
 * One-time helper: authorize LegalQ against a Google Workspace mailbox
 * and print a refresh token for .env.local
 *
 * Usage:
 *   1. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (or export them)
 *   2. node scripts/get-gmail-refresh-token.mjs
 *   3. Open the URL, sign in as the LEGAL mailbox user (e.g. legal@yourdomain.org)
 *   4. Paste the code from the redirect page into the terminal
 */

import { google } from "googleapis";
import http from "http";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
const PORT = Number(process.env.OAUTH_LOCAL_PORT || "3333");
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "\nMissing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local\n"
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\n=== LegalQ Gmail setup (Google Workspace) ===\n");
console.log("1. Sign in as the mailbox that will READ and SEND legal mail");
console.log("   (e.g. legal@yourdomain.org or the shared inbox owner)\n");
console.log("2. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n3. After approving, you will be redirected to localhost.\n");

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) return;

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
    console.error("Authorization error:", error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h1>Missing code</h1>");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h1>Success</h1><p>You can close this tab and return to the terminal.</p>"
    );

    console.log("\n=== Add these to .env.local ===\n");
    console.log(`GMAIL_CLIENT_ID="${CLIENT_ID}"`);
    console.log(`GMAIL_CLIENT_SECRET="${CLIENT_SECRET}"`);
    console.log(`GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log("\nAlso set GMAIL_INBOX_EMAIL and SYSTEM_EMAIL_FROM to that mailbox address.");
    if (tokens.access_token) {
      console.log("\n(Access token received; refresh token is what LegalQ stores long-term.)");
    }
    if (!tokens.refresh_token) {
      console.warn(
        "\nWARNING: No refresh_token returned. Revoke app access at" +
          " https://myaccount.google.com/permissions and run again with prompt=consent."
      );
    }
    console.log("");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end("<h1>Token exchange failed</h1>");
    console.error(err);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for redirect on http://localhost:${PORT}/oauth2callback ...\n`);
});
