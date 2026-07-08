# LegalQ

Kanban legal request tracker. Legal emails are triaged externally (Google Sheet), pushed via a **Google Apps Script** into LegalQ (no Zapier), and the legal team manages tickets on a simple board. Status changes email requesters via **Resend**.

## Flow

```
Legal email → (your Sheet sync) → Google Sheet → Apps Script (5 min timer) → POST /api/webhooks/sheet-sync → Kanban board
                                                                                                                      ↓
                                                                        Legal team moves cards → Resend email to requester
```

## Features

- Static username/password login
- Four-column Kanban: Not Started → In Progress → In Review → Complete
- Google Apps Script webhook for ticket intake from Google Sheet (free, no Zapier, no GCP billing)
- Resend notifications on status change and optional comments

## Railway deploy

1. Connect [github.com/harshitpratham/legalq](https://github.com/harshitpratham/legalq) on [Railway](https://railway.app)
2. Add **PostgreSQL** and reference `DATABASE_URL` on the app service
3. Set variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXTAUTH_URL=https://legalq-production.up.railway.app
NEXTAUTH_SECRET=<random>
AUTH_USERNAME=admin
AUTH_PASSWORD=<strong-password>
AUTH_DISPLAY_NAME=Legal Team
SHEET_WEBHOOK_SECRET=<random>
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=legal@aidigest.nextayari.com
RESEND_FROM_NAME=Pratham Legal
```

4. Deploy — migrations run automatically on start

## Sheet intake (Apps Script)

Use [`scripts/apps-script-sheet-sync.gs`](scripts/apps-script-sheet-sync.gs) to push new legal rows from your Google Sheet straight to LegalQ — free, runs on your Google account, no Zapier and no Google Cloud billing required.

1. Open the Sheet → **Extensions → Apps Script**
2. Paste the contents of `scripts/apps-script-sheet-sync.gs`
3. Update `CONFIG.WEBHOOK_SECRET` to match `SHEET_WEBHOOK_SECRET` on Railway
4. Run `setupTrigger` once (Run ▶) and approve the permission prompt
5. Done — it runs every 5 minutes automatically and syncs any row with `isLegalRequest = TRUE`

The script tracks synced rows in a `synced_at` column it adds automatically, and LegalQ also dedupes by `sheetRowId`, so re-runs are safe.

## Resend setup

1. Add domain `aidigest.nextayari.com` in [Resend](https://resend.com)
2. Verify DNS records
3. Create API key → `RESEND_API_KEY`
4. Set `RESEND_FROM_EMAIL` to a verified address on that domain

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
