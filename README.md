# LegalQ

Kanban legal request tracker. Inbound legal email arrives at `legal@prathaminternational.org`, is pushed to LegalQ via **Gmail Pub/Sub**, and mapped to tickets on a Kanban board. The legal team manages requests; status changes and comments email requesters via **Gmail** in the same thread.

## Flow

```
Requester email → legal@ inbox → Gmail Pub/Sub → POST /api/webhooks/gmail → Kanban board
                                                                                    ↓
                                                          Legal team actions → Gmail reply (same thread)
```

Sheet intake via Apps Script remains available as an optional fallback (`/api/webhooks/sheet-sync`).

## Features

- Static username/password login with **admin** and **user** roles
- Four-column Kanban: Not Started → In Progress → In Review → Complete
- **Gmail Pub/Sub** real-time inbound intake (no Sheet required)
- Gmail thread matching by `gmailThreadId`, with OpenAI fallback for same-requester follow-ups
- Gmail outbound notifications on status change and optional comments (threaded replies)

## Railway deploy

1. Connect [github.com/harshitpratham/legalq](https://github.com/harshitpratham/legalq) on [Railway](https://railway.app)
2. Add **PostgreSQL** and reference `DATABASE_URL` on the app service
3. Set variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXTAUTH_URL=https://legalq-production.up.railway.app
NEXTAUTH_SECRET=<random>
AUTH_USERS=[{"username":"admin","password":"<admin-pass>","role":"admin","name":"Legal Admin"},{"username":"user","password":"<user-pass>","role":"user","name":"Legal Viewer"}]
GMAIL_SEND_AS=legal@prathaminternational.org
GMAIL_INBOX_EMAIL=legal@prathaminternational.org
GMAIL_FROM_NAME=Pratham Legal
GMAIL_PUBSUB_TOPIC=projects/legalq-498409/topics/legalq-gmail-inbox
GMAIL_PUSH_ENDPOINT=https://legalq-production.up.railway.app/api/webhooks/gmail
CRON_SECRET=<random>
GOOGLE_SERVICE_ACCOUNT_JSON=<service-account-json>
OPENAI_API_KEY=<from-openai-platform>
OPENAI_MODEL=gpt-5.4-mini
```

4. Deploy — migrations run automatically on start
5. Register Gmail watch: `POST /api/cron/gmail-watch` with `Authorization: Bearer <CRON_SECRET>`
6. Add a **Railway Cron Job** calling that endpoint every 6 days (watch expires after ~7 days)

## Gmail inbound setup (Pub/Sub)

### 1. GCP Pub/Sub + Gmail watch

```bash
bash scripts/setup-gmail-pubsub.sh
```

This creates topic `legalq-gmail-inbox`, grants Gmail publish permission, and creates a push subscription to `/api/webhooks/gmail`.

### 2. Workspace domain-wide delegation

A **Google Workspace Super Admin** must authorize **both** scopes for client ID `117053953603379110562`:

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`

[Manage Domain Wide Delegation](https://admin.google.com/ac/owl/domainwidedelegation)

### 3. Service account

```bash
bash scripts/setup-gmail-gcloud.sh
```

Set `GOOGLE_SERVICE_ACCOUNT_JSON` on Railway from `.secrets/legalq-gmail-sender.json`.

### 4. Bootstrap watch

After deploy, trigger once:

```bash
curl -X POST https://legalq-production.up.railway.app/api/cron/gmail-watch \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Only **new** emails after watch registration are processed (no historical backfill).

## Thread matching

| Priority | Method | When |
|----------|--------|------|
| 1 | `gmailThreadId` exact match | Reply in same Gmail thread (e.g. stakeholder answers a question) |
| 2 | OpenAI `findMatchingTicket` | New thread from same requester, related topic |
| 3 | New ticket | No match |

When a matched ticket is **In Review**, a stakeholder reply moves it back to **In Progress**.

Tune the AI prompt and threshold in [`lib/ai/threadMatch.ts`](lib/ai/threadMatch.ts).

## Sheet intake (optional fallback)

Use [`scripts/apps-script-sheet-sync.gs`](scripts/apps-script-sheet-sync.gs) if you still want Sheet-based intake. See the script for setup steps.

## Local dev

```bash
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

## API

- `GET /api/health` — liveness check
- `POST /api/webhooks/gmail` — Gmail Pub/Sub push (Google JWT auth)
- `POST /api/cron/gmail-watch` — renew Gmail watch (Bearer `CRON_SECRET`)
- `POST /api/webhooks/sheet-sync` — Sheet intake fallback (Bearer auth)
- `GET /api/tickets` — list tickets (login required)
- `POST /api/tickets/[id]/transition` — move status (login required)
