# LegalQ

Kanban legal request tracker for Pratham International's legal team. Incoming Gmail messages are triaged with AWS Bedrock (Claude) and become tickets. Status changes trigger automated stakeholder emails from a system mailbox.

## Features

- Four-column Kanban: Not Started → In Progress → In Review → Complete
- Gmail inbox polling with AI triage (agreements, data protection, other)
- Automatic ticket creation and "request received" notifications
- Status transition emails to requesters (in-thread)
- Stakeholder reply ingestion with agent notification
- 7-day idle reminders for open tickets
- Google OAuth for legal team login

## Setup

1. Copy `.env.example` to `.env.local` and fill in values.
2. Start Postgres and set `DATABASE_URL`.
3. Run migrations:

```bash
npm run db:generate
npm run db:migrate
```

4. Configure Google Cloud OAuth (Web client) with redirect URI:
   `http://localhost:3000/api/auth/callback/google`

5. For Gmail (Google Workspace), see [Google Workspace email setup](#google-workspace-email-setup) below.

6. Configure AWS Bedrock access for Claude model in your region.

7. Run the dev server:

```bash
npm run dev
```

## Cron endpoints

Protect with `Authorization: Bearer $CRON_SECRET`:

- `GET /api/cron/poll-inbox` — ingest new emails every 10 min (see `vercel.json`)
- `GET /api/cron/reminders` — daily idle reminders

## Google Workspace email setup

LegalQ reads the legal inbox and sends notifications from a **system mailbox** (e.g. `legal@yourdomain.org`) using one Google account’s refresh token.

### A. Google Cloud (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) (use your org’s project or create **LegalQ**).
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen**
   - User type: **Internal** (only your Workspace users) if you’re on Google Workspace.
   - App name: `LegalQ`, support email: your admin email.
   - Scopes: add Gmail scopes (readonly, send, modify) — the setup script requests them automatically.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - **Authorized redirect URIs** (add both):
     - `http://localhost:3000/api/auth/callback/google` (app login)
     - `http://localhost:3333/oauth2callback` (Gmail token script)
5. Copy **Client ID** and **Client secret** into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### B. Workspace mailbox

Choose one approach:

| Approach | Best for |
|----------|----------|
| **Dedicated user** `legal@yourdomain.org` | Clean separation; all system mail from legal@ |
| **User inbox** (e.g. pragya@…) | Pilot only; reads that user’s inbox |

For production, use a **dedicated Google Workspace user** or **group** with a license so the account can sign in for OAuth.

Optional: forward request emails to `legal@…` or use that address on forms so everything lands in one inbox.

### C. Workspace admin (if OAuth is blocked)

If users see “This app is blocked”:

1. [Admin console](https://admin.google.com) → **Security → Access and data control → API controls**
2. **Manage app access** → configure **Trusted** for your OAuth app (Client ID from step A).
3. Or allow **Internal** apps for the domain under OAuth consent settings.

### D. Get refresh token (LegalQ mailbox)

Sign in as the **mailbox that will read and send** (not necessarily the same as who logs into the Kanban UI).

```bash
# Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are in .env.local
npm run gmail:setup
```

Open the printed URL, approve access, then copy the printed `GMAIL_REFRESH_TOKEN` into `.env.local`.

### E. `.env.local` email section

```env
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="...."

GMAIL_CLIENT_ID="${same as GOOGLE_CLIENT_ID}"
GMAIL_CLIENT_SECRET="${same as GOOGLE_CLIENT_SECRET}"
GMAIL_REFRESH_TOKEN="...."
GMAIL_INBOX_EMAIL="legal@yourdomain.org"

SYSTEM_EMAIL_FROM="legal@yourdomain.org"
SYSTEM_EMAIL_FROM_NAME="Pratham Legal"
LEGAL_TEAM_NOTIFY_EMAIL="pragya@yourdomain.org"
```

### F. Test locally

```bash
npm run dev
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/poll-inbox
```

Send a test email **to** `GMAIL_INBOX_EMAIL` with subject like “Agreement review needed”. Within a minute (after cron) or immediately via curl, a ticket should appear on the board.

### How it behaves

- **Read**: unread messages in the connected account’s inbox (optionally filtered by `GMAIL_INBOX_EMAIL` in the query).
- **Send**: status emails go **from** `SYSTEM_EMAIL_FROM`, in the same Gmail **thread** as the original request.
- **Login**: separate flow — legal team signs in with Google on `/login` (can use the same OAuth client).

## Deploy on Railway

Repo: [github.com/harshitpratham/legalq](https://github.com/harshitpratham/legalq)

1. Push this project to GitHub and connect the repo in [Railway](https://railway.app).
2. Add a **PostgreSQL** plugin; Railway sets `DATABASE_URL` automatically.
3. Set environment variables from `.env.example` (at minimum `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `CRON_SECRET`).
4. Set `NEXTAUTH_URL` to your Railway public URL (e.g. `https://legalq-production.up.railway.app`).
5. In Google Cloud OAuth redirect URIs, add: `https://YOUR-RAILWAY-URL/api/auth/callback/google`
6. Deploy — `railway.toml` runs migrations on start.

**Cron on Railway:** use [Railway cron](https://docs.railway.app/guides/cron-jobs) or an external scheduler to call every 5–10 minutes:

- `GET https://YOUR-URL/api/cron/poll-sheet` (Google Sheet intake)
- `GET https://YOUR-URL/api/cron/poll-inbox` (Gmail intake, optional)

Header: `Authorization: Bearer YOUR_CRON_SECRET`

## Read directly from Google Sheet (no Zapier)

Yes — LegalQ can poll the sheet on a schedule.

1. Enable **Google Sheets API** in the same Cloud project.
2. Re-run `npm run gmail:setup` (scopes now include `spreadsheets.readonly`) or add that scope to your refresh token.
3. Share the spreadsheet with the Google account that owns the refresh token (Editor or Viewer).
4. Set in `.env`:

```env
GOOGLE_SHEETS_ID="abc123..."   # from URL: docs.google.com/spreadsheets/d/{THIS_ID}/edit
GOOGLE_SHEETS_RANGE="Sheet1!A:Z"
```

5. First row must be headers, e.g. `row_id`, `isLegalRequest`, `title`, `summary`, `category`, `urgency`, `from`, `from_name`
6. Trigger ingest:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-URL/api/cron/poll-sheet
```

Use **either** Sheet poll **or** Zapier **or** Gmail poll — not all three on the same emails, or you will get duplicates.

| Method | Best when |
|--------|-----------|
| **poll-sheet** | Gemini already writes legal rows to a Sheet |
| **Zapier webhook** | You want instant push per row, no cron |
| **poll-inbox** | Email → Bedrock triage inside LegalQ |

## Google Sheet → Zapier → LegalQ

Use this when Gemini (or Apps Script) writes **legal=true** rows to a Sheet and Zapier pushes new rows into LegalQ.

### 1. Google Sheet columns (example)

| Column | Example | Maps to API field |
|--------|---------|-------------------|
| A `row_id` | `sheet-42` | `sheetRowId` (dedupe) |
| B `isLegalRequest` | `TRUE` | must be true or row is skipped |
| C `title` | Vendor NDA review | `title` |
| D `summary` | Need review by Friday | `description` |
| E `category` | AGREEMENT | `category` |
| F `urgency` | HIGH | `urgency` |
| G `from` | angel@org.org | `requesterEmail` |
| H `from_name` | Angel | `requesterName` |
| I `message_id` | Gmail msg id | `gmailMessageId` (optional) |
| J `thread_id` | Gmail thread id | `gmailThreadId` (optional) |

### 2. LegalQ env

```env
ZAPIER_WEBHOOK_SECRET="your-long-random-secret"
```

### 3. Zapier Zap

1. **Trigger:** Google Sheets — *New or Updated Spreadsheet Row* (filter: `isLegalRequest` = true, or only append legal rows).
2. **Action:** Webhooks by Zapier — *POST*
   - **URL:** `https://your-legalq-domain.com/api/webhooks/zapier`
   - **Headers:**
     - `Authorization`: `Bearer YOUR_ZAPIER_WEBHOOK_SECRET`
     - `Content-Type`: `application/json`
   - **Body (JSON):** map sheet columns:

```json
{
  "sheetRowId": "{{Row ID}}",
  "isLegalRequest": "{{isLegalRequest}}",
  "title": "{{title}}",
  "description": "{{summary}}",
  "category": "{{category}}",
  "urgency": "{{urgency}}",
  "requesterEmail": "{{from}}",
  "requesterName": "{{from_name}}",
  "gmailMessageId": "{{message_id}}",
  "gmailThreadId": "{{thread_id}}"
}
```

3. Test the Zap; you should get `201` and a ticket on `/board`.

**Dedupe:** Same `sheetRowId` or `gmailMessageId` won’t create duplicate tickets.

**Requester email:** If `gmailMessageId` + `gmailThreadId` are set and Gmail is configured, LegalQ can send “request received” automatically.

### 4. Local test

```bash
curl -X POST http://localhost:3000/api/webhooks/zapier \
  -H "Authorization: Bearer YOUR_ZAPIER_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "sheetRowId": "test-1",
    "isLegalRequest": true,
    "title": "Test agreement review",
    "description": "Please review vendor contract.",
    "category": "AGREEMENT",
    "urgency": "MEDIUM",
    "requesterEmail": "requester@example.com",
    "requesterName": "Test User"
  }'
```

## Manual ticket creation

`POST /api/tickets` with `{ title, description, requesterEmail, category?, urgency? }` (requires Google login session)
