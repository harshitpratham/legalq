# LegalQ

Kanban legal request tracker. Legal emails are triaged externally (Google Sheet), pushed via a **Google Apps Script** into LegalQ (no Zapier), and the legal team manages tickets on a simple board. Status changes email requesters via **Gmail** (`legal@prathaminternational.org`).

## Flow

```
Legal email → (your Sheet sync) → Google Sheet → Apps Script (5 min timer) → POST /api/webhooks/sheet-sync → Kanban board
                                                                                                                      ↓
                                                                        Legal team moves cards → Gmail email to requester
```

## Features

- Static username/password login with **admin** and **user** roles
- Four-column Kanban: Not Started → In Progress → In Review → Complete
- Google Apps Script webhook for ticket intake from Google Sheet (free, no Zapier, no GCP billing)
- Gmail notifications on status change and optional comments

## Railway deploy

1. Connect [github.com/harshitpratham/legalq](https://github.com/harshitpratham/legalq) on [Railway](https://railway.app)
2. Add **PostgreSQL** and reference `DATABASE_URL` on the app service
3. Set variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXTAUTH_URL=https://legalq-production.up.railway.app
NEXTAUTH_SECRET=<random>
AUTH_USERNAME=admin
AUTH_PASSWORD=<strong-admin-password>
AUTH_DISPLAY_NAME=Legal Admin
AUTH_USER_USERNAME=user
AUTH_USER_PASSWORD=<strong-user-password>
AUTH_USER_DISPLAY_NAME=Legal Viewer
SHEET_WEBHOOK_SECRET=<random>
GMAIL_SEND_AS=legal@prathaminternational.org
GMAIL_FROM_NAME=Pratham Legal
GOOGLE_SERVICE_ACCOUNT_JSON=<service-account-json>
OPENAI_API_KEY=<from-openai-platform>
OPENAI_MODEL=gpt-5.4-mini
```

4. Deploy — migrations run automatically on start

## Users and roles

LegalQ uses simple username/password auth (no Google login).

| Role | Access |
|------|--------|
| **admin** | View board, move tickets, add comments, email requesters |
| **user** | View board and ticket details only (read-only) |

Configure accounts with `AUTH_USERS` (JSON) on Railway:

```env
AUTH_USERS=[{"username":"admin","password":"<admin-pass>","role":"admin","name":"Legal Admin"},{"username":"user","password":"<user-pass>","role":"user","name":"Legal Viewer"}]
```

If `AUTH_USERS` is not set, LegalQ falls back to `AUTH_USERNAME` / `AUTH_PASSWORD` (admin) and `AUTH_USER_USERNAME` / `AUTH_USER_PASSWORD` (user).

## Sheet intake (Apps Script)

Use [`scripts/apps-script-sheet-sync.gs`](scripts/apps-script-sheet-sync.gs) to push new legal rows from your Google Sheet straight to LegalQ — free, runs on your Google account, no Zapier and no Google Cloud billing required.

1. Open the Sheet → **Extensions → Apps Script**
2. Paste the contents of `scripts/apps-script-sheet-sync.gs`
3. Update `CONFIG.WEBHOOK_SECRET` to match `SHEET_WEBHOOK_SECRET` on Railway
4. Run `setupTrigger` once (Run ▶) and approve the permission prompt
5. Done — it runs every 5 minutes automatically and syncs any row with `isLegalRequest = TRUE`

The script tracks synced rows in a `synced_at` column it adds automatically, and LegalQ also dedupes by `sheetRowId`, so re-runs are safe.

## Thread matching

When `OPENAI_API_KEY` is set, LegalQ uses OpenAI to detect when a new Sheet row is a **continuation** of an existing open ticket (same email thread / follow-up) instead of creating a duplicate card.

**Recommended model:** `gpt-5.4-mini` — OpenAI's newest mini model (2026), built for classification, structured JSON, and high-volume tasks. Fast, cheap, and strong at instruction following. Use `reasoning_effort: none` so it skips deep reasoning (this is a simple match/no-match decision, not a complex agent task).

| Model | When to use |
|-------|-------------|
| **`gpt-5.4-mini`** (default) | Best choice — newest mini, reliable structured output, low cost |
| `gpt-4.1-mini` | Older/cheaper fallback if you already use it elsewhere |
| `gpt-5.4` | Higher accuracy if you see wrong merges — costs more |
| `gpt-5.5` | Overkill for this; only if quality is still insufficient |

1. Exact dedupe on `sheetRowId` / `externalId` (unchanged)
2. Load up to 20 open tickets from the same `requesterEmail`
3. OpenAI compares the new row's title/description against those candidates
4. If confidence ≥ **0.7**, the row is appended to the matched ticket's Conversation panel
5. If the matched ticket was **In Review**, it moves back to **In Progress** (stakeholder replied)
6. If OpenAI is unavailable, the key is unset, or confidence is low → a new ticket is created (safe fallback)

Tune the prompt and threshold in [`lib/ai/threadMatch.ts`](lib/ai/threadMatch.ts).

**Limitation:** matching only considers tickets from the same `requesterEmail`. A reply from a different CC'd participant on the same thread will not match today.

```env
OPENAI_API_KEY=""          # from platform.openai.com — optional
OPENAI_MODEL="gpt-5.4-mini"
```

## Gmail setup

Outbound emails are sent from `legal@prathaminternational.org` via the **Gmail API**.

### Automated GCP setup (gcloud)

From the repo root:

```bash
bash scripts/setup-gmail-gcloud.sh
```

This enables the Gmail API, creates service account `legalq-gmail-sender`, and saves the JSON key to `.secrets/legalq-gmail-sender.json`.

Or run the steps manually:

```bash
gcloud config set project legalq-498409
gcloud services enable gmail.googleapis.com
gcloud iam service-accounts create legalq-gmail-sender --display-name="LegalQ Gmail Sender"
gcloud iam service-accounts keys create .secrets/legalq-gmail-sender.json \
  --iam-account=legalq-gmail-sender@legalq-498409.iam.gserviceaccount.com
```

### One manual step — Workspace domain-wide delegation

gcloud cannot authorize domain-wide delegation. A **Google Workspace Super Admin** must do this once:

1. Open [Manage Domain Wide Delegation](https://admin.google.com/ac/owl/domainwidedelegation)
2. **Add new**
3. **Client ID:** `117053953603379110562`
4. **OAuth scope:** `https://www.googleapis.com/auth/gmail.send`
5. **Authorize**

### Railway env vars

```env
GMAIL_SEND_AS=legal@prathaminternational.org
GMAIL_FROM_NAME=Pratham Legal
GOOGLE_SERVICE_ACCOUNT_JSON=<paste full contents of .secrets/legalq-gmail-sender.json>
```

The service account impersonates `legal@prathaminternational.org` to send mail.

### Option B — OAuth refresh token (simpler, one mailbox)

1. Create OAuth credentials (Web application) in Google Cloud Console
2. Authorize the `legal@prathaminternational.org` account once and obtain a refresh token
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `GMAIL_SEND_AS`

## Local dev

```bash
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

## API

- `GET /api/health` — liveness check
- `GET /api/webhooks/sheet-sync` — webhook info
- `POST /api/webhooks/sheet-sync` — Sheet intake (Bearer auth, called by Apps Script)
- `GET /api/tickets` — list tickets (login required)
- `POST /api/tickets/[id]/transition` — move status (login required)
