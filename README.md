# LegalQ

Kanban legal request tracker. Legal emails are triaged externally (Google Sheet), pushed via **Zapier** into LegalQ, and the legal team manages tickets on a simple board. Status changes email requesters via **Resend**.

## Flow

```
Legal email → (your Sheet sync) → Google Sheet → Zapier → POST /api/webhooks/zapier → Kanban board
                                                                                              ↓
Legal team moves cards → Resend email to requester
```

## Features

- Static username/password login
- Four-column Kanban: Not Started → In Progress → In Review → Complete
- Zapier webhook for ticket intake from Google Sheet
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
ZAPIER_WEBHOOK_SECRET=<random>
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=legal@aidigest.nextayari.com
RESEND_FROM_NAME=Pratham Legal
```

4. Deploy — migrations run automatically on start

## Sheet intake (Apps Script — no Zapier, no billing)

Use [`scripts/apps-script-sheet-sync.gs`](scripts/apps-script-sheet-sync.gs) to push new legal rows from your Google Sheet straight to LegalQ, with zero Google Cloud billing required.

1. Open the Sheet → **Extensions → Apps Script**
2. Paste the contents of `scripts/apps-script-sheet-sync.gs`
3. Update `CONFIG.WEBHOOK_SECRET` to match `ZAPIER_WEBHOOK_SECRET` on Railway
4. Run `setupTrigger` once (Run ▶) and approve the permission prompt
5. Done — it runs every 5 minutes automatically and syncs any row with `isLegalRequest = TRUE`

The script tracks synced rows in a `synced_at` column it adds automatically, and LegalQ also dedupes by `sheetRowId`, so re-runs are safe.

### Zapier alternative (if you prefer it)

**Trigger:** Google Sheets → New Spreadsheet Row (filter `isLegalRequest` = true)

**Action:** Webhooks by Zapier → POST

- URL: `https://legalq-production.up.railway.app/api/webhooks/zapier`
- Header: `Authorization: ` `Bearer YOUR_ZAPIER_WEBHOOK_SECRET`
- Payload type: **Json**
- Body fields: `sheetRowId`, `title`, `description` (from `summary`), `requesterEmail` (from `from`), `category`, `urgency`, `requesterName`, `isLegalRequest`

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
- `GET /api/webhooks/zapier` — webhook info
- `POST /api/webhooks/zapier` — Zapier intake (Bearer auth)
- `GET /api/tickets` — list tickets (login required)
- `POST /api/tickets/[id]/transition` — move status (login required)
